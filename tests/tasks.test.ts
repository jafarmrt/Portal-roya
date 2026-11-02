import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { assignedTasks, notifications } from '../server/db/schema';
import { processTaskOverdue, processTaskReminders } from '../server/routes/tasks';
import { toJalali } from '../shared/jalali';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;

/** Jalali days from today, so the tests never fall into the past. */
const day = (offset: number) => toJalali(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));
const SOON = day(10);
const LATER = day(20);
type Person = Awaited<ReturnType<typeof createEmployee>>;

// In the order they were sent: after a delete, PostgreSQL may hand rows back in another order.
const taskNotifications = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'task'))).orderBy(asc(notifications.id));

describe('«کارهای ارجاعی»: handing work to colleagues', () => {
  let admin: Agent;
  let boss: Person;
  let ali: Person;
  let sara: Person;
  let outsider: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    boss = await createEmployee(admin, { username: 'task.boss' });
    ali = await createEmployee(admin, { username: 'task.ali' });
    sara = await createEmployee(admin, { username: 'task.sara' });
    outsider = await createEmployee(admin, { username: 'task.outsider' });
  });
  afterAll(() => pool.end());

  it('starts in preview: only the administrator and the pilot group reach it, and work only goes to them', async () => {
    expect((await boss.agent.get('/api/settings').expect(200)).body.features).not.toHaveProperty('tasks');
    expect((await boss.agent.get('/api/tasks').expect(200)).body).toEqual({ mine: [], given: [], recipients: [] });
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: SOON, assigneeIds: [ali.id] }).expect(404);

    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [boss.id, ali.id, sara.id] }).expect(200);
    expect((await boss.agent.get('/api/settings').expect(200)).body.features.tasks).toBe('preview');
    // Someone outside the pilot group cannot be handed work yet.
    const refused = await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: SOON, assigneeIds: [outsider.id] }).expect(400);
    expect(refused.body.error).toContain('هنوز');
  });

  it('refuses a task to oneself, to nobody, or without a valid due date', async () => {
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: SOON, assigneeIds: [boss.id] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: SOON, assigneeIds: [] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: 'کار', assigneeIds: [ali.id] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: '  ', dueDate: SOON, assigneeIds: [ali.id] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: '1405/13/10', assigneeIds: [ali.id] }).expect(400);
    // A due date already gone is a mistake.
    const late = await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: day(-1), assigneeIds: [ali.id] }).expect(400);
    expect(late.body.error).toContain('گذشته');
  });

  it('gives each colleague a copy of their own, seen only by the two people on it', async () => {
    const created = (
      await boss.agent.post('/api/tasks').send({ title: 'گزارش فروش آبان', note: 'تا ظهر', dueDate: SOON, assigneeIds: [ali.id, sara.id] }).expect(201)
    ).body;
    expect(created).toHaveLength(2);
    expect(new Set(created.map((t: { groupId: string }) => t.groupId)).size).toBe(1);
    expect(created[0]).toMatchObject({ title: 'گزارش فروش آبان', note: 'تا ظهر', status: 'new', from: { id: boss.id } });

    const aliView = (await ali.agent.get('/api/tasks').expect(200)).body;
    expect(aliView.mine).toHaveLength(1);
    expect(aliView.mine[0].to.id).toBe(ali.id);
    expect(aliView.given).toEqual([]);
    expect((await boss.agent.get('/api/tasks').expect(200)).body.given).toHaveLength(2);
    // Nobody else, the administrator included, sees or touches it.
    expect((await admin.get('/api/tasks').expect(200)).body).toMatchObject({ mine: [], given: [] });
    const aliTask = aliView.mine[0];
    await sara.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'done' }).expect(404);
    await admin.delete(`/api/tasks/${aliTask.id}`).expect(404);
    // The one who handed it over does not answer it for the colleague.
    await boss.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'done' }).expect(404);

    // Each colleague gets a bell notification that opens this very task.
    expect(await taskNotifications(ali.id)).toEqual([expect.objectContaining({ linkTab: 'tasks', linkId: created[0].groupId })]);
    expect(await taskNotifications(sara.id)).toHaveLength(1);
  });

  it('lets the colleague accept, work on, finish or decline it, and tells the one who handed it over', async () => {
    const [aliTask] = (await ali.agent.get('/api/tasks').expect(200)).body.mine;
    const [saraTask] = (await sara.agent.get('/api/tasks').expect(200)).body.mine;
    const before = (await taskNotifications(boss.id)).length;

    expect((await ali.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'accepted' }).expect(200)).body.status).toBe('accepted');
    // «در حال انجام» shows on the list without a bell.
    await ali.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'in_progress' }).expect(200);
    await ali.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'done', reply: 'فرستادم' }).expect(200);
    await sara.agent.post(`/api/tasks/${saraTask.id}/status`).send({ status: 'declined', reply: 'مرخصی هستم' }).expect(200);
    await sara.agent.post(`/api/tasks/${saraTask.id}/status`).send({ status: 'new' }).expect(400);

    const told = (await taskNotifications(boss.id)).slice(before);
    expect(told.map((n) => n.title)).toEqual([
      expect.stringContaining('را پذیرفت'),
      expect.stringContaining('را انجام داد'),
      expect.stringContaining('را رد کرد'),
    ]);
    expect(told[2].message).toBe('مرخصی هستم');
    const given = (await boss.agent.get('/api/tasks').expect(200)).body.given;
    expect(given.map((t: { status: string; reply: string }) => [t.status, t.reply]).sort()).toEqual([
      ['declined', 'مرخصی هستم'],
      ['done', 'فرستادم'],
    ]);
  });

  it('lets each side put a finished task away, and removes it once both have', async () => {
    const [aliTask] = (await ali.agent.get('/api/tasks').expect(200)).body.mine;
    await ali.agent.delete(`/api/tasks/${aliTask.id}`).expect(204);
    expect((await ali.agent.get('/api/tasks').expect(200)).body.mine).toEqual([]);
    expect((await boss.agent.get('/api/tasks').expect(200)).body.given).toHaveLength(2);
    await boss.agent.delete(`/api/tasks/${aliTask.id}`).expect(204);
    expect(await db.select().from(assignedTasks).where(eq(assignedTasks.id, aliTask.id))).toEqual([]);

    // A declined task taken up again comes back to the list of the one who handed it over.
    const [saraTask] = (await sara.agent.get('/api/tasks').expect(200)).body.mine;
    await boss.agent.delete(`/api/tasks/${saraTask.id}`).expect(204);
    expect((await boss.agent.get('/api/tasks').expect(200)).body.given).toEqual([]);
    // Some time later (the answer was read): not an undo of a wrong tap.
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, boss.id));
    await sara.agent.post(`/api/tasks/${saraTask.id}/status`).send({ status: 'accepted' }).expect(200);
    expect((await boss.agent.get('/api/tasks').expect(200)).body.given.map((t: { id: string }) => t.id)).toEqual([saraTask.id]);
    expect((await taskNotifications(boss.id)).at(-1)!.title).toContain('دوباره باز کرد');
  });

  it('keeps an unfinished task on the colleague list until done or declined', async () => {
    const [saraTask] = (await sara.agent.get('/api/tasks').expect(200)).body.mine;
    await sara.agent.delete(`/api/tasks/${saraTask.id}`).expect(400);
  });

  it('lets the one who handed it over change or take back an unfinished task, telling the colleague', async () => {
    const [saraTask] = (await sara.agent.get('/api/tasks').expect(200)).body.mine;
    const before = (await taskNotifications(sara.id)).length;
    await ali.agent.patch(`/api/tasks/groups/${saraTask.groupId}`).send({ dueDate: LATER }).expect(404);
    const edited = (await boss.agent.patch(`/api/tasks/groups/${saraTask.groupId}`).send({ dueDate: LATER, title: 'گزارش فروش' }).expect(200)).body;
    expect(edited[0]).toMatchObject({ dueDate: LATER, title: 'گزارش فروش' });
    await boss.agent.delete(`/api/tasks/${saraTask.id}`).expect(204);
    expect((await sara.agent.get('/api/tasks').expect(200)).body.mine).toEqual([]);
    const told = (await taskNotifications(sara.id)).slice(before);
    expect(told.map((n) => n.title)).toEqual([expect.stringContaining('تغییر کرد'), expect.stringContaining('پس گرفته شد')]);
    expect(told[0].message).toContain('عنوان و موعد');
  });

  it('refuses a due date moved into the past, and sends no second reminder for one moved to today', async () => {
    const [task] = (await boss.agent.post('/api/tasks').send({ title: 'تمدید بیمه', dueDate: SOON, assigneeIds: [ali.id] }).expect(201)).body;
    await boss.agent.patch(`/api/tasks/groups/${task.groupId}`).send({ dueDate: day(-2) }).expect(400);
    // Editing only the title of a task that is already late still works (the form sends the same due date).
    await db.update(assignedTasks).set({ dueDate: day(-1) }).where(eq(assignedTasks.groupId, task.groupId));
    await boss.agent.patch(`/api/tasks/groups/${task.groupId}`).send({ title: 'تمدید بیمهٔ خودرو', dueDate: day(-1) }).expect(200);
    // Moved to today after the reminder hour: the change notification is the reminder, none comes after it.
    await boss.agent.patch(`/api/tasks/groups/${task.groupId}`).send({ dueDate: day(0) }).expect(200);
    const [row] = await db.select().from(assignedTasks).where(eq(assignedTasks.groupId, task.groupId));
    expect(row.remindedOn).toBe(new Date().getHours() >= 8 ? day(0) : null);
    await boss.agent.delete(`/api/tasks/${task.id}`).expect(204);
  });

  it('after an undone decline of a new task, still says it was accepted', async () => {
    const [task] = (await boss.agent.post('/api/tasks').send({ title: 'چاپ کارت ویزیت', dueDate: SOON, assigneeIds: [sara.id] }).expect(201)).body;
    const [mine] = (await sara.agent.get('/api/tasks').expect(200)).body.mine.filter((t: { groupId: string }) => t.groupId === task.groupId);
    const before = (await taskNotifications(boss.id)).length;
    await sara.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'declined' }).expect(200);
    await sara.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'accepted' }).expect(200);
    const told = (await taskNotifications(boss.id)).slice(before);
    expect(told.map((n) => n.title)).toEqual([expect.stringContaining('را پذیرفت')]);
    await boss.agent.delete(`/api/tasks/${mine.id}`).expect(204);
  });

  it('takes an unread answer back from the bell when the colleague undoes it at once', async () => {
    const [task] = (await boss.agent.post('/api/tasks').send({ title: 'ارسال فاکتور', dueDate: SOON, assigneeIds: [ali.id] }).expect(201)).body;
    const [mine] = (await ali.agent.get('/api/tasks').expect(200)).body.mine.filter((t: { groupId: string }) => t.groupId === task.groupId);
    await ali.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'accepted' }).expect(200);
    const before = (await taskNotifications(boss.id)).length;
    await ali.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'done' }).expect(200);
    expect((await taskNotifications(boss.id)).at(-1)).toMatchObject({ title: expect.stringContaining('انجام داد'), linkId: task.groupId });
    // «برگردان»: back to where it was; the «انجام داد» goes and no «دوباره باز کرد» follows.
    await ali.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'accepted' }).expect(200);
    expect((await taskNotifications(boss.id)).length).toBe(before);
    // Once read, an answer stays, and opening it again is told as before.
    await ali.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'done' }).expect(200);
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, boss.id));
    await ali.agent.post(`/api/tasks/${mine.id}/status`).send({ status: 'in_progress' }).expect(200);
    expect((await taskNotifications(boss.id)).at(-1)!.title).toContain('دوباره باز کرد');
    await boss.agent.delete(`/api/tasks/${mine.id}`).expect(204);
  });

  it('reminds the colleague once on the morning of the due date', async () => {
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    const today = toJalali(morning);
    await db.insert(assignedTasks).values([
      { id: 'task-due', groupId: 'g1', assignerId: boss.id, assigneeId: ali.id, title: 'تمدید قرارداد', dueDate: today },
      { id: 'task-done', groupId: 'g2', assignerId: boss.id, assigneeId: ali.id, title: 'انجام‌شده', dueDate: today, status: 'done' },
    ]);
    const before = (await taskNotifications(ali.id)).length;
    const early = new Date(morning);
    early.setHours(7);
    expect(await processTaskReminders(early)).toBe(0);
    expect(await processTaskReminders(morning)).toBe(1);
    expect(await processTaskReminders(morning)).toBe(0);
    const reminders = (await taskNotifications(ali.id)).slice(before);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].title).toContain('تمدید قرارداد');
  });

  it('tells the form and the phone book who can be handed work: the pilot group, not oneself', async () => {
    const { recipients } = (await boss.agent.get('/api/tasks').expect(200)).body;
    expect(recipients).toEqual(expect.arrayContaining([ali.id, sara.id]));
    expect(recipients).not.toContain(boss.id);
    expect(recipients).not.toContain(outsider.id);
  });

  it('passes a declined task on to another colleague, once', async () => {
    const [copy] = (
      await boss.agent.post('/api/tasks').send({ title: 'بررسی فاکتورها', note: 'سه فاکتور آبان', dueDate: SOON, assigneeIds: [ali.id] }).expect(201)
    ).body;
    const pass = (who: Person, body: object) => who.agent.post(`/api/tasks/${copy.id}/reassign`).send(body);
    // Only a declined copy, and only by the one who handed it over.
    await pass(boss, { assigneeId: sara.id }).expect(400);
    await ali.agent.post(`/api/tasks/${copy.id}/status`).send({ status: 'declined', reply: 'این هفته مرخصی هستم' }).expect(200);
    await pass(sara, { assigneeId: sara.id }).expect(404);
    await pass(ali, { assigneeId: sara.id }).expect(404);
    // Not back to the one who declined, not to oneself, nobody outside the pilot group, no day gone by.
    await pass(boss, { assigneeId: ali.id }).expect(400);
    await pass(boss, { assigneeId: boss.id }).expect(400);
    await pass(boss, { assigneeId: outsider.id }).expect(400);
    await pass(boss, { assigneeId: sara.id, dueDate: day(-1) }).expect(400);

    const before = (await taskNotifications(sara.id)).length;
    const copies = (await pass(boss, { assigneeId: sara.id }).expect(201)).body as { id: string; to: { id: string }; reassignedTo: string | null }[];
    expect(copies).toHaveLength(2);
    const fresh = copies.find((c) => c.to.id === sara.id)!;
    expect(fresh).toMatchObject({ groupId: copy.groupId, title: 'بررسی فاکتورها', note: 'سه فاکتور آبان', dueDate: SOON, status: 'new' });
    expect(copies.find((c) => c.id === copy.id)!.reassignedTo).toBe(fresh.id);
    const told = (await taskNotifications(sara.id)).slice(before);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ linkTab: 'tasks', linkId: copy.groupId });
    expect(told[0].title).toContain('بررسی فاکتورها');
    expect((await sara.agent.get('/api/tasks').expect(200)).body.mine.map((t: { id: string }) => t.id)).toContain(fresh.id);
    // Passed on once; taking the new copy back lets it be passed on again.
    await pass(boss, { assigneeId: sara.id }).expect(400);
    await boss.agent.delete(`/api/tasks/${fresh.id}`).expect(204);
    const given = (await boss.agent.get('/api/tasks').expect(200)).body.given as { id: string; reassignedTo: string | null }[];
    expect(given.find((t) => t.id === copy.id)!.reassignedTo).toBeNull();
  });

  it('asks for a new date when the declined task has gone past its own', async () => {
    await db.insert(assignedTasks).values({
      id: 'declined-late',
      groupId: 'g-declined-late',
      assignerId: boss.id,
      assigneeId: ali.id,
      title: 'تمدید بیمه',
      dueDate: day(-2),
      status: 'declined',
    });
    const refused = await boss.agent.post('/api/tasks/declined-late/reassign').send({ assigneeId: sara.id }).expect(400);
    expect(refused.body.error).toContain('موعد تازه');
    const copies = (await boss.agent.post('/api/tasks/declined-late/reassign').send({ assigneeId: sara.id, dueDate: LATER }).expect(201)).body;
    expect(copies.find((c: { to: { id: string } }) => c.to.id === sara.id).dueDate).toBe(LATER);
  });

  it('reminds both sides once, the morning after the due date', async () => {
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    const back = (days: number) => toJalali(new Date(morning.getTime() - days * 24 * 60 * 60 * 1000));
    await db.insert(assignedTasks).values([
      { id: 'late-ali', groupId: 'g-late', assignerId: boss.id, assigneeId: ali.id, title: 'تحویل نقشه‌ها', dueDate: back(1), status: 'accepted' },
      { id: 'late-sara', groupId: 'g-late', assignerId: boss.id, assigneeId: sara.id, title: 'تحویل نقشه‌ها', dueDate: back(1) },
      { id: 'late-done', groupId: 'g-late-done', assignerId: boss.id, assigneeId: ali.id, title: 'تمام‌شده', dueDate: back(1), status: 'done' },
      { id: 'late-old', groupId: 'g-late-old', assignerId: boss.id, assigneeId: ali.id, title: 'خیلی قدیمی', dueDate: back(30), status: 'accepted' },
    ]);
    const count = async (p: Person) => (await taskNotifications(p.id)).length;
    const before = { boss: await count(boss), ali: await count(ali), sara: await count(sara) };
    const early = new Date(morning);
    early.setHours(7);
    expect(await processTaskOverdue(early)).toBe(0);
    // Ali and Sara, and the boss once for the task (not once per colleague).
    expect(await processTaskOverdue(morning)).toBe(3);
    expect(await processTaskOverdue(morning)).toBe(0);

    const aliTold = (await taskNotifications(ali.id)).slice(before.ali);
    expect(aliTold).toHaveLength(1);
    expect(aliTold[0].title).toContain('تحویل نقشه‌ها');
    expect(aliTold[0].linkId).toBe('g-late');
    expect((await taskNotifications(sara.id)).slice(before.sara)).toHaveLength(1);
    const bossTold = (await taskNotifications(boss.id)).slice(before.boss);
    expect(bossTold).toHaveLength(1);
    expect(bossTold[0].title).toContain('تحویل نقشه‌ها');
    expect(bossTold[0].message).toContain('۲ همکار');
    expect(bossTold[0].linkId).toBe('g-late');
    const [old] = await db.select().from(assignedTasks).where(eq(assignedTasks.id, 'late-old'));
    expect(old.overdueRemindedOn).toBeNull();

    // A new due date gets a reminder of its own if it passes too.
    await boss.agent.patch('/api/tasks/groups/g-late').send({ dueDate: SOON }).expect(200);
    const moved = await db.select().from(assignedTasks).where(eq(assignedTasks.groupId, 'g-late'));
    expect(moved.map((t) => t.overdueRemindedOn)).toEqual([null, null]);
  });
});
