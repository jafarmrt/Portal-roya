import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { auditLog, notices, notifications } from '../server/db/schema';
import { noticeTitle, pruneNotices, startDueNotices } from '../server/routes/notices';
import { toJalali } from '../shared/jalali';
import { noticeDays, noticeLastDay, noticeStatus, noticeWindow } from '../shared/notices';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const DAY = 24 * 60 * 60 * 1000;
const day = (offset: number) => toJalali(new Date(Date.now() + offset * DAY));

const MASK =
  'سلام به همه همکاران عزیز 🌿\n\nبا شروع روزهای سرد و موج سرماخوردگی‌های فصلی، لطفاً اگر حس کسالت دارید یا سرما خورده‌اید، برای مراقبت از همدیگر حتماً در محیط کار ماسک بزنید. 😷\n\nاگر ماسک همراه نیاوردید جای نگرانی نیست؛ می‌توانید از واحد اداری (خانم افسری) تحویل بگیرید.\n\nممنون از توجهتون، همیشه سلامت و تندرست باشید! ✨';

const noticeNotifications = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'notice')));

describe('«تابلوی اعلانات»: short notices on the dashboard', () => {
  let admin: Agent;
  let sales: Person;
  let it1: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sales = await createEmployee(admin, { username: 'notice.sales', department: 'فروش' });
    it1 = await createEmployee(admin, { username: 'notice.it', department: 'فناوری اطلاعات' });
  });
  afterAll(() => pool.end());

  it('works out the days a notice stays on the board', () => {
    expect(noticeLastDay('1405/08/09', 7)).toBe('1405/08/15');
    expect(noticeLastDay('1405/06/30', 3)).toBe('1405/07/01');
    expect(noticeDays('1405/08/09', '1405/08/09')).toBe(1);
    const now = new Date();
    expect(noticeWindow(day(0), day(6), now)).toHaveProperty('startsAt');
    expect(noticeWindow(day(3), day(1), now)).toHaveProperty('error');
    expect(noticeWindow(day(0), day(30), now)).toHaveProperty('error');
    expect(noticeWindow(day(-3), day(-1), now)).toHaveProperty('error');
    expect(noticeWindow(day(61), day(62), now)).toHaveProperty('error');
    expect(noticeStatus({ startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + 2 * DAY) })).toBe('scheduled');
    expect(noticeTitle('\n  سلام به همه 🌿\nادامه')).toBe('سلام به همه 🌿');
  });

  it('shows the whole text on the dashboard of its audience, and never in the news list', async () => {
    const created = (
      await admin.post('/api/notices').send({ text: `  ${MASK}  `, sender: 'واحد اداری', firstDay: day(0), lastDay: day(6) }).expect(201)
    ).body;
    expect(created).toMatchObject({ text: MASK, sender: 'واحد اداری', important: false, seen: false });
    const board = (await sales.agent.get('/api/notices').expect(200)).body;
    expect(board.map((n: { id: string }) => n.id)).toEqual([created.id]);
    expect(board[0].text).toBe(MASK);
    expect((await sales.agent.get('/api/news').expect(200)).body.items).toEqual([]);
    // No bell notification unless the publisher asks for one.
    expect(await noticeNotifications(sales.id)).toEqual([]);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entity, 'notice'));
    expect(entry).toMatchObject({ action: 'create', title: 'سلام به همه همکاران عزیز 🌿' });
    // Guests on the company network see notices for everyone.
    expect((await request(app).get('/api/notices').expect(200)).body).toHaveLength(1);
  });

  it('keeps a notice for one department to that department', async () => {
    const forSales = (
      await admin.post('/api/notices').send({ text: 'جلسهٔ فروش', firstDay: day(0), lastDay: day(0), important: true, targetDepartments: ['فروش'] }).expect(201)
    ).body;
    const salesBoard = (await sales.agent.get('/api/notices').expect(200)).body;
    // Important notices come first.
    expect(salesBoard[0].id).toBe(forSales.id);
    expect((await it1.agent.get('/api/notices').expect(200)).body.map((n: { id: string }) => n.id)).not.toContain(forSales.id);
    expect((await request(app).get('/api/notices').expect(200)).body.map((n: { id: string }) => n.id)).not.toContain(forSales.id);
    await it1.agent.post(`/api/notices/${forSales.id}/seen`).expect(404);
  });

  it('folds a notice away for one person with «دیدم», and opens it again when its text changes', async () => {
    const [mask] = (await sales.agent.get('/api/notices').expect(200)).body.filter((n: { text: string }) => n.text === MASK);
    await sales.agent.post(`/api/notices/${mask.id}/seen`).expect(204);
    await sales.agent.post(`/api/notices/${mask.id}/seen`).expect(204);
    const after = (await sales.agent.get('/api/notices').expect(200)).body.find((n: { id: string }) => n.id === mask.id);
    expect(after.seen).toBe(true);
    expect((await it1.agent.get('/api/notices').expect(200)).body.find((n: { id: string }) => n.id === mask.id).seen).toBe(false);

    const managed = (await admin.get('/api/notices/manage').expect(200)).body.find((n: { id: string }) => n.id === mask.id);
    expect(managed.stats.seen).toBe(1);
    expect(managed.stats.audience).toBe(3);

    await sales.agent.delete(`/api/notices/${mask.id}/seen`).expect(204);
    await sales.agent.post(`/api/notices/${mask.id}/seen`).expect(204);
    // Same text: still folded. New text: open again for everyone.
    await admin.put(`/api/notices/${mask.id}`).send({ text: MASK, sender: 'واحد اداری', important: true, firstDay: day(0), lastDay: day(6) }).expect(200);
    expect((await sales.agent.get('/api/notices').expect(200)).body.find((n: { id: string }) => n.id === mask.id).seen).toBe(true);
    await admin.put(`/api/notices/${mask.id}`).send({ text: `${MASK} 🙏`, sender: 'واحد اداری', firstDay: day(0), lastDay: day(6) }).expect(200);
    expect((await sales.agent.get('/api/notices').expect(200)).body.find((n: { id: string }) => n.id === mask.id).seen).toBe(false);
  });

  it('only lets the people who publish news add, change or remove notices', async () => {
    await sales.agent.post('/api/notices').send({ text: 'x', firstDay: day(0), lastDay: day(0) }).expect(403);
    await sales.agent.get('/api/notices/manage').expect(403);
    const [one] = (await sales.agent.get('/api/notices').expect(200)).body;
    await sales.agent.put(`/api/notices/${one.id}`).send({ text: 'x', firstDay: day(0), lastDay: day(0) }).expect(403);
    await sales.agent.delete(`/api/notices/${one.id}`).expect(403);
    await admin.post('/api/notices').send({ text: 'x'.repeat(601), firstDay: day(0), lastDay: day(0) }).expect(400);
    await admin.post('/api/notices').send({ text: 'x', firstDay: day(0), lastDay: day(40) }).expect(400);
  });

  it('keeps a scheduled notice off the board until its first day, then sends the notification asked for', async () => {
    const scheduled = (
      await admin.post('/api/notices').send({ text: 'فردا آب قطع است', notify: true, firstDay: day(1), lastDay: day(2) }).expect(201)
    ).body;
    expect((await sales.agent.get('/api/notices').expect(200)).body.map((n: { id: string }) => n.id)).not.toContain(scheduled.id);
    expect((await admin.get('/api/notices/manage').expect(200)).body.map((n: { id: string }) => n.id)).toContain(scheduled.id);
    expect(await noticeNotifications(sales.id)).toEqual([]);

    await startDueNotices(new Date(Date.now() + 1.2 * DAY));
    const sent = await noticeNotifications(sales.id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ message: 'فردا آب قطع است', linkTab: 'dashboard' });
    // Once only, and never to the publisher.
    await startDueNotices(new Date(Date.now() + 1.3 * DAY));
    expect(await noticeNotifications(sales.id)).toHaveLength(1);
    const [me] = await db.select({ id: notices.createdById }).from(notices).where(eq(notices.id, scheduled.id));
    expect(await noticeNotifications(me.id!)).toEqual([]);
  });

  it('sends the notification at once for a notice that starts today', async () => {
    await admin.post('/api/notices').send({ text: 'امروز ناهار زودتر', notify: true, firstDay: day(0), lastDay: day(0), targetDepartments: ['فناوری اطلاعات'] }).expect(201);
    expect((await noticeNotifications(it1.id)).map((n) => n.message)).toContain('امروز ناهار زودتر');
    expect((await noticeNotifications(sales.id)).map((n) => n.message)).not.toContain('امروز ناهار زودتر');
  });

  it('takes ended notices off the board and removes them after a while', async () => {
    const created = (await admin.post('/api/notices').send({ text: 'قدیمی', firstDay: day(0), lastDay: day(0) }).expect(201)).body;
    await db.update(notices).set({ startsAt: new Date(Date.now() - 100 * DAY), endsAt: new Date(Date.now() - 95 * DAY) }).where(eq(notices.id, created.id));
    expect((await sales.agent.get('/api/notices').expect(200)).body.map((n: { id: string }) => n.id)).not.toContain(created.id);
    await pruneNotices();
    expect(await db.select().from(notices).where(eq(notices.id, created.id))).toEqual([]);
  });

  it('is out of reach once an administrator switches it off', async () => {
    await admin.put('/api/settings/features/noticeBoard').send({ state: 'off' }).expect(200);
    expect((await sales.agent.get('/api/settings').expect(200)).body.features).not.toHaveProperty('noticeBoard');
    expect((await sales.agent.get('/api/notices').expect(200)).body).toEqual([]);
    const [any] = await db.select().from(notices).limit(1);
    await sales.agent.post(`/api/notices/${any.id}/seen`).expect(404);
    await admin.put('/api/settings/features/noticeBoard').send({ state: 'on' }).expect(200);
    expect((await sales.agent.get('/api/notices').expect(200)).body.length).toBeGreaterThan(0);
  });

  it('removes a notice for good', async () => {
    const created = (await admin.post('/api/notices').send({ text: 'حذفی', firstDay: day(0), lastDay: day(0) }).expect(201)).body;
    await admin.delete(`/api/notices/${created.id}`).expect(204);
    expect((await sales.agent.get('/api/notices').expect(200)).body.map((n: { id: string }) => n.id)).not.toContain(created.id);
    await admin.delete(`/api/notices/${created.id}`).expect(404);
  });
});
