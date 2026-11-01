import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { assignedTasks, notifications } from '../server/db/schema';
import { processTaskReminders } from '../server/routes/tasks';
import { toJalali } from '../shared/jalali';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const taskNotifications = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'task')));

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
    expect((await boss.agent.get('/api/tasks').expect(200)).body).toEqual({ mine: [], given: [] });
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: '1405/09/10', assigneeIds: [ali.id] }).expect(404);

    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [boss.id, ali.id, sara.id] }).expect(200);
    expect((await boss.agent.get('/api/settings').expect(200)).body.features.tasks).toBe('preview');
    // Someone outside the pilot group cannot be handed work yet.
    const refused = await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: '1405/09/10', assigneeIds: [outsider.id] }).expect(400);
    expect(refused.body.error).toContain('هنوز');
  });

  it('refuses a task to oneself, to nobody, or without a valid due date', async () => {
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: '1405/09/10', assigneeIds: [boss.id] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: '1405/09/10', assigneeIds: [] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: 'کار', assigneeIds: [ali.id] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: '  ', dueDate: '1405/09/10', assigneeIds: [ali.id] }).expect(400);
    await boss.agent.post('/api/tasks').send({ title: 'کار', dueDate: '1405/13/10', assigneeIds: [ali.id] }).expect(400);
  });

  it('gives each colleague a copy of their own, seen only by the two people on it', async () => {
    const created = (
      await boss.agent.post('/api/tasks').send({ title: 'گزارش فروش آبان', note: 'تا ظهر', dueDate: '1405/09/10', assigneeIds: [ali.id, sara.id] }).expect(201)
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
    expect((await admin.get('/api/tasks').expect(200)).body).toEqual({ mine: [], given: [] });
    const aliTask = aliView.mine[0];
    await sara.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'done' }).expect(404);
    await admin.delete(`/api/tasks/${aliTask.id}`).expect(404);
    // The one who handed it over does not answer it for the colleague.
    await boss.agent.post(`/api/tasks/${aliTask.id}/status`).send({ status: 'done' }).expect(404);

    // Each colleague gets a bell notification.
    expect(await taskNotifications(ali.id)).toHaveLength(1);
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
    await ali.agent.patch(`/api/tasks/groups/${saraTask.groupId}`).send({ dueDate: '1405/09/20' }).expect(404);
    const edited = (await boss.agent.patch(`/api/tasks/groups/${saraTask.groupId}`).send({ dueDate: '1405/09/20', title: 'گزارش فروش' }).expect(200)).body;
    expect(edited[0]).toMatchObject({ dueDate: '1405/09/20', title: 'گزارش فروش' });
    await boss.agent.delete(`/api/tasks/${saraTask.id}`).expect(204);
    expect((await sara.agent.get('/api/tasks').expect(200)).body.mine).toEqual([]);
    const told = (await taskNotifications(sara.id)).slice(before);
    expect(told.map((n) => n.title)).toEqual([expect.stringContaining('تغییر کرد'), expect.stringContaining('پس گرفته شد')]);
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
});
