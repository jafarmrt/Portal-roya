import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { isValidJalaliDate, toJalali, toPersianDigits } from '../../shared/jalali.js';
import { featureVisible } from '../../shared/features.js';
import {
  addJalaliDays,
  dayOfMonth,
  nextDueDate,
  TODO_NOTE_MAX,
  TODO_OPEN_LIMIT,
  TODO_REMIND_HOUR,
  TODO_REMINDERS,
  TODO_REPEATS,
  TODO_SOURCES,
  TODO_STEP_MAX,
  TODO_STEPS_MAX,
  TODO_TITLE_MAX,
  type TodoRemind,
} from '../../shared/todos.js';
import { db } from '../db/index.js';
import { employees, personalTodos } from '../db/schema.js';
import { signalUser } from '../events.js';
import { featureConfig } from '../features.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { createNotifications } from '../notify.js';

// «یادداشت‌های من»: every request reads and changes only the signed-in person's own notes.

export const todosRouter = Router();

type TodoRow = typeof personalTodos.$inferSelect;

const serializeTodo = (t: TodoRow) => ({
  id: t.id,
  title: t.title,
  note: t.note,
  dueDate: t.dueDate,
  important: t.important,
  repeat: t.repeat,
  remind: t.remind,
  steps: t.steps,
  sourceType: t.sourceType,
  sourceId: t.sourceId,
  doneAt: t.doneAt?.toISOString() ?? null,
  archivedAt: t.archivedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
});

const title = z.string().trim().min(1, 'عنوان را بنویسید.').max(TODO_TITLE_MAX);
const note = z.string().trim().max(TODO_NOTE_MAX);
// Every note has a due date; notes from before it became required keep theirs empty until given one.
const dueDate = z.string({ error: 'تاریخ سررسید را انتخاب کنید.' }).refine(isValidJalaliDate, 'تاریخ سررسید را درست وارد کنید.');
const sourceTypes = TODO_SOURCES.map((s) => s.type) as [string, ...string[]];
const repeat = z.enum(TODO_REPEATS.map((r) => r.id) as [TodoRepeatId, ...TodoRepeatId[]]).nullable();
const remind = z.enum(TODO_REMINDERS.map((r) => r.id) as [TodoRemind, ...TodoRemind[]]);
const steps = z
  .array(
    z.object({
      id: z.string().min(1).max(50).optional(),
      text: z.string().trim().min(1, 'گام خالی را پاک کنید.').max(TODO_STEP_MAX),
      done: z.boolean().default(false),
    }),
  )
  .max(TODO_STEPS_MAX, `حداکثر ${TODO_STEPS_MAX} گام`);

const createSchema = z.object({
  title,
  note: note.optional(),
  dueDate,
  important: z.boolean().optional(),
  repeat: repeat.optional(),
  remind: remind.optional(),
  steps: steps.optional(),
  source: z.object({ type: z.enum(sourceTypes), id: z.string().min(1).max(100) }).optional(),
});

const updateSchema = z.object({
  title: title.optional(),
  note: note.optional(),
  dueDate: dueDate.optional(),
  important: z.boolean().optional(),
  repeat: repeat.optional(),
  remind: remind.optional(),
  steps: steps.optional(),
  done: z.boolean().optional(),
  // Only a done note can be archived; taking it out of the archive puts it back on the page, still done.
  archived: z.boolean().optional(),
});

const archiveSchema = z.object({ ids: z.array(z.string().min(1).max(100)).max(1000).optional() });

type TodoRepeatId = (typeof TODO_REPEATS)[number]['id'];

const withIds = (list: z.infer<typeof steps>) => list.map((step) => ({ id: step.id ?? newId('step'), text: step.text, done: step.done }));

/**
 * A reminder is for notes written before it went out. Setting a date whose reminder morning has
 * already come (today after 08:00, or a day already past) marks that reminder as sent: the person
 * just wrote it. Returns the reminded-on days for the morning of the due date and the morning before.
 */
function remindersFor(due: string | null, now = new Date()) {
  if (!due) return { remindedOn: null, remindedBeforeOn: null };
  const today = toJalali(now);
  const passed = (morning: string) => morning < today || (morning === today && now.getHours() >= TODO_REMIND_HOUR);
  return {
    remindedOn: passed(due) ? today : null,
    remindedBeforeOn: passed(addJalaliDays(due, -1)) ? today : null,
  };
}

async function ownTodo(userId: string, id: string) {
  const [row] = await db.select().from(personalTodos).where(and(eq(personalTodos.id, id), eq(personalTodos.userId, userId)));
  if (!row) throw new HttpError(404, 'این یادداشت پیدا نشد.');
  return row;
}

todosRouter.get(
  '/todos',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db
      .select()
      .from(personalTodos)
      .where(and(eq(personalTodos.userId, viewer.id), isNull(personalTodos.archivedAt)))
      .orderBy(asc(personalTodos.createdAt));
    res.json(rows.map(serializeTodo));
  }),
);

// «آرشیو»: the done notes the person put away, newest first. Read only when the archive is opened.
todosRouter.get(
  '/todos/archive',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db
      .select()
      .from(personalTodos)
      .where(and(eq(personalTodos.userId, viewer.id), isNotNull(personalTodos.archivedAt)))
      .orderBy(desc(personalTodos.archivedAt), desc(personalTodos.doneAt));
    res.json(rows.map(serializeTodo));
  }),
);

// Archives the person's done notes on the page: all of them, or only the ones named (a day's card).
todosRouter.post(
  '/todos/archive',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(archiveSchema, req.body ?? {});
    if (input.ids && input.ids.length === 0) return void res.json({ archived: 0 });
    const archived = await db
      .update(personalTodos)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(personalTodos.userId, viewer.id),
          isNotNull(personalTodos.doneAt),
          isNull(personalTodos.archivedAt),
          input.ids ? inArray(personalTodos.id, input.ids) : undefined,
        ),
      )
      .returning({ id: personalTodos.id });
    if (archived.length) signalUser(viewer.id, 'todos');
    res.json({ archived: archived.length });
  }),
);

todosRouter.post(
  '/todos',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(createSchema, req.body);
    const open = await db
      .select({ id: personalTodos.id, sourceType: personalTodos.sourceType, sourceId: personalTodos.sourceId })
      .from(personalTodos)
      .where(and(eq(personalTodos.userId, viewer.id), isNull(personalTodos.doneAt)));
    if (open.length >= TODO_OPEN_LIMIT) {
      throw new HttpError(400, `بیش از ${TODO_OPEN_LIMIT} یادداشت باز نمی‌توان داشت؛ یادداشت‌های انجام‌شده را تیک بزنید یا پاک کنید.`);
    }
    if (input.source && open.some((t) => t.sourceType === input.source!.type && t.sourceId === input.source!.id)) {
      throw new HttpError(409, 'این مورد از قبل در یادداشت‌های شماست.');
    }
    const [row] = await db
      .insert(personalTodos)
      .values({
        id: newId('todo'),
        userId: viewer.id,
        title: input.title,
        note: input.note ?? '',
        dueDate: input.dueDate,
        important: input.important ?? false,
        repeat: input.repeat ?? null,
        repeatDay: input.repeat === 'monthly' && input.dueDate ? dayOfMonth(input.dueDate) : null,
        remind: input.remind ?? 'day',
        steps: withIds(input.steps ?? []),
        sourceType: input.source?.type ?? null,
        sourceId: input.source?.id ?? null,
        ...remindersFor(input.dueDate),
      })
      .returning();
    signalUser(viewer.id, 'todos');
    res.status(201).json(serializeTodo(row));
  }),
);

/**
 * Whether the next note of a repeating one is still exactly as it was written when the earlier one was
 * ticked off. Un-ticking takes back only such a note; one the person edited or worked on stays.
 */
function isUnchangedCopy(next: TodoRow, from: TodoRow, due: string) {
  const texts = (steps: TodoRow['steps']) => JSON.stringify(steps.map((step) => step.text));
  return (
    next.title === from.title &&
    next.note === from.note &&
    next.dueDate === due &&
    next.important === from.important &&
    next.repeat === from.repeat &&
    next.remind === from.remind &&
    texts(next.steps) === texts(from.steps) &&
    next.steps.every((step) => !step.done)
  );
}

todosRouter.patch(
  '/todos/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(updateSchema, req.body);
    const existing = await ownTodo(viewer.id, req.params.id);
    const changes: Partial<TodoRow> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.note !== undefined) changes.note = input.note;
    if (input.important !== undefined) changes.important = input.important;
    if (input.remind !== undefined) changes.remind = input.remind;
    if (input.repeat !== undefined) changes.repeat = input.repeat;
    if (input.steps !== undefined) changes.steps = withIds(input.steps);
    if (input.dueDate !== undefined && input.dueDate !== existing.dueDate) {
      changes.dueDate = input.dueDate;
      Object.assign(changes, remindersFor(input.dueDate));
    }
    const repeatAfter = changes.repeat !== undefined ? changes.repeat : existing.repeat;
    const dueAfter = changes.dueDate !== undefined ? changes.dueDate : existing.dueDate;
    if (repeatAfter && !dueAfter) {
      throw new HttpError(400, 'یادداشت تکراری تاریخ سررسید می‌خواهد.');
    }
    // A monthly note keeps the day it is set for; choosing a new date (or making it monthly) sets that day.
    if (repeatAfter !== 'monthly') {
      if (existing.repeatDay !== null) changes.repeatDay = null;
    } else if (changes.dueDate !== undefined || existing.repeat !== 'monthly' || existing.repeatDay === null) {
      changes.repeatDay = dayOfMonth(dueAfter!);
    }
    const ticked = input.done === true && !existing.doneAt;
    const unticked = input.done === false && Boolean(existing.doneAt);
    if (ticked) changes.doneAt = new Date();
    // A note brought back to open is on the page again, never left in the archive.
    if (unticked) Object.assign(changes, { doneAt: null, archivedAt: null });
    const doneAfter = ticked || (Boolean(existing.doneAt) && !unticked);
    if (input.archived === true && !existing.archivedAt) {
      if (!doneAfter) throw new HttpError(400, 'فقط یادداشت انجام‌شده بایگانی می‌شود.');
      changes.archivedAt = new Date();
    }
    if (input.archived === false && existing.archivedAt && !unticked) changes.archivedAt = null;
    const row = await db.transaction(async (tx) => {
      const [updated] = Object.keys(changes).length
        ? await tx.update(personalTodos).set(changes).where(eq(personalTodos.id, existing.id)).returning()
        : [existing];
      // A repeating note writes its next one when ticked off (unless that one is still there from an
      // earlier tick), and takes it back when un-ticked if the person has not changed it since.
      const following = ticked || unticked
        ? await tx
            .select()
            .from(personalTodos)
            .where(and(eq(personalTodos.userId, viewer.id), eq(personalTodos.previousId, existing.id), isNull(personalTodos.doneAt)))
        : [];
      if (ticked && updated.repeat && updated.dueDate && following.length === 0) {
        const due = nextDueDate(updated.dueDate, updated.repeat, toJalali(updated.doneAt ?? new Date()), updated.repeatDay);
        await tx.insert(personalTodos).values({
          id: newId('todo'),
          userId: viewer.id,
          title: updated.title,
          note: updated.note,
          dueDate: due,
          important: updated.important,
          repeat: updated.repeat,
          repeatDay: updated.repeatDay,
          remind: updated.remind,
          steps: updated.steps.map((step) => ({ ...step, id: newId('step'), done: false })),
          sourceType: updated.sourceType,
          sourceId: updated.sourceId,
          previousId: updated.id,
          ...remindersFor(due),
        });
      }
      if (unticked && existing.repeat && existing.dueDate && existing.doneAt) {
        const due = nextDueDate(existing.dueDate, existing.repeat, toJalali(existing.doneAt), existing.repeatDay);
        const untouched = following.filter((next) => isUnchangedCopy(next, existing, due)).map((next) => next.id);
        if (untouched.length > 0) await tx.delete(personalTodos).where(inArray(personalTodos.id, untouched));
      }
      return updated;
    });
    signalUser(viewer.id, 'todos');
    res.json(serializeTodo(row));
  }),
);

// Empties «آرشیو» for good; notes on the page are not touched.
todosRouter.delete(
  '/todos/archive',
  route(async (req, res) => {
    const viewer = currentUser(req);
    await db.delete(personalTodos).where(and(eq(personalTodos.userId, viewer.id), isNotNull(personalTodos.archivedAt)));
    signalUser(viewer.id, 'todos');
    res.status(204).end();
  }),
);

todosRouter.delete(
  '/todos/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await ownTodo(viewer.id, req.params.id);
    await db.delete(personalTodos).where(eq(personalTodos.id, existing.id));
    signalUser(viewer.id, 'todos');
    res.status(204).end();
  }),
);

const shorten = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * From 08:00, one notification per person listing their notes due today and, for notes that asked
 * for it, those due tomorrow. Each reminder goes out once; nobody is reminded while the part is hidden
 * from them. Returns how many people were reminded.
 */
export async function processTodoReminders(now = new Date()) {
  if (now.getHours() < TODO_REMIND_HOUR) return 0;
  const today = toJalali(now);
  const tomorrow = addJalaliDays(today, 1);
  const due = await db
    .select({ id: personalTodos.id, userId: personalTodos.userId, dueDate: personalTodos.dueDate, role: employees.role })
    .from(personalTodos)
    .innerJoin(employees, eq(employees.id, personalTodos.userId))
    .where(
      and(
        or(
          and(eq(personalTodos.dueDate, today), isNull(personalTodos.remindedOn), ne(personalTodos.remind, 'none')),
          and(eq(personalTodos.dueDate, tomorrow), isNull(personalTodos.remindedBeforeOn), eq(personalTodos.remind, 'both')),
        ),
        isNull(personalTodos.doneAt),
        eq(employees.isActive, true),
        eq(employees.hasAccount, true),
      ),
    );
  if (due.length === 0) return 0;
  const config = await featureConfig();
  const visible = due.filter((t) => featureVisible(config, 'todos', { id: t.userId, role: t.role }));
  if (visible.length === 0) return 0;
  // Claimed first, so a second server tick or a restart does not remind twice.
  const returning = { id: personalTodos.id, userId: personalTodos.userId, title: personalTodos.title, createdAt: personalTodos.createdAt };
  const idsDue = (day: string) => visible.filter((t) => t.dueDate === day).map((t) => t.id);
  const claimedToday = idsDue(today).length
    ? await db
        .update(personalTodos)
        .set({ remindedOn: today })
        .where(and(inArray(personalTodos.id, idsDue(today)), isNull(personalTodos.remindedOn)))
        .returning(returning)
    : [];
  const claimedTomorrow = idsDue(tomorrow).length
    ? await db
        .update(personalTodos)
        .set({ remindedBeforeOn: today })
        .where(and(inArray(personalTodos.id, idsDue(tomorrow)), isNull(personalTodos.remindedBeforeOn)))
        .returning(returning)
    : [];
  type Claimed = (typeof claimedToday)[number];
  const byUser = new Map<string, { today: Claimed[]; tomorrow: Claimed[] }>();
  const oldestFirst = (a: Claimed, b: Claimed) => a.createdAt.getTime() - b.createdAt.getTime();
  for (const [when, list] of [['today', claimedToday], ['tomorrow', claimedTomorrow]] as const) {
    for (const t of [...list].sort(oldestFirst)) {
      const entry = byUser.get(t.userId) ?? { today: [], tomorrow: [] };
      entry[when].push(t);
      byUser.set(t.userId, entry);
    }
  }
  const titles = (list: Claimed[]) => list.map((t) => shorten(t.title, 40)).join('، ');
  for (const [userId, { today: now, tomorrow: next }] of byUser) {
    const count = now.length + next.length;
    const title =
      count === 1
        ? `یادآوری یادداشت ${now.length ? 'امروز' : 'فردا'}: ${shorten((now[0] ?? next[0]).title)}`
        : now.length && next.length
          ? `${toPersianDigits(count)} یادداشت امروز و فردا سررسید دارد`
          : `${toPersianDigits(count)} یادداشت ${now.length ? 'امروز' : 'فردا'} سررسید دارد`;
    const message =
      count === 1
        ? `سررسید این یادداشت ${now.length ? 'امروز' : 'فردا'} است.`
        : [now.length ? `امروز: ${titles(now)}` : '', next.length ? `فردا: ${titles(next)}` : ''].filter(Boolean).join(' · ');
    await createNotifications([userId], { title, message, type: 'todo', linkTab: 'dashboard' });
  }
  return byUser.size;
}
