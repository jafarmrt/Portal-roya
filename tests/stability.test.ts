import fs from 'fs/promises';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { toJalali } from '../shared/jalali';
import { db, pool } from '../server/db/index';
import { employees, news, notifications } from '../server/db/schema';
import { pruneNotifications } from '../server/maintenance';
import { createEmployee, resetDatabase, setupAdmin, TEST_DEPARTMENTS } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;

const DAY_MS = 24 * 60 * 60 * 1000;

describe('stability fixes', () => {
  let admin: Agent;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    await createEmployee(admin, { username: 'st.reader', department: 'فروش' });
  });
  afterAll(() => pool.end());

  it('lets a publisher fix a circular after its acknowledgement deadline has passed', async () => {
    const tomorrow = toJalali(new Date(Date.now() + DAY_MS));
    const circular = {
      title: 'بخشنامهٔ ایمنی',
      summary: 'خلاصه',
      content: 'متن بخشنامه',
      category: 'بخشنامه',
      requiresAck: true,
      ackDate: tomorrow,
    };
    const created = (await admin.post('/api/news').send(circular).expect(201)).body as { id: string };
    // A week later: published long ago, deadline over.
    const publishedAt = new Date(Date.now() - 7 * DAY_MS);
    const deadline = new Date(Date.now() - 2 * DAY_MS);
    await db.update(news).set({ publishAt: publishedAt, ackDeadline: deadline }).where(eq(news.id, created.id));

    // The edit form sends the item back as it is, with the old deadline and no publish date.
    const res = await admin
      .patch(`/api/news/${created.id}`)
      .send({ ...circular, title: 'بخشنامهٔ ایمنی (اصلاح)', ackDate: toJalali(deadline) })
      .expect(200);
    expect(res.body.title).toBe('بخشنامهٔ ایمنی (اصلاح)');
    const [row] = await db.select().from(news).where(eq(news.id, created.id));
    expect(row.publishAt.getTime()).toBe(publishedAt.getTime());
  });

  it('still refuses a new circular whose deadline is before it goes out', async () => {
    const yesterday = toJalali(new Date(Date.now() - DAY_MS));
    await admin
      .post('/api/news')
      .send({ title: 'قدیمی', summary: 'خلاصه', content: 'متن', category: 'بخشنامه', requiresAck: true, ackDate: yesterday })
      .expect(400);
  });

  it('keeps a department in the list while a calendar event is addressed to it', async () => {
    const event = (
      await admin
        .post('/api/calendar_events')
        .send({ title: 'بازدید کارخانه', date: '1406/02/10', type: 'event', notify: false, targetDepartments: ['تولید'] })
        .expect(201)
    ).body as { id: string };
    const usage = (await admin.get('/api/settings/departments').expect(200)).body as { name: string; events: number }[];
    expect(usage.find((u) => u.name === 'تولید')?.events).toBe(1);
    // Dropping it would leave the event pointing at a removed department, which the next start-up adds back.
    await admin.put('/api/settings').send({ departments: TEST_DEPARTMENTS.filter((d) => d !== 'تولید') }).expect(400);
    await admin.delete(`/api/calendar_events/${event.id}`).expect(200);
    await admin.put('/api/settings').send({ departments: TEST_DEPARTMENTS.filter((d) => d !== 'تولید') }).expect(200);
  });

  it('refuses uploads when the disk is nearly full, so the database keeps room to work', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const spy = vi.spyOn(fs, 'statfs').mockResolvedValue({ bavail: 10, bsize: 1024 * 1024, blocks: 20_000 } as Awaited<ReturnType<typeof fs.statfs>>);
    try {
      const res = await admin.post('/api/uploads').attach('file', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(507);
    } finally {
      spy.mockRestore();
    }
    await admin.post('/api/uploads').attach('file', png, { filename: 'a.png', contentType: 'image/png' }).expect(201);
  });

  it('deletes notifications older than half a year at night and keeps the recent ones', async () => {
    const [someone] = await db.select().from(employees).limit(1);
    const now = new Date();
    const old = new Date(now.getTime() - 200 * DAY_MS);
    const recent = new Date(now.getTime() - 20 * DAY_MS);
    await db.insert(notifications).values([
      { userId: someone.id, title: 'old', message: '', type: 'system', createdAt: old },
      { userId: someone.id, title: 'recent', message: '', type: 'system', createdAt: recent },
    ]);
    expect(await pruneNotifications(now)).toBeGreaterThanOrEqual(1);
    const left = (await db.select().from(notifications).where(eq(notifications.userId, someone.id))).map((n) => n.title);
    expect(left).toContain('recent');
    expect(left).not.toContain('old');
  });
});
