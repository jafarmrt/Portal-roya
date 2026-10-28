import { and, asc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { JALALI_DATE_RE, toJalali, toPersianDigits } from '../../shared/jalali.js';
import { featureVisible } from '../../shared/features.js';
import {
  TODO_KEEP_DONE_DAYS,
  TODO_NOTE_MAX,
  TODO_OPEN_LIMIT,
  TODO_REMIND_HOUR,
  TODO_SOURCES,
  TODO_TITLE_MAX,
} from '../../shared/todos.js';
import { db } from '../db/index.js';
import { employees, personalTodos } from '../db/schema.js';
import { signalUser } from '../events.js';
import { featureConfig } from '../features.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { createNotifications } from '../notify.js';

// «یادداشت کارهای من»: every request reads and changes only the signed-in person's own notes.

export const todosRouter = Router();

type TodoRow = typeof personalTodos.$inferSelect;

const serializeTodo = (t: TodoRow) => ({
  id: t.id,
  title: t.title,
  note: t.note,
  dueDate: t.dueDate,
  sourceType: t.sourceType,
  sourceId: t.sourceId,
  doneAt: t.doneAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
});

const title = z.string().trim().min(1, 'عنوان را بنویسید.').max(TODO_TITLE_MAX);
const note = z.string().trim().max(TODO_NOTE_MAX);
const dueDate = z.string().regex(JALALI_DATE_RE, 'تاریخ نامعتبر است.').nullable();
const sourceTypes = TODO_SOURCES.map((s) => s.type) as [string, ...string[]];

const createSchema = z.object({
  title,
  note: note.optional(),
  dueDate: dueDate.optional(),
  source: z.object({ type: z.enum(sourceTypes), id: z.string().min(1).max(100) }).optional(),
});

const updateSchema = z.object({
  title: title.optional(),
  note: note.optional(),
  dueDate: dueDate.optional(),
  done: z.boolean().optional(),
});

/**
 * The morning reminder is for notes that are due today and were written before it went out. A note
 * set for today after that hour, or for a day already past, is not reminded about: the person just
 * wrote it.
 */
function remindedOnFor(due: string | null, now = new Date()) {
  if (!due) return null;
  const today = toJalali(now);
  return due < today || (due === today && now.getHours() >= TODO_REMIND_HOUR) ? today : null;
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
      .where(eq(personalTodos.userId, viewer.id))
      .orderBy(asc(personalTodos.createdAt));
    res.json(rows.map(serializeTodo));
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
      throw new HttpError(400, `بیش از ${TODO_OPEN_LIMIT} کار باز نمی‌توان داشت؛ کارهای انجام‌شده را تیک بزنید یا پاک کنید.`);
    }
    if (input.source && open.some((t) => t.sourceType === input.source!.type && t.sourceId === input.source!.id)) {
      throw new HttpError(409, 'این مورد از قبل در یادداشت کارهای شماست.');
    }
    const due = input.dueDate ?? null;
    const [row] = await db
      .insert(personalTodos)
      .values({
        id: newId('todo'),
        userId: viewer.id,
        title: input.title,
        note: input.note ?? '',
        dueDate: due,
        sourceType: input.source?.type ?? null,
        sourceId: input.source?.id ?? null,
        remindedOn: remindedOnFor(due),
      })
      .returning();
    signalUser(viewer.id, 'todos');
    res.status(201).json(serializeTodo(row));
  }),
);

todosRouter.patch(
  '/todos/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(updateSchema, req.body);
    const existing = await ownTodo(viewer.id, req.params.id);
    const changes: Partial<TodoRow> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.note !== undefined) changes.note = input.note;
    if (input.dueDate !== undefined && input.dueDate !== existing.dueDate) {
      changes.dueDate = input.dueDate;
      changes.remindedOn = remindedOnFor(input.dueDate);
    }
    if (input.done !== undefined) changes.doneAt = input.done ? (existing.doneAt ?? new Date()) : null;
    const [row] = Object.keys(changes).length
      ? await db.update(personalTodos).set(changes).where(eq(personalTodos.id, existing.id)).returning()
      : [existing];
    signalUser(viewer.id, 'todos');
    res.json(serializeTodo(row));
  }),
);

// Clears «انجام‌شده‌ها» at once.
todosRouter.delete(
  '/todos/done',
  route(async (req, res) => {
    const viewer = currentUser(req);
    await db.delete(personalTodos).where(and(eq(personalTodos.userId, viewer.id), isNotNull(personalTodos.doneAt)));
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
 * From 08:00, one notification per person listing their notes due today. Each note is reminded about
 * once; nobody is reminded while the part is hidden from them. Returns how many people were reminded.
 */
export async function processTodoReminders(now = new Date()) {
  if (now.getHours() < TODO_REMIND_HOUR) return 0;
  const today = toJalali(now);
  const due = await db
    .select({ id: personalTodos.id, userId: personalTodos.userId, title: personalTodos.title, role: employees.role })
    .from(personalTodos)
    .innerJoin(employees, eq(employees.id, personalTodos.userId))
    .where(
      and(
        eq(personalTodos.dueDate, today),
        isNull(personalTodos.remindedOn),
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
  const claimed = await db
    .update(personalTodos)
    .set({ remindedOn: today })
    .where(and(inArray(personalTodos.id, visible.map((t) => t.id)), isNull(personalTodos.remindedOn)))
    .returning({ id: personalTodos.id, userId: personalTodos.userId, title: personalTodos.title, createdAt: personalTodos.createdAt });
  const byUser = new Map<string, typeof claimed>();
  for (const t of claimed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
  }
  for (const [userId, todos] of byUser) {
    await createNotifications([userId], {
      title: todos.length === 1 ? `یادآوری کار امروز: ${shorten(todos[0].title)}` : `${toPersianDigits(todos.length)} کار امروز سررسید دارد`,
      message:
        todos.length === 1
          ? 'سررسید این کار از یادداشت کارهای شما امروز است.'
          : `سررسید این کارها از یادداشت کارهای شما امروز است: ${todos.map((t) => shorten(t.title, 40)).join('، ')}`,
      type: 'todo',
      linkTab: 'dashboard',
    });
  }
  return byUser.size;
}

/** Done notes older than TODO_KEEP_DONE_DAYS are removed in the nightly cleanup. */
export async function pruneDoneTodos(now = new Date()) {
  const cutoff = new Date(now.getTime() - TODO_KEEP_DONE_DAYS * 24 * 60 * 60 * 1000);
  const removed = await db
    .delete(personalTodos)
    .where(and(isNotNull(personalTodos.doneAt), lt(personalTodos.doneAt, cutoff)))
    .returning({ id: personalTodos.id });
  return removed.length;
}
