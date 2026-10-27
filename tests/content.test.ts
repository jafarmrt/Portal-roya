import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

describe('news and circulars', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let sales: Awaited<ReturnType<typeof createEmployee>>;
  let design: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sales = await createEmployee(admin, { username: 'sales.one', department: 'فروش' });
    design = await createEmployee(admin, { username: 'design.one', department: 'طراحی' });
  });
  afterAll(() => pool.end());

  it('shows targeted news only to the chosen department and notifies them', async () => {
    const created = await admin
      .post('/api/news')
      .send({ title: 'اطلاعیهٔ فروش', summary: 'خلاصه', content: 'متن', category: 'اطلاعیه', targetDepartments: ['فروش'] })
      .expect(201);
    const salesNews = await sales.agent.get('/api/news').expect(200);
    const designNews = await design.agent.get('/api/news').expect(200);
    expect(salesNews.body.items.map((n: { id: string }) => n.id)).toContain(created.body.id);
    expect(designNews.body.items.map((n: { id: string }) => n.id)).not.toContain(created.body.id);
    await design.agent.get(`/api/news/${created.body.id}`).expect(404);

    const notifications = await sales.agent.get('/api/notifications').expect(200);
    expect(notifications.body.some((n: { linkId: string }) => n.linkId === created.body.id)).toBe(true);
  });

  it('hides scheduled news until its publish time', async () => {
    const created = await admin
      .post('/api/news')
      .send({ title: 'آینده', summary: 'خلاصه', content: 'متن', category: 'اخبار', publishDate: '1499/01/01', publishTime: '08:00' })
      .expect(201);
    expect(created.body.status).toBe('scheduled');
    const list = await sales.agent.get('/api/news').expect(200);
    expect(list.body.items.map((n: { id: string }) => n.id)).not.toContain(created.body.id);
  });

  it('tracks reading and acknowledgement of a circular', async () => {
    const circular = await admin
      .post('/api/news')
      .send({ title: 'بخشنامهٔ ایمنی', summary: 'خلاصه', content: 'متن', category: 'بخشنامه', requiresAck: true })
      .expect(201);
    const id = circular.body.id;

    await sales.agent.post(`/api/news/${id}/ack`).expect(200);
    const receipts = await admin.get(`/api/news/${id}/receipts`).expect(200);
    const salesRow = receipts.body.find((r: { userId: string }) => r.userId === sales.id);
    const designRow = receipts.body.find((r: { userId: string }) => r.userId === design.id);
    expect(salesRow.acknowledgedAt).toBeTruthy();
    expect(designRow.acknowledgedAt).toBeFalsy();

    await sales.agent.get(`/api/news/${id}/receipts`).expect(403);
  });

  it('counts likes once per person', async () => {
    const item = await admin.post('/api/news').send({ title: 'خبر', summary: 'خلاصه', content: 'متن', category: 'اخبار' }).expect(201);
    const first = await sales.agent.post(`/api/news/${item.body.id}/like`).expect(200);
    expect(first.body.likesCount).toBe(1);
    const second = await sales.agent.post(`/api/news/${item.body.id}/like`).expect(200);
    expect(second.body.likesCount).toBe(0);
  });

  it('validates input with clear errors', async () => {
    const res = await admin.post('/api/news').send({ title: '', summary: 'x', content: 'y', category: 'z' }).expect(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('stores an uploaded logo for an organisation app and rejects outside images', async () => {
    const upload = await admin
      .post('/api/uploads')
      .attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'crm.png', contentType: 'image/png' })
      .expect(201);
    const app = { id: 'crm', name: 'CRM', description: '', iconName: 'Database', url: 'http://crm.local', bgColor: 'bg-red-50', textColor: 'text-red-700' };

    const saved = await admin.put('/api/settings').send({ systems: [{ ...app, imageUrl: upload.body.url }, { ...app, id: 'hr' }] }).expect(200);
    expect(saved.body.systems[0].imageUrl).toBe(upload.body.url);
    expect(saved.body.systems[1].imageUrl).toBe('');

    await admin.put('/api/settings').send({ systems: [{ ...app, imageUrl: 'https://example.com/logo.png' }] }).expect(400);
    await admin.put('/api/settings').send({ systems: [{ ...app, imageUrl: '/uploads/../secret.png' }] }).expect(400);
  });

  it('lets settings managers replace the header logo, which visitors can load even without guest access', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const upload = await admin.post('/api/uploads').attach('file', png, { filename: 'logo.png', contentType: 'image/png' }).expect(201);

    await sales.agent.put('/api/settings').send({ logoUrl: upload.body.url }).expect(403);
    await admin.put('/api/settings').send({ logoUrl: 'https://example.com/logo.png' }).expect(400);
    await admin.put('/api/settings').send({ guestAccess: false }).expect(200);
    await request(app).get('/api/system/logo').expect(404);

    const saved = await admin.put('/api/settings').send({ logoUrl: upload.body.url }).expect(200);
    expect(saved.body.logoUrl).toBe(upload.body.url);
    const other = await admin.put('/api/settings').send({ dashboardCards: {} }).expect(200);
    expect(other.body.logoUrl).toBe(upload.body.url);
    const status = await request(app).get('/api/system/status').expect(200);
    expect(status.body.logoUrl).toBe(upload.body.url);
    const logo = await request(app).get('/api/system/logo').expect(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(Buffer.from(logo.body).equals(png)).toBe(true);
    await request(app).get(upload.body.url).expect(401);

    const reset = await admin.put('/api/settings').send({ logoUrl: '' }).expect(200);
    expect(reset.body.logoUrl).toBe('');
    expect((await request(app).get('/api/system/status').expect(200)).body.logoUrl).toBe('');
    await request(app).get('/api/system/logo').expect(404);
    await admin.put('/api/settings').send({ guestAccess: true }).expect(200);
  });
});
