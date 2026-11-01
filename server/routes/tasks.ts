import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router } from 'express';
import { z } from 'zod';
import { featureVisible } from '../../shared/features.js';
import { isValidJalaliDate, toJalali, toPersianDigits } from '../../shared/jalali.js';
import {
  TASK_ANSWERS,
  TASK_ASSIGNEES_MAX,
  TASK_NOTE_MAX,
  TASK_OPEN_GIVEN_LIMIT,
  TASK_REMIND_HOUR,
  TASK_REPLY_MAX,
  TASK_TITLE_MAX,
  taskOpen,
  type TaskAnswer,
} from '../../shared/tasks.js';
import { db } from '../db/index.js';
import { assignedTasks, employees } from '../db/schema.js';
import { signalUser } from '../events.js';
import { featureConfig } from '../features.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';

// «کارهای ارجاعی»: every request reads and changes only tasks the signed-in person handed out or was
// handed. Nobody else sees them, managers and administrators included.

export const tasksRouter = Router();

type TaskRow = typeof assignedTasks.$inferSelect;

const assigner = alias(employees, 'task_assigner');
const assignee = alias(employees, 'task_assignee');

const person = (e: { id: string; firstName: string; lastName: string; avatarUrl: string; position: string; department: string }) => ({
  id: e.id,
  name: fullName(e),
  avatarUrl: e.avatarUrl,
  position: e.position,
  department: e.department,
});

const personColumns = (t: typeof assigner | typeof assignee) => ({
  id: t.id,
  firstName: t.firstName,
  lastName: t.lastName,
  avatarUrl: t.avatarUrl,
  position: t.position,
  department: t.department,
});

async function readTasks(where: ReturnType<typeof and>) {
  const rows = await db
    .select({ task: assignedTasks, from: personColumns(assigner), to: personColumns(assignee) })
    .from(assignedTasks)
    .innerJoin(assigner, eq(assigner.id, assignedTasks.assignerId))
    .innerJoin(assignee, eq(assignee.id, assignedTasks.assigneeId))
    .where(where)
    .orderBy(assignedTasks.dueDate, assignedTasks.createdAt);
  return rows.map(({ task, from, to }) => serialize(task, from, to));
}

const serialize = (t: TaskRow, from: Parameters<typeof person>[0], to: Parameters<typeof person>[0]) => ({
  id: t.id,
  groupId: t.groupId,
  title: t.title,
  note: t.note,
  dueDate: t.dueDate,
  status: t.status,
  reply: t.reply,
  statusAt: t.statusAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  from: person(from),
  to: person(to),
});

const title = z.string().trim().min(1, 'عنوان کار را بنویسید.').max(TASK_TITLE_MAX);
const note = z.string().trim().max(TASK_NOTE_MAX);
const dueDate = z.string({ error: 'موعد کار را انتخاب کنید.' }).refine(isValidJalaliDate, 'موعد کار را درست وارد کنید.');

const createSchema = z.object({
  title,
  note: note.optional(),
  dueDate,
  assigneeIds: z
    .array(z.string().min(1).max(100))
    .min(1, 'دست‌کم یک همکار را انتخاب کنید.')
    .max(TASK_ASSIGNEES_MAX, `حداکثر ${TASK_ASSIGNEES_MAX} همکار در یک بار`),
});

const editSchema = z.object({ title: title.optional(), note: note.optional(), dueDate: dueDate.optional() });

const answerSchema = z.object({
  status: z.enum(TASK_ANSWERS),
  reply: z.string().trim().max(TASK_REPLY_MAX).optional(),
});

const shorten = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Lets both people on a task know their lists changed. */
const signalBoth = (t: Pick<TaskRow, 'assignerId' | 'assigneeId'>) => {
  signalUser(t.assignerId, 'tasks');
  signalUser(t.assigneeId, 'tasks');
};

async function taskOf(id: string) {
  const [row] = await db.select().from(assignedTasks).where(eq(assignedTasks.id, id));
  return row;
}

/** «کارهایی که به من سپرده‌اند» and «کارهایی که سپردم», each without what that person took off their list. */
tasksRouter.get(
  '/tasks',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [mine, given] = await Promise.all([
      readTasks(and(eq(assignedTasks.assigneeId, viewer.id), isNull(assignedTasks.assigneeHiddenAt))),
      readTasks(and(eq(assignedTasks.assignerId, viewer.id), isNull(assignedTasks.assignerHiddenAt))),
    ]);
    res.json({ mine, given });
  }),
);

tasksRouter.post(
  '/tasks',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(createSchema, req.body);
    const ids = [...new Set(input.assigneeIds)];
    if (ids.includes(viewer.id)) throw new HttpError(400, 'کار خودتان را در «یادداشت‌های من» بنویسید؛ این‌جا برای سپردن کار به همکاران است.');
    const people = await db
      .select({ id: employees.id, role: employees.role, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(inArray(employees.id, ids), eq(employees.isActive, true), eq(employees.hasAccount, true)));
    if (people.length !== ids.length) throw new HttpError(400, 'یکی از همکاران انتخاب‌شده حساب فعال در پرتال ندارد.');
    // While the part is in preview, work can only go to people who can see it.
    const config = await featureConfig();
    const cannotSee = people.filter((p) => !featureVisible(config, 'tasks', { id: p.id, role: p.role }));
    if (cannotSee.length > 0) {
      throw new HttpError(400, `بخش «کارهای ارجاعی» هنوز برای ${cannotSee.map(fullName).join('، ')} باز نشده است.`);
    }
    const open = await db
      .select({ id: assignedTasks.id })
      .from(assignedTasks)
      .where(and(eq(assignedTasks.assignerId, viewer.id), inArray(assignedTasks.status, ['new', 'accepted', 'in_progress'])));
    if (open.length + ids.length > TASK_OPEN_GIVEN_LIMIT) {
      throw new HttpError(400, `بیش از ${toPersianDigits(TASK_OPEN_GIVEN_LIMIT)} کار باز سپرده‌شده نمی‌توان داشت.`);
    }
    const groupId = newId('taskgroup');
    // A task due today whose reminder hour has passed needs no reminder: it was just handed over.
    const now = new Date();
    const today = toJalali(now);
    const remindedOn = input.dueDate < today || (input.dueDate === today && now.getHours() >= TASK_REMIND_HOUR) ? today : null;
    await db.insert(assignedTasks).values(
      ids.map((assigneeId) => ({
        id: newId('task'),
        groupId,
        assignerId: viewer.id,
        assigneeId,
        title: input.title,
        note: input.note ?? '',
        dueDate: input.dueDate,
        remindedOn,
      })),
    );
    await createNotifications(ids, {
      title: `کار تازه از ${fullName(viewer)}: ${shorten(input.title)}`,
      message: 'برای دیدن جزئیات، پذیرفتن یا رد کردن آن، «کارهای ارجاعی» را باز کنید.',
      type: 'task',
      linkTab: 'tasks',
    });
    for (const id of [viewer.id, ...ids]) signalUser(id, 'tasks');
    res.status(201).json(await readTasks(eq(assignedTasks.groupId, groupId)));
  }),
);

/** The person who handed it over changes the title, note or due date of every unfinished copy of a task. */
tasksRouter.patch(
  '/tasks/groups/:groupId',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(editSchema, req.body);
    const rows = await db
      .select()
      .from(assignedTasks)
      .where(and(eq(assignedTasks.groupId, req.params.groupId), eq(assignedTasks.assignerId, viewer.id)));
    if (rows.length === 0) throw new HttpError(404, 'این کار پیدا نشد.');
    const open = rows.filter((r) => taskOpen(r.status));
    if (open.length === 0) throw new HttpError(400, 'کار تمام شده است و دیگر تغییر نمی‌کند.');
    const changes: Partial<TaskRow> = {};
    const sample = open[0];
    if (input.title !== undefined && input.title !== sample.title) changes.title = input.title;
    if (input.note !== undefined && input.note !== sample.note) changes.note = input.note;
    if (input.dueDate !== undefined && input.dueDate !== sample.dueDate) {
      changes.dueDate = input.dueDate;
      changes.remindedOn = null;
    }
    if (Object.keys(changes).length > 0) {
      await db
        .update(assignedTasks)
        .set({ ...changes, updatedAt: new Date() })
        .where(inArray(assignedTasks.id, open.map((r) => r.id)));
      const what = [changes.title !== undefined && 'عنوان', changes.note !== undefined && 'توضیح', changes.dueDate !== undefined && 'موعد']
        .filter(Boolean)
        .join('، ');
      await createNotifications(
        open.map((r) => r.assigneeId),
        {
          title: `کار «${shorten(changes.title ?? sample.title, 50)}» تغییر کرد`,
          message: `${fullName(viewer)} ${what} کار را عوض کرد.`,
          type: 'task',
          linkTab: 'tasks',
        },
      );
      for (const r of open) signalBoth(r);
    }
    res.json(await readTasks(eq(assignedTasks.groupId, req.params.groupId)));
  }),
);

/** The person the task went to answers it: accepts, declines, is working on it, or has done it. */
tasksRouter.post(
  '/tasks/:id/status',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const input = parse(answerSchema, req.body);
    const task = await taskOf(req.params.id);
    if (!task || task.assigneeId !== viewer.id) throw new HttpError(404, 'این کار پیدا نشد.');
    const reply = input.reply ?? '';
    if (task.status === input.status && task.reply === reply) return void res.json((await readTasks(eq(assignedTasks.id, task.id)))[0]);
    const now = new Date();
    await db
      .update(assignedTasks)
      .set({ status: input.status, reply, statusAt: now, updatedAt: now, assigneeHiddenAt: null })
      .where(eq(assignedTasks.id, task.id));
    // The one who handed it over hears about answers that matter; «در حال انجام» only shows on their list.
    const heading: Partial<Record<TaskAnswer, string>> = {
      accepted: 'را پذیرفت',
      declined: 'را رد کرد',
      done: 'را انجام داد',
    };
    const reopened = (task.status === 'done' || task.status === 'declined') && taskOpen(input.status);
    const verb = reopened ? 'را دوباره باز کرد' : task.status !== input.status ? heading[input.status] : undefined;
    if (verb) {
      await createNotifications([task.assignerId], {
        title: `${fullName(viewer)} کار «${shorten(task.title, 50)}» ${verb}`,
        message: reply || 'وضعیت کار در «کارهای ارجاعی» آمده است.',
        type: 'task',
        linkTab: 'tasks',
      });
    }
    // A task brought back while the other side had already taken it off their list comes back there too.
    if (reopened && task.assignerHiddenAt) await db.update(assignedTasks).set({ assignerHiddenAt: null }).where(eq(assignedTasks.id, task.id));
    signalBoth(task);
    res.json((await readTasks(eq(assignedTasks.id, task.id)))[0]);
  }),
);

/**
 * Takes a task off the person's own list. The one who handed it over takes back an unfinished task
 * (the colleague is told); a finished or declined one simply leaves their list. The one it went to can
 * only put away a finished or declined task. The row goes once neither of them keeps it.
 */
tasksRouter.delete(
  '/tasks/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const task = await taskOf(req.params.id);
    if (!task || (task.assignerId !== viewer.id && task.assigneeId !== viewer.id)) throw new HttpError(404, 'این کار پیدا نشد.');
    const asAssigner = task.assignerId === viewer.id;
    if (asAssigner && taskOpen(task.status)) {
      await db.delete(assignedTasks).where(eq(assignedTasks.id, task.id));
      await createNotifications([task.assigneeId], {
        title: `کار «${shorten(task.title, 50)}» پس گرفته شد`,
        message: `${fullName(viewer)} این کار را لغو کرد و دیگر لازم نیست انجامش دهید.`,
        type: 'task',
        linkTab: 'tasks',
      });
    } else if (!asAssigner && taskOpen(task.status)) {
      throw new HttpError(400, 'کاری را که به شما سپرده‌اند، اول انجام دهید یا رد کنید.');
    } else {
      const otherSideGone = asAssigner ? task.assigneeHiddenAt : task.assignerHiddenAt;
      if (otherSideGone) await db.delete(assignedTasks).where(eq(assignedTasks.id, task.id));
      else await db.update(assignedTasks).set(asAssigner ? { assignerHiddenAt: new Date() } : { assigneeHiddenAt: new Date() }).where(eq(assignedTasks.id, task.id));
    }
    signalBoth(task);
    res.status(204).end();
  }),
);

/**
 * From 08:00, one notification per person listing the unfinished tasks handed to them that are due
 * today. Each reminder goes out once; nobody is reminded while the part is hidden from them.
 */
export async function processTaskReminders(now = new Date()) {
  if (now.getHours() < TASK_REMIND_HOUR) return 0;
  const today = toJalali(now);
  const due = await db
    .select({ id: assignedTasks.id, userId: assignedTasks.assigneeId, role: employees.role })
    .from(assignedTasks)
    .innerJoin(employees, eq(employees.id, assignedTasks.assigneeId))
    .where(
      and(
        eq(assignedTasks.dueDate, today),
        isNull(assignedTasks.remindedOn),
        or(eq(assignedTasks.status, 'new'), eq(assignedTasks.status, 'accepted'), eq(assignedTasks.status, 'in_progress')),
        eq(employees.isActive, true),
        eq(employees.hasAccount, true),
      ),
    );
  if (due.length === 0) return 0;
  const config = await featureConfig();
  const visible = due.filter((t) => featureVisible(config, 'tasks', { id: t.userId, role: t.role }));
  if (visible.length === 0) return 0;
  // Claimed first, so a second server tick or a restart does not remind twice.
  const claimed = await db
    .update(assignedTasks)
    .set({ remindedOn: today })
    .where(and(inArray(assignedTasks.id, visible.map((t) => t.id)), isNull(assignedTasks.remindedOn)))
    .returning({ userId: assignedTasks.assigneeId, title: assignedTasks.title });
  const byUser = new Map<string, string[]>();
  for (const t of claimed) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t.title]);
  for (const [userId, titles] of byUser) {
    await createNotifications([userId], {
      title: titles.length === 1 ? `موعد کار ارجاعی امروز است: ${shorten(titles[0])}` : `موعد ${toPersianDigits(titles.length)} کار ارجاعی امروز است`,
      message: titles.length === 1 ? 'این کار را به شما سپرده‌اند و امروز موعد آن است.' : titles.map((t) => shorten(t, 40)).join('، '),
      type: 'task',
      linkTab: 'tasks',
    });
  }
  return byUser.size;
}
