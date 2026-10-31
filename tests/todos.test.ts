import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications, personalTodos } from '../server/db/schema';
import { processTodoReminders } from '../server/routes/todos';
import { toJalali } from '../shared/jalali';
import { nextDueDate, quickDueDates, todoGroup } from '../shared/todos';
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

describe('«یادداشت‌های من»: private to-do notes with a morning reminder', () => {
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

  it('is on from the start, and out of reach once an administrator switches it off', async () => {
    expect((await owner.agent.get('/api/settings').expect(200)).body.features.todos).toBe('on');
    await setState('off');
    expect((await owner.agent.get('/api/settings').expect(200)).body.features).not.toHaveProperty('todos');
    expect((await owner.agent.get('/api/todos').expect(200)).body).toEqual([]);
    await owner.agent.post('/api/todos').send({ title: 'کار', dueDate: '1405/09/10' }).expect(404);
    await setState('on');
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
    const reopened = (await owner.agent.patch(`/api/todos/${created.id}`).send({ done: false, dueDate: '1405/09/11' }).expect(200)).body;
    expect(reopened).toMatchObject({ doneAt: null, dueDate: '1405/09/11' });
    // The due date cannot be taken away.
    await owner.agent.patch(`/api/todos/${created.id}`).send({ dueDate: null }).expect(400);
    await owner.agent.delete(`/api/todos/${created.id}`).expect(204);
    expect((await owner.agent.get('/api/todos').expect(200)).body).toEqual([]);
  });

  it('refuses an empty title, a missing or invalid due date', async () => {
    await owner.agent.post('/api/todos').send({ title: '   ', dueDate: '1405/09/10' }).expect(400);
    const missing = await owner.agent.post('/api/todos').send({ title: 'کار' }).expect(400);
    expect(missing.body.error).toContain('تاریخ سررسید را انتخاب کنید');
    await owner.agent.post('/api/todos').send({ title: 'کار', dueDate: null }).expect(400);
    await owner.agent.post('/api/todos').send({ title: 'کار', dueDate: '2026-11-01' }).expect(400);
    await owner.agent.post('/api/todos').send({ title: 'کار', dueDate: '1405/13/01' }).expect(400);
    await owner.agent.post('/api/todos').send({ title: 'کار', dueDate: '1405/09/10', source: { type: 'poll', id: 'x' } }).expect(400);
  });

  it('keeps an old note without a date until it is given one', async () => {
    await db.delete(personalTodos);
    await db.insert(personalTodos).values({ id: 'todo-old', userId: owner.id, title: 'قدیمی بی‌تاریخ' });
    const [old] = (await owner.agent.get('/api/todos').expect(200)).body;
    expect(old).toMatchObject({ id: 'todo-old', dueDate: null, important: false, repeat: null, remind: 'day', steps: [] });
    await owner.agent.patch('/api/todos/todo-old').send({ title: 'هنوز بی‌تاریخ' }).expect(200);
    expect((await owner.agent.patch('/api/todos/todo-old').send({ dueDate: '1405/09/12' }).expect(200)).body.dueDate).toBe('1405/09/12');
  });

  it('stars a note, keeps its steps and reminder choice', async () => {
    await db.delete(personalTodos);
    const created = (
      await owner.agent
        .post('/api/todos')
        .send({ title: 'گزارش فصلی', dueDate: '1405/09/10', important: true, remind: 'both', steps: [{ text: 'جمع‌آوری آمار' }, { text: '  نمودارها  ', done: true }] })
        .expect(201)
    ).body;
    expect(created).toMatchObject({ important: true, remind: 'both', repeat: null });
    expect(created.steps.map((s: { text: string; done: boolean }) => [s.text, s.done])).toEqual([['جمع‌آوری آمار', false], ['نمودارها', true]]);
    expect(created.steps.every((s: { id: string }) => s.id)).toBe(true);
    const ticked = created.steps.map((s: { id: string; text: string }) => ({ ...s, done: true }));
    const updated = (await owner.agent.patch(`/api/todos/${created.id}`).send({ steps: ticked, important: false, remind: 'none' }).expect(200)).body;
    expect(updated).toMatchObject({ important: false, remind: 'none' });
    expect(updated.steps.map((s: { id: string }) => s.id)).toEqual(created.steps.map((s: { id: string }) => s.id));
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ text: `گام ${i}` }));
    await owner.agent.patch(`/api/todos/${created.id}`).send({ steps: tooMany }).expect(400);
    await owner.agent.patch(`/api/todos/${created.id}`).send({ remind: 'hourly' }).expect(400);
  });

  it('writes the next note of a repeating one when it is ticked off, and takes it back on «برگردان»', async () => {
    await db.delete(personalTodos);
    const today = toJalali(new Date());
    const monthly = (
      await owner.agent
        .post('/api/todos')
        .send({ title: 'گزارش ماهانه', dueDate: today, repeat: 'monthly', important: true, steps: [{ text: 'فروش', done: false }] })
        .expect(201)
    ).body;
    await owner.agent.patch(`/api/todos/${monthly.id}`).send({ steps: [{ text: 'فروش', done: true }] }).expect(200);
    await owner.agent.patch(`/api/todos/${monthly.id}`).send({ done: true }).expect(200);
    let list = (await owner.agent.get('/api/todos').expect(200)).body as { id: string; dueDate: string; doneAt: string | null; important: boolean; repeat: string; steps: { done: boolean }[] }[];
    const next = list.find((t) => !t.doneAt)!;
    expect(list).toHaveLength(2);
    expect(next).toMatchObject({ dueDate: nextDueDate(today, 'monthly', today), important: true, repeat: 'monthly' });
    expect(next.steps.map((s) => s.done)).toEqual([false]);
    // Ticking it off again does not write another one.
    await owner.agent.patch(`/api/todos/${monthly.id}`).send({ done: true }).expect(200);
    expect((await owner.agent.get('/api/todos').expect(200)).body).toHaveLength(2);

    await owner.agent.patch(`/api/todos/${monthly.id}`).send({ done: false }).expect(200);
    list = (await owner.agent.get('/api/todos').expect(200)).body;
    expect(list.map((t) => t.id)).toEqual([monthly.id]);
    expect(list[0].doneAt).toBeNull();
  });

  it('keeps a next note the person changed when the earlier one is un-ticked, and does not write a second one', async () => {
    await db.delete(personalTodos);
    const today = toJalali(new Date());
    const weekly = (await owner.agent.post('/api/todos').send({ title: 'جلسهٔ هفتگی', dueDate: today, repeat: 'weekly' }).expect(201)).body;
    await owner.agent.patch(`/api/todos/${weekly.id}`).send({ done: true }).expect(200);
    const [next] = await db.select().from(personalTodos).where(eq(personalTodos.previousId, weekly.id));
    await owner.agent.patch(`/api/todos/${next.id}`).send({ note: 'دستور جلسه را بفرستم' }).expect(200);

    await owner.agent.patch(`/api/todos/${weekly.id}`).send({ done: false }).expect(200);
    let list = (await owner.agent.get('/api/todos').expect(200)).body as { id: string; doneAt: string | null }[];
    expect(list.map((t) => t.id).sort()).toEqual([weekly.id, next.id].sort());
    // Ticking the first one off again finds the kept note and writes no other.
    await owner.agent.patch(`/api/todos/${weekly.id}`).send({ done: true }).expect(200);
    list = (await owner.agent.get('/api/todos').expect(200)).body;
    expect(list).toHaveLength(2);
    expect(list.filter((t) => !t.doneAt).map((t) => t.id)).toEqual([next.id]);
  });

  it('keeps the day of a monthly note, also after a shorter month', async () => {
    await db.delete(personalTodos);
    const created = (await owner.agent.post('/api/todos').send({ title: 'اجارهٔ انبار', dueDate: '1405/06/31', repeat: 'monthly' }).expect(201)).body;
    await owner.agent.patch(`/api/todos/${created.id}`).send({ done: true }).expect(200);
    const [next] = await db.select().from(personalTodos).where(eq(personalTodos.previousId, created.id));
    expect(next.repeatDay).toBe(31);
    expect(next.dueDate).toBe(nextDueDate('1405/06/31', 'monthly', toJalali(new Date()), 31));
    // A new date sets the day again; a note that stops repeating forgets it.
    await owner.agent.patch(`/api/todos/${next.id}`).send({ dueDate: '1405/12/15' }).expect(200);
    expect((await db.select().from(personalTodos).where(eq(personalTodos.id, next.id)))[0].repeatDay).toBe(15);
    await owner.agent.patch(`/api/todos/${next.id}`).send({ repeat: null }).expect(200);
    expect((await db.select().from(personalTodos).where(eq(personalTodos.id, next.id)))[0].repeatDay).toBeNull();
  });

  it('works out due dates: quick buttons, groups and the next repeat', () => {
    // 6 Aban 1405 is a Wednesday, the last working day of its week.
    expect(quickDueDates('1405/08/06').map((d) => d.date)).toEqual(['1405/08/06', '1405/08/07', '1405/08/06', '1405/08/13']);
    // From Thursday on, «پایان هفته» is next week's Wednesday.
    expect(quickDueDates('1405/08/07').find((d) => d.id === 'weekEnd')!.date).toBe('1405/08/13');
    expect(quickDueDates('1405/08/03').find((d) => d.id === 'weekEnd')!.date).toBe('1405/08/06');
    expect(todoGroup('1405/08/05', '1405/08/06')).toBe('overdue');
    expect(todoGroup('1405/08/06', '1405/08/06')).toBe('today');
    expect(todoGroup('1405/08/08', '1405/08/06')).toBe('week');
    expect(todoGroup('1405/08/09', '1405/08/06')).toBe('later');
    expect(todoGroup(null, '1405/08/06')).toBe('none');
    expect(nextDueDate('1405/08/06', 'daily', '1405/08/06')).toBe('1405/08/07');
    expect(nextDueDate('1405/08/01', 'daily', '1405/08/06')).toBe('1405/08/07');
    expect(nextDueDate('1405/08/01', 'weekly', '1405/08/06')).toBe('1405/08/08');
    expect(nextDueDate('1405/06/31', 'monthly', '1405/06/31')).toBe('1405/07/30');
    expect(nextDueDate('1405/06/31', 'monthly', '1405/07/30')).toBe('1405/08/30');
    expect(nextDueDate('1405/06/31', 'monthly', '1405/09/01')).toBe('1405/09/30');
    // A note for the 31st keeps its day: 30 in the 30-day months, 29 or 30 in Esfand, 31 again in spring.
    expect(nextDueDate('1405/07/30', 'monthly', '1405/07/30', 31)).toBe('1405/08/30');
    expect(nextDueDate('1405/11/30', 'monthly', '1405/11/30', 31)).toBe('1405/12/29');
    expect(nextDueDate('1405/12/29', 'monthly', '1405/12/29', 31)).toBe('1406/01/31');
    expect(nextDueDate('1405/12/29', 'monthly', '1405/12/29', 15)).toBe('1406/01/15');
  });

  it('adds a news item, event, course or document once while its note is open', async () => {
    await db.delete(personalTodos);
    const source = { type: 'event', id: 'event-123' };
    const first = (await owner.agent.post('/api/todos').send({ title: 'جلسهٔ فروش', dueDate: '1405/09/12', source }).expect(201)).body;
    expect(first).toMatchObject({ sourceType: 'event', sourceId: 'event-123' });
    await owner.agent.post('/api/todos').send({ title: 'دوباره', dueDate: '1405/09/12', source }).expect(409);
    // Someone else may add the same event to their own list.
    await other.agent.post('/api/todos').send({ title: 'جلسهٔ فروش', dueDate: '1405/09/12', source }).expect(201);
    // Once done, it can be added again.
    await owner.agent.patch(`/api/todos/${first.id}`).send({ done: true }).expect(200);
    await owner.agent.post('/api/todos').send({ title: 'دوباره', dueDate: '1405/09/12', source }).expect(201);

    await owner.agent.post('/api/todos/archive').send({}).expect(200);
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
    expect(note.title).toBe('۲ یادداشت امروز سررسید دارد');
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

  it('reminds the morning before as well when asked, and not at all when asked not to', async () => {
    await db.delete(personalTodos);
    await db.delete(notifications);
    const morning = at(8, 30);
    const today = toJalali(morning);
    const tomorrow = toJalali(new Date(morning.getTime() + 24 * 60 * 60 * 1000));
    await owner.agent.post('/api/todos').send({ title: 'قرارداد', dueDate: tomorrow, remind: 'both' }).expect(201);
    await owner.agent.post('/api/todos').send({ title: 'فقط همان روز', dueDate: tomorrow }).expect(201);
    await owner.agent.post('/api/todos').send({ title: 'بی‌یادآوری', dueDate: today, remind: 'none' }).expect(201);
    await db.update(personalTodos).set({ remindedOn: null, remindedBeforeOn: null });

    expect(await processTodoReminders(morning)).toBe(1);
    const [note] = await todoNotifications(owner.id);
    expect(note.title).toBe('یادآوری یادداشت فردا: قرارداد');
    expect(await processTodoReminders(at(10))).toBe(0);

    // The next morning both notes due that day are reminded about, once.
    const nextMorning = new Date(morning.getTime() + 24 * 60 * 60 * 1000);
    expect(await processTodoReminders(nextMorning)).toBe(1);
    const all = await todoNotifications(owner.id);
    expect(all).toHaveLength(2);
    expect(all.map((n) => n.title)).toContain('۲ یادداشت امروز سررسید دارد');
  });

  it('marks a reminder whose morning has passed as sent when the date is set', async () => {
    await db.delete(personalTodos);
    const tomorrow = toJalali(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const created = (await owner.agent.post('/api/todos').send({ title: 'فردا', dueDate: tomorrow, remind: 'both' }).expect(201)).body;
    const [row] = await db.select().from(personalTodos).where(eq(personalTodos.id, created.id));
    expect(row.remindedBeforeOn).toBe(new Date().getHours() >= 8 ? toJalali(new Date()) : null);
    expect(row.remindedOn).toBeNull();
  });

  it('keeps done notes on the page until the person archives them, and in the archive until deleted', async () => {
    await db.delete(personalTodos);
    const add = async (title: string) => (await owner.agent.post('/api/todos').send({ title, dueDate: '1405/09/10' }).expect(201)).body.id;
    const oldId = await add('قدیمی');
    const dayId = await add('همان روز');
    const openId = await add('باز');
    const ids = async (path: string, who = owner) => (await who.agent.get(path).expect(200)).body.map((t: { id: string }) => t.id).sort();

    // Long done, still on the page: nothing is removed by itself any more.
    await db.update(personalTodos).set({ doneAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) }).where(eq(personalTodos.id, oldId));
    expect(await ids('/api/todos')).toEqual([oldId, dayId, openId].sort());

    // An open note cannot be archived, alone or with a day's card.
    await owner.agent.patch(`/api/todos/${openId}`).send({ archived: true }).expect(400);
    expect((await owner.agent.post('/api/todos/archive').send({ ids: [openId] }).expect(200)).body).toEqual({ archived: 0 });

    // One note at a time, or a day's done notes by name.
    const archived = (await owner.agent.patch(`/api/todos/${oldId}`).send({ archived: true }).expect(200)).body;
    expect(archived.archivedAt).not.toBeNull();
    await owner.agent.patch(`/api/todos/${dayId}`).send({ done: true }).expect(200);
    expect((await owner.agent.post('/api/todos/archive').send({ ids: [dayId, openId] }).expect(200)).body).toEqual({ archived: 1 });
    expect(await ids('/api/todos')).toEqual([openId]);
    expect(await ids('/api/todos/archive')).toEqual([oldId, dayId].sort());
    // Nobody else sees or touches it.
    expect(await ids('/api/todos/archive', other)).toEqual([]);
    await other.agent.patch(`/api/todos/${oldId}`).send({ archived: false }).expect(404);

    // Out of the archive: back on the page, still done. Un-ticking an archived note brings it back open.
    const restored = (await owner.agent.patch(`/api/todos/${oldId}`).send({ archived: false }).expect(200)).body;
    expect(restored).toMatchObject({ archivedAt: null });
    expect(restored.doneAt).not.toBeNull();
    const reopened = (await owner.agent.patch(`/api/todos/${dayId}`).send({ done: false }).expect(200)).body;
    expect(reopened).toMatchObject({ archivedAt: null, doneAt: null });
    expect(await ids('/api/todos/archive')).toEqual([]);

    // Emptying the archive deletes only what is in it.
    await owner.agent.post('/api/todos/archive').send({}).expect(200);
    expect(await ids('/api/todos/archive')).toEqual([oldId]);
    await owner.agent.delete('/api/todos/archive').expect(204);
    expect(await ids('/api/todos/archive')).toEqual([]);
    expect(await ids('/api/todos')).toEqual([dayId, openId].sort());

    // While the part is hidden the archive reads empty.
    await setState('off');
    expect((await owner.agent.get('/api/todos/archive').expect(200)).body).toEqual([]);
    await setState('on');
  });
});
