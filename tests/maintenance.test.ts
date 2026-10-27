import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { gunzipSync } from 'zlib';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import { db, pool } from '../server/db/index';
import { settings } from '../server/db/schema';
import { backupDatabase, cleanOrphanUploads, ORPHAN_GRACE_MS } from '../server/maintenance';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('site-wide banner, read counts and server housekeeping', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let sales: Awaited<ReturnType<typeof createEmployee>>;
  let tmp: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sales = await createEmployee(admin, { username: 'sales.ops', department: 'فروش' });
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-maintenance-'));
  });
  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    await pool.end();
  });

  it('shows a banner to everyone, guests included, until it expires', async () => {
    const saved = await admin.put('/api/settings/banner').send({ text: 'اینترنت تا ساعت ۱۲ قطع است.', level: 'warning', expiresAt: inHours(2) }).expect(200);
    expect(saved.body.banner).toMatchObject({ text: 'اینترنت تا ساعت ۱۲ قطع است.', level: 'warning' });

    const asGuest = await request(app).get('/api/settings').expect(200);
    expect(asGuest.body.banner.text).toBe('اینترنت تا ساعت ۱۲ قطع است.');
    const asEmployee = await sales.agent.get('/api/settings').expect(200);
    expect(asEmployee.body.banner.level).toBe('warning');

    // Saving other settings leaves the banner alone.
    await admin.put('/api/settings').send({ guestAccess: true, banner: null }).expect(200);
    expect((await sales.agent.get('/api/settings').expect(200)).body.banner).not.toBeNull();

    // Once its time is up, nobody receives it.
    const [row] = await db.select().from(settings).where(eq(settings.id, 'global'));
    await db.update(settings).set({ banner: { ...row.banner!, expiresAt: inHours(-1) } }).where(eq(settings.id, 'global'));
    expect((await sales.agent.get('/api/settings').expect(200)).body.banner).toBeNull();

    await admin.put('/api/settings/banner').send({ text: 'جلسهٔ عمومی ساعت ۱۴', level: 'info', expiresAt: inHours(1) }).expect(200);
    const removed = await admin.delete('/api/settings/banner').expect(200);
    expect(removed.body.banner).toBeNull();
  });

  it('checks who may set a banner and for how long', async () => {
    await sales.agent.put('/api/settings/banner').send({ text: 'سلام', level: 'info', expiresAt: inHours(1) }).expect(403);
    await sales.agent.delete('/api/settings/banner').expect(403);
    await request(app).put('/api/settings/banner').send({ text: 'سلام', level: 'info', expiresAt: inHours(1) }).expect(401);
    await admin.put('/api/settings/banner').send({ text: 'سلام', level: 'info', expiresAt: inHours(-1) }).expect(400);
    await admin.put('/api/settings/banner').send({ text: 'سلام', level: 'info', expiresAt: inHours(31 * 24) }).expect(400);
    await admin.put('/api/settings/banner').send({ text: '', level: 'info', expiresAt: inHours(1) }).expect(400);
    await admin.put('/api/settings/banner').send({ text: 'سلام', level: 'danger', expiresAt: inHours(1) }).expect(400);
    await admin.put('/api/settings/banner').send({ text: 'x'.repeat(201), level: 'info', expiresAt: inHours(1) }).expect(400);
  });

  it('counts reads only among the people a news item is for', async () => {
    // Someone in the phone book without a portal account cannot read news and is not counted.
    await admin
      .post('/api/employees')
      .send({ firstName: 'حسن', lastName: 'کارگر', position: 'کارگر', department: 'فروش', hasAccount: false })
      .expect(201);
    const item = await admin.post('/api/news').send({ title: 'خبر', summary: 'خلاصه', content: 'متن', category: 'اخبار' }).expect(201);
    await sales.agent.post(`/api/news/${item.body.id}/read`).expect(200);
    await admin.post(`/api/news/${item.body.id}/read`).expect(200);

    const list = await admin.get('/api/news').expect(200);
    // The audience is everyone with an account except the author: only sales.ops here.
    expect(list.body.items.find((n: { id: string }) => n.id === item.body.id).readStats).toEqual({ read: 1, acknowledged: 0, audience: 1 });
    const receipts = await admin.get(`/api/news/${item.body.id}/receipts`).expect(200);
    expect(receipts.body.map((r: { userId: string }) => r.userId)).toEqual([sales.id]);
  });

  it('reports disk space and backups to the people who manage settings', async () => {
    await sales.agent.get('/api/settings/server-status').expect(403);
    await request(app).get('/api/settings/server-status').expect(401);
    const status = await admin.get('/api/settings/server-status').expect(200);
    expect(status.body.version).toBe(packageJson.version);
    expect(status.body.disk.total).toBeGreaterThan(0);
    expect(status.body.uploads).toMatchObject({ count: expect.any(Number), bytes: expect.any(Number) });
    expect(typeof status.body.backups.dir).toBe('string');
  });

  it('removes old uploads nothing uses, and keeps used and recent ones', async () => {
    const dir = path.join(tmp, 'uploads');
    await fs.mkdir(dir);
    const app = { id: 'crm', name: 'CRM', description: '', iconName: 'Database', url: 'http://crm.local', bgColor: 'bg-red-50', textColor: 'text-red-700' };
    await admin.put('/api/settings').send({ systems: [{ ...app, imageUrl: '/uploads/used-logo.png' }] }).expect(200);

    const old = new Date(Date.now() - ORPHAN_GRACE_MS - HOUR);
    for (const name of ['used-logo.png', 'old-orphan.png', 'new-orphan.png']) await fs.writeFile(path.join(dir, name), 'x'.repeat(100));
    await fs.utimes(path.join(dir, 'used-logo.png'), old, old);
    await fs.utimes(path.join(dir, 'old-orphan.png'), old, old);

    const result = await cleanOrphanUploads(dir);
    expect(result).toMatchObject({ removed: 1, freedBytes: 100 });
    expect((await fs.readdir(dir)).sort()).toEqual(['new-orphan.png', 'used-logo.png']);
  });

  it('writes a compressed database backup once a day and keeps the last seven', async () => {
    const dir = path.join(tmp, 'backups');
    await fs.mkdir(dir);
    for (let day = 1; day <= 8; day++) await fs.writeFile(path.join(dir, `nightly-db-2020-01-0${day}.sql.gz`), '');

    const name = await backupDatabase(dir, new Date(2026, 9, 27, 2, 30));
    expect(name).toBe('nightly-db-2026-10-27.sql.gz');
    const dump = gunzipSync(await fs.readFile(path.join(dir, name))).toString();
    expect(dump).toContain('CREATE TABLE public.news');
    const files = (await fs.readdir(dir)).sort();
    expect(files).toHaveLength(7);
    expect(files[0]).toBe('nightly-db-2020-01-03.sql.gz');
    expect(files).toContain(name);
  });

  it('explains a failed backup and leaves no half-written file', async () => {
    const dir = path.join(tmp, 'failed');
    const savedPath = process.env.PATH;
    process.env.PATH = path.join(tmp, 'no-programs-here');
    try {
      await expect(backupDatabase(dir, new Date(2026, 9, 28, 2, 30))).rejects.toThrow('برنامهٔ pg_dump روی سرور نصب نیست.');
    } finally {
      process.env.PATH = savedPath;
    }
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
