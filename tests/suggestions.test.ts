import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { auditLog, notifications, settings, suggestions } from '../server/db/schema';
import { releaseAnonymousSuggestions, tehranDay } from '../server/routes/suggestions';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const notesOf = async (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

describe('suggestions & complaints boxes', () => {
  let admin: Agent;
  let ceo: Person;
  let hr: Person;
  let sender: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    const ceoRole = (await admin.post('/api/roles').send({ name: 'مدیرعامل', permissions: ['suggestions.management'] }).expect(201)).body.id;
    const hrRole = (await admin.post('/api/roles').send({ name: 'منابع انسانی', permissions: ['suggestions.hr'] }).expect(201)).body.id;
    ceo = await createEmployee(admin, { username: 'box.ceo', role: ceoRole });
    hr = await createEmployee(admin, { username: 'box.hr', role: hrRole });
    sender = await createEmployee(admin, { username: 'box.sender', department: 'تولید' });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('keeps no trace of the sender of an anonymous message', async () => {
    const auditBefore = (await db.select().from(auditLog)).length;
    const res = await sender.agent
      .post('/api/suggestions')
      .send({ box: 'hr', kind: 'criticism', subject: 'اضافه‌کاری', body: 'اضافه‌کاری دیر پرداخت می‌شود.', anonymous: true })
      .expect(201);
    expect(res.body.trackingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const [row] = await db.select().from(suggestions).where(eq(suggestions.id, res.body.id));
    expect(row.senderId).toBeNull();
    expect(row.isAnonymous).toBe(true);
    expect(row.createdAt.getTime()).toBe(tehranDay(row.createdAt).getTime());
    // Neither the stored row nor the change history mentions the sender.
    expect(JSON.stringify(row)).not.toContain(sender.id);
    expect(JSON.stringify(row)).not.toContain(res.body.trackingCode);
    expect((await db.select().from(auditLog)).length).toBe(auditBefore);

    // Nobody hears of it on the day it is written, so its hour cannot be guessed from who was online.
    expect((await hr.agent.get('/api/suggestions/box/hr').expect(200)).body).toHaveLength(0);
    expect((await hr.agent.get('/api/suggestions/summary').expect(200)).body.unread.hr).toBe(0);
    expect((await notesOf(hr.id)).filter((n) => n.type === 'suggestion')).toHaveLength(0);
    await hr.agent.post(`/api/suggestions/${res.body.id}/read`).expect(404);
    const HOUR = 60 * 60 * 1000;
    expect(await releaseAnonymousSuggestions(new Date(row.createdAt.getTime() + 6 * HOUR))).toBe(0); // 18:00 the same day
    expect(await releaseAnonymousSuggestions(new Date(row.createdAt.getTime() + 21 * HOUR))).toBe(0); // 09:00 the next day
    expect(await releaseAnonymousSuggestions(new Date(row.createdAt.getTime() + 22 * HOUR))).toBe(1); // 10:00 the next day
    expect(await releaseAnonymousSuggestions(new Date(row.createdAt.getTime() + 23 * HOUR))).toBe(0);

    // Then HR reads it without a name; management and the sender's colleagues cannot.
    const box = (await hr.agent.get('/api/suggestions/box/hr').expect(200)).body;
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({ subject: 'اضافه‌کاری', sender: null, isAnonymous: true });
    await ceo.agent.get('/api/suggestions/box/hr').expect(403);
    await sender.agent.get('/api/suggestions/box/hr').expect(403);
    expect((await notesOf(hr.id)).map((n) => n.title)).toContain('پیام ناشناس تازه در صندوق منابع انسانی 📮');
    expect((await notesOf(ceo.id)).filter((n) => n.type === 'suggestion')).toHaveLength(0);
    expect(JSON.stringify(await notesOf(hr.id))).not.toContain('box.sender');

    // It is not among the sender's own messages; the code finds it and, later, the answer.
    expect((await sender.agent.get('/api/suggestions/mine').expect(200)).body).toHaveLength(0);
    await hr.agent.put(`/api/suggestions/${res.body.id}/reply`).send({ reply: 'از ماه آینده به موقع پرداخت می‌شود.' }).expect(200);
    const typed = res.body.trackingCode.toLowerCase().replace(/-/g, ' ');
    const tracked = (await sender.agent.post('/api/suggestions/track').send({ code: typed }).expect(200)).body;
    expect(tracked).toMatchObject({ subject: 'اضافه‌کاری', reply: 'از ماه آینده به موقع پرداخت می‌شود.', isRead: true });
    await sender.agent.post('/api/suggestions/track').send({ code: 'AAAA-BBBB-CCCC' }).expect(404);
  });

  it('shows the name of a named message and tells the sender about the answer', async () => {
    const res = await sender.agent
      .post('/api/suggestions')
      .send({ box: 'management', subject: 'سرویس ایاب و ذهاب', body: 'برای شیفت عصر سرویس بگذارید.' })
      .expect(201);
    expect(res.body.trackingCode).toBeNull();

    const summary = (await ceo.agent.get('/api/suggestions/summary').expect(200)).body;
    expect(summary).toEqual({ boxes: ['management'], unread: { management: 1 } });
    expect((await sender.agent.get('/api/suggestions/summary').expect(200)).body.boxes).toEqual([]);

    const [item] = (await ceo.agent.get('/api/suggestions/box/management').expect(200)).body;
    expect(item.sender).toMatchObject({ id: sender.id, department: 'تولید' });
    await ceo.agent.post(`/api/suggestions/${item.id}/read`).expect(200);
    expect((await ceo.agent.get('/api/suggestions/summary').expect(200)).body.unread.management).toBe(0);

    await ceo.agent.put(`/api/suggestions/${item.id}/reply`).send({ reply: 'از هفتهٔ بعد اضافه می‌شود.' }).expect(200);
    expect((await notesOf(sender.id)).map((n) => n.title)).toContain('پاسخ صندوق مدیریت 💬');
    const [mine] = (await sender.agent.get('/api/suggestions/mine').expect(200)).body;
    expect(mine).toMatchObject({ subject: 'سرویس ایاب و ذهاب', reply: 'از هفتهٔ بعد اضافه می‌شود.' });
    expect(mine.sender).toBeUndefined();

    // Only readers archive or remove; the admin reads every box.
    await sender.agent.patch(`/api/suggestions/${item.id}`).send({ closed: true }).expect(403);
    await ceo.agent.patch(`/api/suggestions/${item.id}`).send({ closed: true }).expect(200);
    expect((await admin.get('/api/suggestions/summary').expect(200)).body.boxes).toEqual(['management', 'hr']);
    await hr.agent.delete(`/api/suggestions/${item.id}`).expect(403);
    await ceo.agent.delete(`/api/suggestions/${item.id}`).expect(200);
  });

  it('checks the box and the text', async () => {
    await sender.agent.post('/api/suggestions').send({ box: 'it', subject: 'الف', body: 'ب' }).expect(400);
    await sender.agent.post('/api/suggestions').send({ box: 'hr', subject: ' ', body: 'ب' }).expect(400);
  });

  it('switches each box on and off on its own, and keeps a closed box\'s messages for its readers', async () => {
    const msg = { kind: 'suggestion', subject: 'پارکینگ', body: 'جای پارک کم است.', anonymous: false };
    const sent = (await sender.agent.post('/api/suggestions').send({ ...msg, box: 'hr' }).expect(201)).body.id;

    // A legacy single switch for the whole section counts for both boxes until one is changed.
    await db.update(settings).set({ features: { suggestions: 'on' } }).where(eq(settings.id, 'global'));
    await admin.put('/api/settings/features/suggestionsHr').send({ state: 'off' }).expect(200);
    const [row] = await db.select({ features: settings.features }).from(settings).where(eq(settings.id, 'global'));
    expect(row.features).toEqual({ suggestionsManagement: 'on', suggestionsHr: 'off' });

    // Only the management box is open: the page stays, HR takes nothing new.
    const features = (await sender.agent.get('/api/settings').expect(200)).body.features;
    expect(features).toMatchObject({ suggestions: 'on', suggestionsManagement: 'on' });
    expect(features).not.toHaveProperty('suggestionsHr');
    await sender.agent.post('/api/suggestions').send({ ...msg, box: 'hr' }).expect(400);
    await sender.agent.post('/api/suggestions').send({ ...msg, box: 'management' }).expect(201);

    // HR still reads and answers what arrived before.
    const box = (await hr.agent.get('/api/suggestions/box/hr').expect(200)).body;
    expect(box.map((m: { id: string }) => m.id)).toContain(sent);
    await hr.agent.put(`/api/suggestions/${sent}/reply`).send({ reply: 'بررسی می‌کنیم.' }).expect(200);

    // With both boxes off the whole page is gone, for its readers too; nothing is deleted.
    await admin.put('/api/settings/features/suggestionsManagement').send({ state: 'off' }).expect(200);
    expect((await sender.agent.get('/api/settings').expect(200)).body.features).not.toHaveProperty('suggestions');
    await hr.agent.get('/api/suggestions/box/hr').expect(404);
    await admin.put('/api/settings/features/suggestionsManagement').send({ state: 'on' }).expect(200);
    await admin.put('/api/settings/features/suggestionsHr').send({ state: 'on' }).expect(200);
    expect((await hr.agent.get('/api/suggestions/box/hr').expect(200)).body.map((m: { id: string }) => m.id)).toContain(sent);
  });

  it('lets the administrator rename a box and who it goes to', async () => {
    const res = await admin
      .put('/api/settings')
      .send({ suggestionBoxNames: { management: { label: 'صندوق مدیرعامل', to: 'مدیرعامل' } } })
      .expect(200);
    expect(res.body.suggestionBoxNames).toEqual({ management: { label: 'صندوق مدیرعامل', to: 'مدیرعامل' } });
    // Renaming one box keeps the other's names.
    await admin.put('/api/settings').send({ suggestionBoxNames: { hr: { label: '', to: 'کارگزینی' } } }).expect(200);
    expect((await sender.agent.get('/api/settings').expect(200)).body.suggestionBoxNames).toEqual({
      management: { label: 'صندوق مدیرعامل', to: 'مدیرعامل' },
      hr: { label: '', to: 'کارگزینی' },
    });
    await sender.agent.put('/api/settings').send({ suggestionBoxNames: { hr: { label: 'x', to: 'y' } } }).expect(403);

    await sender.agent.post('/api/suggestions').send({ box: 'management', subject: 'ناهار', body: 'غذا سرد است.' }).expect(201);
    expect((await notesOf(ceo.id)).map((n) => n.title)).toContain('پیام تازه در صندوق مدیرعامل 📮');
    const features = (await admin.get('/api/settings/features').expect(200)).body.features;
    expect(features.find((f: { key: string }) => f.key === 'suggestionsManagement').label).toBe('صندوق مدیرعامل');
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.title, 'نام صندوق‌های انتقادات و پیشنهادات'));
    expect(entry.detail).toContain('صندوق مدیرعامل');
  });

  it('keeps an anonymous message on the day it was sent, in Tehran time', () => {
    // 23:00 in Tehran is 19:30 UTC, and noon of that day 08:30 UTC; Tehran's next day begins at 20:30 UTC.
    expect(tehranDay(new Date('2026-10-27T19:30:00Z')).toISOString()).toBe('2026-10-27T08:30:00.000Z');
    expect(tehranDay(new Date('2026-10-27T20:30:00Z')).toISOString()).toBe('2026-10-28T08:30:00.000Z');
    expect(tehranDay(new Date('2026-10-27T20:29:00Z')).toISOString()).toBe('2026-10-27T08:30:00.000Z');
  });
});
