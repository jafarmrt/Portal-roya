import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

describe('guest (not signed in) access', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let publicNewsId: string;
  let targetedNewsId: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    await createEmployee(admin, { username: 'sales.guest', department: 'فروش' });
    publicNewsId = (
      await admin.post('/api/news').send({ title: 'خبر عمومی', summary: 'خلاصه', content: 'متن', category: 'اخبار' }).expect(201)
    ).body.id;
    targetedNewsId = (
      await admin
        .post('/api/news')
        .send({ title: 'فقط فروش', summary: 'خلاصه', content: 'متن', category: 'اخبار', targetDepartments: ['فروش'] })
        .expect(201)
    ).body.id;
    const question = { text: 'پیشنهاد شما چیست؟', type: 'text' };
    await admin.post('/api/polls').send({ title: 'نظرسنجی عمومی', showTextAnswers: true, questions: [question] }).expect(201);
    await admin.post('/api/polls').send({ title: 'نظرسنجی فروش', targetDepartments: ['فروش'], questions: [question] }).expect(201);
  });
  afterAll(() => pool.end());

  it('reports guest access in the system status', async () => {
    const status = await request(app).get('/api/system/status').expect(200);
    expect(status.body.guestAccess).toBe(true);
  });

  it('lets visitors read news addressed to everyone, but not targeted news', async () => {
    const res = await request(app).get('/api/news').expect(200);
    const ids = res.body.items.map((n: { id: string }) => n.id);
    expect(ids).toContain(publicNewsId);
    expect(ids).not.toContain(targetedNewsId);
    expect(res.body.items[0].likedByMe).toBe(false);
    expect(res.body.items[0].readStats).toBeUndefined();
    await request(app).get(`/api/news/${publicNewsId}`).expect(200);
    await request(app).get(`/api/news/${targetedNewsId}`).expect(404);
  });

  it('shows only company-wide polls, without their results while they are open', async () => {
    const res = await request(app).get('/api/polls').expect(200);
    expect(res.body.map((p: { title: string }) => p.title)).toEqual(['نظرسنجی عمومی']);
    expect(res.body[0]).toMatchObject({ forMe: false, resultsVisible: false, canManage: false });
    expect(res.body[0].questions[0].results).toBeUndefined();
  });

  it('opens the rest of the read-only content', async () => {
    for (const path of ['/api/settings', '/api/trainings', '/api/calendar_events', '/api/holidays', '/api/documents']) {
      await request(app).get(path).expect(200);
    }
  });

  it('keeps the staff directory hidden until a manager opens it', async () => {
    expect((await request(app).get('/api/employees').expect(200)).body).toEqual([]);
    expect((await request(app).get('/api/new_colleagues').expect(200)).body).toEqual([]);

    await admin.put('/api/settings').send({ guestDirectory: true }).expect(200);
    const res = await request(app).get('/api/employees').expect(200);
    expect(res.body.length).toBe(2);
    for (const e of res.body) {
      expect(e.username).toBe('');
      expect(e.mobile).toBe('');
    }
    await admin.put('/api/settings').send({ guestDirectory: false }).expect(200);
  });

  it('requires a login for every interaction', async () => {
    await request(app).post(`/api/news/${publicNewsId}/like`).expect(401);
    await request(app).post(`/api/news/${publicNewsId}/read`).expect(401);
    await request(app).post('/api/moods').send({ mood: 'happy' }).expect(401);
    const res = await request(app).get('/api/notifications').expect(401);
    expect(res.body.code).toBe('LOGIN_REQUIRED');
  });

  it('closes everything when a manager turns guest access off', async () => {
    await admin.put('/api/settings').send({ guestAccess: false }).expect(200);
    expect((await request(app).get('/api/system/status').expect(200)).body.guestAccess).toBe(false);
    for (const path of ['/api/news', '/api/polls', '/api/settings', '/api/documents', '/api/employees']) {
      await request(app).get(path).expect(401);
    }
    await admin.get('/api/news').expect(200);
    await admin.put('/api/settings').send({ guestAccess: true }).expect(200);
  });
});
