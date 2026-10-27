import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { employees, news, notifications } from '../server/db/schema';
import { reconcileLocations } from '../server/departments';
import { sanitizeRichText } from '../server/richText';
import { processAckDeadlines } from '../server/routes/news';
import { DEFAULT_LOCATIONS } from '../server/settings';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const SHIRAZ = 'شعبه شیراز';
const MASHHAD = 'شعبه مشهد';
const WAREHOUSE = 'انبار';

const base = { summary: 'خلاصه', content: 'متن', category: 'اطلاعیه' };
const idsOf = async (agent: Agent) => ((await agent.get('/api/news').expect(200)).body.items as { id: string }[]).map((n) => n.id);
const notificationsOf = async (id: string) => db.select().from(notifications).where(eq(notifications.userId, id));

describe('rich text', () => {
  it('keeps formatting and drops anything that could run code', () => {
    const html = sanitizeRichText(
      '<h2 onclick="x()">تیتر</h2><p style="color:red">متن <strong>پررنگ</strong><script>alert(1)</script></p>' +
        '<img src="/uploads/abc-1.png" onerror="x()"><img src="https://evil.example/p.gif"><a href="javascript:alert(1)">بد</a>' +
        '<a href="https://example.com">بیرون</a><a href="#news/1">درون</a><table><tr><td colspan="2">خانه</td></tr></table>',
    );
    expect(html).toContain('<h2>تیتر</h2>');
    expect(html).toContain('<strong>پررنگ</strong>');
    expect(html).not.toMatch(/script|onclick|onerror|style=|javascript:|evil\.example/);
    expect(html).toContain('<img src="/uploads/abc-1.png" />');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">بیرون</a>');
    expect(html).toContain('<a href="#news/1">درون</a>');
    expect(html).toContain('<td colspan="2">خانه</td>');
  });
});

describe('news audience, deadlines and locations', () => {
  let admin: Agent;
  let shirazSales: Person;
  let mashhadSales: Person;
  let shirazDesign: Person;
  let warehouseManager: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    shirazSales = await createEmployee(admin, { username: 'sales.shiraz', department: 'فروش' });
    mashhadSales = await createEmployee(admin, { username: 'sales.mashhad', department: 'فروش' });
    shirazDesign = await createEmployee(admin, { username: 'design.shiraz', department: 'طراحی' });
    warehouseManager = await createEmployee(admin, { username: 'boss.warehouse', department: 'تولید', role: 'manager' });
    await admin.patch(`/api/employees/${shirazSales.id}`).send({ location: SHIRAZ, directManagerId: warehouseManager.id }).expect(200);
    await admin.patch(`/api/employees/${mashhadSales.id}`).send({ location: MASHHAD }).expect(200);
    await admin.patch(`/api/employees/${shirazDesign.id}`).send({ location: SHIRAZ }).expect(200);
    await admin.patch(`/api/employees/${warehouseManager.id}`).send({ location: WAREHOUSE }).expect(200);
  });
  afterAll(() => pool.end());

  it('starts with the company’s locations and only accepts locations from the list', async () => {
    const settings = await admin.get('/api/settings').expect(200);
    expect(settings.body.locations).toEqual(DEFAULT_LOCATIONS);

    const bad = await admin.patch(`/api/employees/${mashhadSales.id}`).send({ location: 'کارخانه' }).expect(400);
    expect(bad.body.error).toContain('کارخانه');
    // Colleagues can fix their own location, also to "unknown".
    await mashhadSales.agent.patch(`/api/employees/${mashhadSales.id}`).send({ location: '' }).expect(200);
    await mashhadSales.agent.patch(`/api/employees/${mashhadSales.id}`).send({ location: MASHHAD }).expect(200);
  });

  it('narrows the audience by department and location together', async () => {
    const item = await admin
      .post('/api/news')
      .send({ ...base, title: 'فروش شیراز', targetDepartments: ['فروش'], targetLocations: [SHIRAZ] })
      .expect(201);
    expect(await idsOf(shirazSales.agent)).toContain(item.body.id);
    expect(await idsOf(mashhadSales.agent)).not.toContain(item.body.id);
    expect(await idsOf(shirazDesign.agent)).not.toContain(item.body.id);
    expect(item.body.readStats.audience).toBe(1);

    expect((await notificationsOf(shirazSales.id)).some((n) => n.linkId === item.body.id)).toBe(true);
    expect((await notificationsOf(mashhadSales.id)).some((n) => n.linkId === item.body.id)).toBe(false);

    const byLocation = await admin.post('/api/news').send({ ...base, title: 'همه در شیراز', targetLocations: [SHIRAZ] }).expect(201);
    expect(byLocation.body.readStats.audience).toBe(2);
    expect(await idsOf(shirazDesign.agent)).toContain(byLocation.body.id);
  });

  it('adds people chosen by name to a role audience, and keeps their names from colleagues', async () => {
    const item = await admin
      .post('/api/news')
      .send({ ...base, title: 'مدیران و یک نفر', targetRoles: ['manager'], targetUserIds: [shirazDesign.id] })
      .expect(201);
    expect(await idsOf(warehouseManager.agent)).toContain(item.body.id);
    expect(await idsOf(shirazDesign.agent)).toContain(item.body.id);
    expect(await idsOf(shirazSales.agent)).not.toContain(item.body.id);
    expect(item.body.readStats.audience).toBe(2);

    const seen = await shirazDesign.agent.get(`/api/news/${item.body.id}`).expect(200);
    expect(seen.body.targetUserIds).toEqual([]);
    expect(seen.body.targetUserCount).toBe(1);

    // Guests only see news meant for everyone.
    const guest = await request(app).get('/api/news').expect(200);
    expect(guest.body.items.map((n: { id: string }) => n.id)).not.toContain(item.body.id);
  });

  it('rejects unknown locations, roles and people', async () => {
    await admin.post('/api/news').send({ ...base, title: 'x', targetLocations: ['کارخانه'] }).expect(400);
    await admin.post('/api/news').send({ ...base, title: 'x', targetRoles: ['no-such-role'] }).expect(400);
    await admin.post('/api/news').send({ ...base, title: 'x', targetUserIds: ['no-such-person'] }).expect(400);
  });

  it('stores editor text cleaned and refuses empty text', async () => {
    const item = await admin
      .post('/api/news')
      .send({ ...base, title: 'قالب‌دار', contentFormat: 'html', content: '<h2>عنوان</h2><p>متن<script>alert(1)</script></p>' })
      .expect(201);
    expect(item.body.contentFormat).toBe('html');
    expect(item.body.content).toBe('<h2>عنوان</h2><p>متن</p>');

    const empty = await admin.post('/api/news').send({ ...base, title: 'خالی', contentFormat: 'html', content: '<p> </p><script>x</script>' }).expect(400);
    expect(empty.body.error).toContain('متن کامل');
  });

  it('checks the acknowledgement deadline', async () => {
    await admin
      .post('/api/news')
      .send({ ...base, title: 'دیر', requiresAck: true, publishDate: '1499/01/10', publishTime: '08:00', ackDate: '1499/01/05' })
      .expect(400);
    const plain = await admin.post('/api/news').send({ ...base, title: 'بی‌مهلت', ackDate: '1499/01/05' }).expect(201);
    expect(plain.body.ackDeadline).toBeNull();
    const circular = await admin.post('/api/news').send({ ...base, title: 'با مهلت', requiresAck: true, ackDate: '1499/01/05' }).expect(201);
    expect(circular.body.ackDeadline).toBeTruthy();
  });

  it('reminds those who have not acknowledged, at most once in ten minutes', async () => {
    const circular = await admin
      .post('/api/news')
      .send({ ...base, title: 'بخشنامهٔ فروش', requiresAck: true, targetDepartments: ['فروش'] })
      .expect(201);
    await shirazSales.agent.post(`/api/news/${circular.body.id}/ack`).expect(200);

    await shirazSales.agent.post(`/api/news/${circular.body.id}/remind`).expect(403);
    const sent = await admin.post(`/api/news/${circular.body.id}/remind`).expect(200);
    expect(sent.body.sent).toBe(1);
    const reminders = (await notificationsOf(mashhadSales.id)).filter((n) => n.linkId === circular.body.id);
    expect(reminders.map((n) => n.title)).toContain('یادآوری: بخشنامه را مطالعه و تأیید کنید 📌');
    expect((await notificationsOf(shirazSales.id)).filter((n) => n.linkId === circular.body.id)).toHaveLength(1);

    await admin.post(`/api/news/${circular.body.id}/remind`).expect(429);
  });

  it('reminds a day before the deadline and reports to the publisher and direct managers after it', async () => {
    const circular = await admin
      .post('/api/news')
      .send({ ...base, title: 'دستورالعمل انبار', requiresAck: true, targetDepartments: ['فروش'], ackDate: '1499/01/05' })
      .expect(201);
    const id = circular.body.id;
    await mashhadSales.agent.post(`/api/news/${id}/ack`).expect(200);

    const now = new Date();
    const hour = 60 * 60 * 1000;
    await db.update(news).set({ publishAt: new Date(now.getTime() - 48 * hour), ackDeadline: new Date(now.getTime() + 12 * hour) }).where(eq(news.id, id));
    await processAckDeadlines(now);
    await processAckDeadlines(now);
    const soon = (await notificationsOf(shirazSales.id)).filter((n) => n.linkId === id && n.title.includes('مهلت'));
    expect(soon).toHaveLength(1);
    expect((await notificationsOf(mashhadSales.id)).filter((n) => n.linkId === id && n.title.includes('مهلت'))).toHaveLength(0);

    await db.update(news).set({ ackDeadline: new Date(now.getTime() - hour) }).where(eq(news.id, id));
    await processAckDeadlines(now);
    await processAckDeadlines(now);
    const [adminRow] = await db.select().from(employees).where(eq(employees.username, 'admin'));
    const report = (await notificationsOf(adminRow.id)).filter((n) => n.linkId === id);
    expect(report).toHaveLength(1);
    expect(report[0].title).toContain('۱ نفر');
    expect(report[0].message).toContain('فروش ۱ نفر');

    // The direct manager hears about their own person, without a link they could not open.
    const toManager = (await notificationsOf(warehouseManager.id)).filter((n) => n.message.includes('دستورالعمل انبار'));
    expect(toManager).toHaveLength(1);
    expect(toManager[0].message).toContain('همکار sales.shiraz');
    expect(toManager[0].linkId).toBeFalsy();
  });

  it('shows the location in read receipts', async () => {
    const item = await admin.post('/api/news').send({ ...base, title: 'رسید', targetDepartments: ['طراحی'] }).expect(201);
    const receipts = await admin.get(`/api/news/${item.body.id}/receipts`).expect(200);
    expect(receipts.body).toEqual([expect.objectContaining({ userId: shirazDesign.id, location: SHIRAZ })]);
  });

  it('renames and merges locations everywhere and keeps one in use', async () => {
    const item = await admin.post('/api/news').send({ ...base, title: 'انبار', targetLocations: [WAREHOUSE] }).expect(201);

    const renamed = await admin.post('/api/settings/locations/rename').send({ from: WAREHOUSE, to: 'انبار مرکزی' }).expect(200);
    expect(renamed.body).toMatchObject({ to: 'انبار مرکزی', merged: false });
    const after = await admin.get(`/api/news/${item.body.id}`).expect(200);
    expect(after.body.targetLocations).toEqual(['انبار مرکزی']);
    const [manager] = await db.select().from(employees).where(eq(employees.id, warehouseManager.id));
    expect(manager.location).toBe('انبار مرکزی');

    const usage = await admin.get('/api/settings/locations').expect(200);
    expect(usage.body.find((u: { name: string }) => u.name === SHIRAZ)).toMatchObject({ employees: 2 });

    const list = (await admin.get('/api/settings').expect(200)).body.locations as string[];
    const removeInUse = await admin.put('/api/settings').send({ locations: list.filter((l) => l !== SHIRAZ) }).expect(400);
    expect(removeInUse.body.error).toContain(SHIRAZ);

    const merged = await admin.post('/api/settings/locations/rename').send({ from: MASHHAD, to: SHIRAZ }).expect(200);
    expect(merged.body.merged).toBe(true);
    const [moved] = await db.select().from(employees).where(eq(employees.id, mashhadSales.id));
    expect(moved.location).toBe(SHIRAZ);
    await shirazSales.agent.get('/api/settings/locations').expect(403);
  });

  it('adds places written in older profiles to the list at start-up', async () => {
    await db.update(employees).set({ location: 'دفتر مرکزی - طبقه ۲' }).where(eq(employees.id, shirazDesign.id));
    await reconcileLocations();
    const list = (await admin.get('/api/settings').expect(200)).body.locations as string[];
    expect(list).toContain('دفتر مرکزی - طبقه ۲');
  });

  it('flags an unknown location when importing staff', async () => {
    const csv = '﻿first name,last name,position,department,location\nSara,Karimi,Designer,طراحی,کارخانه\nAli,Navid,Designer,طراحی,شعبه قم\n';
    const res = await admin.post('/api/employees/import/preview').attach('file', Buffer.from(csv), 'staff.csv').expect(200);
    expect(res.body.rows[0].errors.join(' ')).toContain('کارخانه');
    expect(res.body.rows[1]).toMatchObject({ errors: [], data: { location: 'شعبه قم' } });
  });

  it('lets administrators switch dashboard cards off', async () => {
    const saved = await admin.put('/api/settings').send({ dashboardCards: { mood: false } }).expect(200);
    expect(saved.body.dashboardCards).toEqual({ mood: false });
    expect((await request(app).get('/api/settings').expect(200)).body.dashboardCards).toEqual({ mood: false });
    await shirazSales.agent.put('/api/settings').send({ dashboardCards: { mood: true } }).expect(403);
  });
});
