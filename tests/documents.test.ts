import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toJalali } from '../shared/jalali';
import { config } from '../server/config';
import { db, pool } from '../server/db/index';
import { documents, notifications } from '../server/db/schema';
import { referencedUploads } from '../server/maintenance';
import { processDocumentReviews } from '../server/routes/documents';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;
interface Doc {
  id: string;
  version: number;
  fileUrl: string;
  requiresAck: boolean;
  forMe: boolean;
  acknowledgedAt: string | null;
  acknowledgedEarlier: boolean;
  ownerId: string | null;
  needsReview: boolean;
  ackStats?: { acknowledged: number; audience: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function upload(agent: Agent, name: string) {
  const res = await agent
    .post('/api/uploads')
    .attach('file', Buffer.from(`%PDF-1.4 ${name}`), { filename: name, contentType: 'application/pdf' })
    .expect(201);
  return { name, url: res.body.url as string, size: 20, mimeType: 'application/pdf' };
}

const listOf = async (agent: Agent) => (await agent.get('/api/documents').expect(200)).body as Doc[];
const docOf = async (agent: Agent, id: string) => (await listOf(agent)).find((d) => d.id === id);
const notificationsOf = async (id: string) => db.select().from(notifications).where(eq(notifications.userId, id));

describe('documents: versions, mandatory reading, owners and reviews', () => {
  let admin: Agent;
  let owner: Person;
  let sales: Person;
  let design: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    owner = await createEmployee(admin, { username: 'hr.owner', department: 'طراحی' });
    sales = await createEmployee(admin, { username: 'sales.doc', department: 'فروش' });
    design = await createEmployee(admin, { username: 'design.doc', department: 'طراحی' });
  });
  afterAll(() => pool.end());

  it('replaces the file with a new version and keeps the earlier one in the history', async () => {
    const first = await upload(admin, 'leave-v1.pdf');
    const created = await admin
      .post('/api/documents')
      .send({ title: 'فرم مرخصی', category: 'فرم‌ها', file: first, ownerId: owner.id })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ version: 1, ownerId: owner.id, owner: 'همکار hr.owner' });

    // A colleague who neither manages documents nor owns this one cannot replace it.
    const other = await upload(admin, 'x.pdf');
    await sales.agent.post(`/api/documents/${id}/versions`).send({ file: other }).expect(403);
    // Nor upload document files at all.
    await sales.agent
      .post('/api/uploads')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(400);

    // The owner can, without the documents permission.
    const second = await upload(owner.agent, 'leave-v2.pdf');
    const replaced = await owner.agent.post(`/api/documents/${id}/versions`).send({ file: second, note: 'بند ۲ اصلاح شد' }).expect(201);
    expect(replaced.body).toMatchObject({ version: 2, fileUrl: second.url, versionNote: 'بند ۲ اصلاح شد', uploadedBy: 'همکار hr.owner' });

    const versions = await sales.agent.get(`/api/documents/${id}/versions`).expect(200);
    expect(versions.body.map((v: { version: number; fileUrl: string; current: boolean }) => [v.version, v.fileUrl, v.current])).toEqual([
      [2, second.url, true],
      [1, first.url, false],
    ]);
    // The earlier file is still used, so the nightly cleanup keeps it.
    expect((await referencedUploads()).has(path.basename(first.url))).toBe(true);

    // Everyone in the audience heard about the new version, except the person who uploaded it.
    expect((await notificationsOf(sales.id)).some((n) => n.title === 'نسخهٔ جدید سند 📄' && n.linkId === id)).toBe(true);
    expect((await notificationsOf(owner.id)).some((n) => n.title === 'نسخهٔ جدید سند 📄')).toBe(false);

    // Deleting the document removes the files of every version.
    await admin.delete(`/api/documents/${id}`).expect(200);
    for (const file of [first, second]) expect(fs.existsSync(path.join(config.uploadDir, path.basename(file.url)))).toBe(false);
  });

  it('asks the audience to confirm a mandatory document, and again after a change that needs it', async () => {
    const file = await upload(admin, 'safety.pdf');
    const created = await admin
      .post('/api/documents')
      .send({ title: 'آیین‌نامهٔ ایمنی', category: 'آیین‌نامه‌ها', file, requiresAck: true, ownerId: owner.id })
      .expect(201);
    const id = created.body.id as string;
    expect((await notificationsOf(sales.id)).some((n) => n.linkId === id && n.title.startsWith('سند لازم‌الاجرا'))).toBe(true);
    // The owner wrote it and is not asked to confirm it.
    expect((await docOf(owner.agent, id))?.forMe).toBe(false);

    expect(await docOf(sales.agent, id)).toMatchObject({ requiresAck: true, forMe: true, acknowledgedAt: null });
    const acked = await sales.agent.post(`/api/documents/${id}/ack`).expect(200);
    expect(acked.body.acknowledgedAt).not.toBeNull();
    expect((await docOf(admin, id))?.ackStats).toEqual({ acknowledged: 1, audience: 3 });
    expect((await docOf(owner.agent, id))?.ackStats).toEqual({ acknowledged: 1, audience: 3 });
    expect((await docOf(sales.agent, id))?.ackStats).toBeUndefined();

    // A typo fix keeps the confirmations.
    const typoFix = await upload(admin, 'safety-2.pdf');
    await admin.post(`/api/documents/${id}/versions`).send({ file: typoFix, reAck: false, notify: false }).expect(201);
    expect((await docOf(sales.agent, id))?.acknowledgedAt).not.toBeNull();

    // A real change asks everyone again.
    const change = await upload(admin, 'safety-3.pdf');
    await admin.post(`/api/documents/${id}/versions`).send({ file: change, note: 'بند جدید', reAck: true }).expect(201);
    expect(await docOf(sales.agent, id)).toMatchObject({ version: 3, acknowledgedAt: null, acknowledgedEarlier: true });
    expect((await notificationsOf(sales.id)).filter((n) => n.linkId === id && n.title.startsWith('نسخهٔ جدید سند لازم‌الاجرا'))).toHaveLength(1);

    const receipts = await owner.agent.get(`/api/documents/${id}/receipts`).expect(200);
    expect(receipts.body.map((r: { name: string }) => r.name).sort()).toEqual(['همکار design.doc', 'همکار sales.doc', 'مدیر سیستم'].sort());
    expect(receipts.body.every((r: { acknowledgedAt: string | null }) => r.acknowledgedAt === null)).toBe(true);
    await sales.agent.get(`/api/documents/${id}/receipts`).expect(403);

    const reminded = await owner.agent.post(`/api/documents/${id}/remind`).expect(200);
    expect(reminded.body.sent).toBe(3);
    await owner.agent.post(`/api/documents/${id}/remind`).expect(429);
  });

  it('shows a document only to its audience, its owner and document managers', async () => {
    const file = await upload(admin, 'sales.pdf');
    const created = await admin
      .post('/api/documents')
      .send({ title: 'دستورالعمل فروش', category: 'دستورالعمل‌ها', file, targetDepartments: ['فروش'], ownerId: owner.id })
      .expect(201);
    const id = created.body.id as string;
    expect(await docOf(sales.agent, id)).toBeDefined();
    expect(await docOf(owner.agent, id)).toBeDefined();
    expect(await docOf(admin, id)).toBeDefined();
    expect(await docOf(design.agent, id)).toBeUndefined();
    await design.agent.get(`/api/documents/${id}/versions`).expect(404);
    await design.agent.post(`/api/documents/${id}/ack`).expect(404);

    // Visitors only see documents meant for everyone.
    await admin.put('/api/settings').send({ guestAccess: true }).expect(200);
    const guest = await request(app).get('/api/documents').expect(200);
    expect(guest.body.some((d: Doc) => d.id === id)).toBe(false);

    await admin.put(`/api/documents/${id}`).send({ title: 'دستورالعمل فروش', category: 'دستورالعمل‌ها', targetDepartments: ['جایی که نیست'] }).expect(400);
  });

  it('reminds the owner once when the review date has come', async () => {
    const file = await upload(admin, 'cash.pdf');
    const created = await admin
      .post('/api/documents')
      .send({ title: 'فرم تنخواه', category: 'فرم‌ها', file, ownerId: owner.id, reviewDate: toJalali(new Date(Date.now() + 2 * DAY_MS)) })
      .expect(201);
    const id = created.body.id as string;
    expect((await docOf(owner.agent, id))?.needsReview).toBe(false);

    await processDocumentReviews(new Date(Date.now() + 3 * DAY_MS));
    await processDocumentReviews(new Date(Date.now() + 4 * DAY_MS));
    const reminders = (await notificationsOf(owner.id)).filter((n) => n.linkId === id && n.title.startsWith('زمان بازبینی'));
    expect(reminders).toHaveLength(1);

    // Pretend the date has passed, then the owner marks it reviewed with a new date.
    await db.update(documents).set({ reviewAt: new Date(Date.now() - DAY_MS) }).where(eq(documents.id, id));
    expect((await docOf(owner.agent, id))?.needsReview).toBe(true);
    expect((await docOf(sales.agent, id))?.needsReview).toBe(false);
    await sales.agent.post(`/api/documents/${id}/review`).send({ reviewDate: toJalali(new Date(Date.now() + 365 * DAY_MS)) }).expect(403);
    await owner.agent.post(`/api/documents/${id}/review`).send({ reviewDate: toJalali(new Date(Date.now() - 2 * DAY_MS)) }).expect(400);
    const reviewed = await owner.agent.post(`/api/documents/${id}/review`).send({ reviewDate: toJalali(new Date(Date.now() + 365 * DAY_MS)) }).expect(200);
    expect(reviewed.body.needsReview).toBe(false);
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    expect(row.reviewRemindedAt).toBeNull();
  });

  it('only lets an active colleague with an account own a document, and wants review dates ahead', async () => {
    const file = await upload(admin, 'owner.pdf');
    await admin.post('/api/documents').send({ title: 'سند', category: 'فرم‌ها', file, ownerId: 'emp-missing' }).expect(400);
    const yesterday = toJalali(new Date(Date.now() - DAY_MS));
    await admin.post('/api/documents').send({ title: 'سند', category: 'فرم‌ها', file, reviewDate: yesterday }).expect(400);
  });
});
