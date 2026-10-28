import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { isCompanyAddress } from '../server/network';
import { isInsideOnlyUrl, systemLink } from '../shared/systemLinks';
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

  it('shows visitors a course, but not who signed up or its handouts', async () => {
    const id = (
      await admin
        .post('/api/trainings')
        .send({ title: 'ایمنی کارگاه', instructor: 'مدرس', date: '1405/09/01', capacity: 10, description: 'دوره', category: 'ایمنی' })
        .expect(201)
    ).body.id;
    await admin.put(`/api/trainings/${id}/materials`).send({ materials: [{ name: 'جزوه.pdf', url: '/uploads/a.pdf', size: 10, mimeType: 'application/pdf' }] }).expect(200);
    await admin.post(`/api/trainings/${id}/enroll`).expect(200);

    const seen = (await request(app).get('/api/trainings').expect(200)).body.find((t: { id: string }) => t.id === id);
    expect(seen).toMatchObject({ title: 'ایمنی کارگاه', enrolledUserIds: [], enrolledCount: 1, materials: [] });
    const signedIn = (await admin.get('/api/trainings').expect(200)).body.find((t: { id: string }) => t.id === id);
    expect(signedIn.enrolledUserIds).toHaveLength(1);
    expect(signedIn.materials).toHaveLength(1);
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

  it('tells company addresses from internet addresses', () => {
    for (const ip of ['192.168.0.21', '10.1.2.3', '172.20.0.5', '127.0.0.1', '::1', '::ffff:192.168.1.9', 'fd00::5', 'fe80::1%eth0']) {
      expect(isCompanyAddress(ip), ip).toBe(true);
    }
    for (const ip of ['79.127.49.210', '5.160.10.20', '172.32.0.1', '100.64.0.1', '2a01:4f8::1', '::ffff:8.8.8.8', '', undefined]) {
      expect(isCompanyAddress(ip), String(ip)).toBe(false);
    }
  });

  it('asks visitors from the internet to sign in (behind nginx, with TRUST_PROXY=true)', async () => {
    app.set('trust proxy', 1);
    try {
      const outside = (path: string) => request(app).get(path).set('X-Forwarded-For', '5.160.10.20');
      const inside = (path: string) => request(app).get(path).set('X-Forwarded-For', '192.168.0.50');

      const status = (await outside('/api/system/status').expect(200)).body;
      expect(status).toMatchObject({ guestAccess: false, companyNetwork: false });
      for (const path of ['/api/news', '/api/settings', '/api/documents', '/uploads/anything.png']) {
        await outside(path).expect(401);
      }
      // A visitor cannot pretend to be inside: nginx appends the real address, and only that one counts.
      await request(app).get('/api/news').set('X-Forwarded-For', '192.168.0.50, 5.160.10.20').expect(401);

      expect((await inside('/api/system/status').expect(200)).body).toMatchObject({ guestAccess: true, companyNetwork: true });
      await inside('/api/news').expect(200);

      // Signed-in colleagues can use the portal from anywhere.
      await admin.get('/api/news').set('X-Forwarded-For', '5.160.10.20').expect(200);
    } finally {
      app.set('trust proxy', false);
    }
  });

  it('shows the org apps to visitors from the internet, with the address that works there', async () => {
    const system = { description: '', iconName: 'Globe', bgColor: 'bg-red-50', textColor: 'text-red-700' };
    await admin
      .put('/api/settings')
      .send({
        systems: [
          { ...system, id: 'crm', name: 'CRM', url: 'http://192.168.0.30', externalUrl: 'https://crm.royaco.com' },
          { ...system, id: 'hr', name: 'HR', url: 'http://hr.roya.local', externalUrl: '' },
          { ...system, id: 'mail', name: 'Mail', url: 'https://mail.royaco.com' },
          { ...system, id: 'web', name: 'Web', url: '', externalUrl: 'https://royaco.com' },
        ],
      })
      .expect(200);
    await admin.put('/api/settings').send({ systems: [{ ...system, id: 'x', name: 'x', url: 'http://a', externalUrl: 'ftp://b' }] }).expect(400);

    app.set('trust proxy', 1);
    try {
      const links = async (ip: string) =>
        Object.fromEntries((await request(app).get('/api/system/apps').set('X-Forwarded-For', ip).expect(200)).body.map((a: { id: string; url: string }) => [a.id, a.url]));

      // From the internet: the outside address, or the inside one when it also works from the internet; HR only works inside.
      expect(await links('5.160.10.20')).toEqual({ crm: 'https://crm.royaco.com', mail: 'https://mail.royaco.com', web: 'https://royaco.com' });
      expect(await links('192.168.0.50')).toEqual({
        crm: 'http://192.168.0.30',
        hr: 'http://hr.roya.local',
        mail: 'https://mail.royaco.com',
        web: 'https://royaco.com',
      });
      // News and files stay closed from the internet.
      await request(app).get('/api/news').set('X-Forwarded-For', '5.160.10.20').expect(401);

      await admin.put('/api/settings').send({ guestAccess: false }).expect(200);
      expect(await links('5.160.10.20')).toEqual({});
      await admin.put('/api/settings').send({ guestAccess: true }).expect(200);
    } finally {
      app.set('trust proxy', false);
    }
  });

  it('decides which address an app opens', () => {
    const app = { url: 'http://10.0.0.5', externalUrl: 'https://erp.royaco.com' };
    expect(systemLink(app, true)).toBe('http://10.0.0.5');
    expect(systemLink(app, false)).toBe('https://erp.royaco.com');
    expect(systemLink({ url: '#', externalUrl: '' }, true)).toBe('');
    expect(systemLink({ url: 'http://crm' }, false)).toBe('');
    for (const url of ['http://172.16.4.4:8080', 'http://intranet', 'http://srv.lan', 'http://[fd00::1]/']) expect(isInsideOnlyUrl(url), url).toBe(true);
    for (const url of ['https://mail.royaco.com', 'http://79.127.49.210:8443', 'http://172.32.0.1']) expect(isInsideOnlyUrl(url), url).toBe(false);
  });
});
