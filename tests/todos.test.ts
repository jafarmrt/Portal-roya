import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications, personalTodos } from '../server/db/schema';
import { processTodoReminders, pruneDoneTodos } from '../server/routes/todos';
import { toJalali } from '../shared/jalali';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const at = (hours: number, minutes = 0) => {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
};

const todoNotifications = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'todo')));

describe('«یادداشت کارهای من»: private to-do notes with a morning reminder', () => {
  let admin: Agent;
  let owner: Person;
  let other: Person;

  const setState = (state: string) => admin.put('/api/settings/features/todos').send({ state }).expect(200);

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    owner = await createEmployee(admin, { username: 'todo.owner' });
    other = await createEmployee(admin, { username: 'todo.other' });
  });
  afterAll(() => pool.end());

  it('stays out of reach until an administrator switches it on', async () => {
    expect((await owner.agent.get('/api/settings').expect(200)).body.features).not.toHaveProperty('todos');
    expect((await owner.agent.get('/api/todos').expect(200)).body).toEqual([]);
    await owner.agent.post('/api/todos').send({ title: 'کار' }).expect(404);
    await setState('on');
    expect((await owner.agent.get('/api/settings').expect(200)).body.features.todos).toBe('on');
  });

  it('keeps each note private to the person who wrote it', async () => {
    const created = (await owner.agent.post('/api/todos').send({ title: '  فرم مرخصی  ', dueDate: '1405/09/10', note: 'تا ظهر' }).expect(201)).body;
    expect(created).toMatchObject({ title: 'فرم مرخصی', dueDate: '1405/09/10', note: 'تا ظهر', doneAt: null, sourceType: null });
    expect((await owner.agent.get('/api/todos').expect(200)).body.map((t: { id: string }) => t.id)).toEqual([created.id]);

    // Nobody else reads, changes or removes it, not even the administrator.
    expect((await other.agent.get('/api/todos').expect(200)).body).toEqual([]);
    expect((await admin.get('/api/todos').expect(200)).body).toEqual([]);
    await other.agent.patch(`/api/todos/${created.id}`).send({ done: true }).expect(404);
    await admin.delete(`/api/todos/${created.id}`).expect(404);

    const done = (await owner.agent.patch(`/api/todos/${created.id}`).send({ done: true }).expect(200)).body;
    expect(done.doneAt).not.toBeNull();
    const reopened = (await owner.agent.patch(`/api/todos/${created.id}`).send({ done: false, dueDate: null }).expect(200)).body;
    expect(reopened).toMatchObject({ doneAt: null, dueDate: null });
    await owner.agent.delete(`/api/todos/${created.id}`).expect(204);
    expect((await owner.agent.get('/api/todos').expect(200)).body).toEqual([]);
  });

  it('refuses an empty title or an invalid date', async () => {
    await owner.agent.post('/api/todos').send({ title: '   ' }).expect(400);
    await owner.agent.post('/api/todos').send({ title: 'کار', dueDate: '2026-11-01' }).expect(400);
    await owner.agent.post('/api/todos').send({ title: 'کار', source: { type: 'poll', id: 'x' } }).expect(400);
  });

  it('adds a news item, event, course or document once while its note is open', async () => {
    const source = { type: 'event', id: 'event-123' };
    const first = (await owner.agent.post('/api/todos').send({ title: 'جلسهٔ فروش', dueDate: '1405/09/12', source }).expect(201)).body;
    expect(first).toMatchObject({ sourceType: 'event', sourceId: 'event-123' });
    await owner.agent.post('/api/todos').send({ title: 'دوباره', source }).expect(409);
    // Someone else may add the same event to their own list.
    await other.agent.post('/api/todos').send({ title: 'جلسهٔ فروش', source }).expect(201);
    // Once done, it can be added again.
    await owner.agent.patch(`/api/todos/${first.id}`).send({ done: true }).expect(200);
    await owner.agent.post('/api/todos').send({ title: 'دوباره', source }).expect(201);

    await owner.agent.delete('/api/todos/done').expect(204);
    const left = (await owner.agent.get('/api/todos').expect(200)).body;
    expect(left).toHaveLength(1);
    expect(left[0].title).toBe('دوباره');
  });

  it('reminds each person once on the morning a note is due, in one notification', async () => {
    await db.delete(personalTodos);
    const morning = at(8, 30);
    const today = toJalali(morning);
    const tomorrow = toJalali(new Date(morning.getTime() + 24 * 60 * 60 * 1000));
    const ids: string[] = [];
    for (const title of ['گزارش ماهانه', 'تمدید قرارداد']) {
      ids.push((await owner.agent.post('/api/todos').send({ title, dueDate: today }).expect(201)).body.id);
    }
    const done = (await owner.agent.post('/api/todos').send({ title: 'انجام شده', dueDate: today }).expect(201)).body.id;
    await owner.agent.patch(`/api/todos/${done}`).send({ done: true }).expect(200);
    await owner.agent.post('/api/todos').send({ title: 'فردا', dueDate: tomorrow }).expect(201);
    // Written before the reminder went out (the test may run after 08:00).
    await db.update(personalTodos).set({ remindedOn: null });

    expect(await processTodoReminders(at(7, 59))).toBe(0);
    expect(await processTodoReminders(morning)).toBe(1);
    const [note, ...more] = await todoNotifications(owner.id);
    expect(more).toHaveLength(0);
    expect(note.title).toBe('۲ کار امروز سررسید دارد');
    expect(note.message).toContain('گزارش ماهانه');
    expect(note.message).toContain('تمدید قرارداد');
    expect(note.message).not.toContain('انجام شده');
    expect(note.linkTab).toBe('dashboard');

    // A second tick (or a restart) does not remind again.
    expect(await processTodoReminders(at(9))).toBe(0);
    expect(await todoNotifications(owner.id)).toHaveLength(1);
  });

  it('does not remind about a note set for today after the reminder hour', async () => {
    await db.delete(personalTodos);
    const created = (await owner.agent.post('/api/todos').send({ title: 'همین حالا', dueDate: toJalali(new Date()) }).expect(201)).body;
    const [row] = await db.select().from(personalTodos).where(eq(personalTodos.id, created.id));
    expect(row.remindedOn).toBe(new Date().getHours() >= 8 ? toJalali(new Date()) : null);
  });

  it('reminds nobody while the part is hidden from them, and hides its notifications', async () => {
    await db.delete(personalTodos);
    await db.delete(notifications);
    const morning = at(8, 30);
    await other.agent.post('/api/todos').send({ title: 'کار پنهان', dueDate: toJalali(morning) }).expect(201);
    await db.update(personalTodos).set({ remindedOn: null });
    await setState('preview');
    expect(await processTodoReminders(morning)).toBe(0);
    expect(await todoNotifications(other.id)).toHaveLength(0);

    // Shown again later, the reminder still goes out, but not to someone who cannot see it.
    await setState('on');
    expect(await processTodoReminders(morning)).toBe(1);
    expect((await other.agent.get('/api/notifications').expect(200)).body.some((n: { type: string }) => n.type === 'todo')).toBe(true);
    await setState('off');
    expect((await other.agent.get('/api/notifications').expect(200)).body.some((n: { type: string }) => n.type === 'todo')).toBe(false);
    await setState('on');
  });

  it('removes notes done long ago in the nightly cleanup', async () => {
    await db.delete(personalTodos);
    const oldId = (await owner.agent.post('/api/todos').send({ title: 'قدیمی' }).expect(201)).body.id;
    const recentId = (await owner.agent.post('/api/todos').send({ title: 'تازه' }).expect(201)).body.id;
    const openId = (await owner.agent.post('/api/todos').send({ title: 'باز' }).expect(201)).body.id;
    await db.update(personalTodos).set({ doneAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) }).where(eq(personalTodos.id, oldId));
    await db.update(personalTodos).set({ doneAt: new Date() }).where(eq(personalTodos.id, recentId));
    expect(await pruneDoneTodos()).toBe(1);
    const left = (await owner.agent.get('/api/todos').expect(200)).body.map((t: { id: string }) => t.id).sort();
    expect(left).toEqual([recentId, openId].sort());
  });
});
