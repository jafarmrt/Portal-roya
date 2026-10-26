import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { ADMIN, app, createEmployee, resetDatabase, setupAdmin } from './helpers';

describe('authentication', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
  });
  afterAll(() => pool.end());

  it('reports setup as complete and refuses a second setup', async () => {
    const status = await request(app).get('/api/system/status').expect(200);
    expect(status.body.isSetupComplete).toBe(true);
    await request(app)
      .post('/api/system/setup')
      .send({ username: 'intruder', password: 'Intruder-123', firstName: 'a', lastName: 'b', position: 'c', department: 'd' })
      .expect(409);
  });

  it('rejects personal data and every write without a session', async () => {
    for (const path of ['/api/notifications', '/api/moods/me', '/api/events', '/api/auth/me']) {
      await request(app).get(path).expect(401);
    }
    await request(app).post('/api/news').send({}).expect(401);
    await request(app).put('/api/settings').send({ guestAccess: true }).expect(401);
  });

  it('ignores a spoofed X-User-Id header', async () => {
    const me = await admin.get('/api/auth/me').expect(200);
    await request(app).get('/api/notifications').set('X-User-Id', me.body.user.id).expect(401);
  });

  it('never returns password hashes', async () => {
    const res = await admin.get('/api/employees').expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('$2');
  });

  it('logs in with the right password and rejects a wrong one', async () => {
    await request(app).post('/api/auth/login').send({ username: ADMIN.username, password: 'wrong-password' }).expect(401);
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send(ADMIN).expect(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    await agent.get('/api/employees').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/notifications').expect(401);
  });

  it('locks an account after repeated wrong passwords', async () => {
    await createEmployee(admin, { username: 'locked.user' });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: 'locked.user', password: 'nope-nope' });
    }
    const res = await request(app).post('/api/auth/login').send({ username: 'locked.user', password: 'locked.user-Pass-123' });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('قفل');
  });

  it('forces a new colleague to change the temporary password first', async () => {
    const created = await admin
      .post('/api/employees')
      .send({ username: 'new.person', firstName: 'تازه', lastName: 'وارد', position: 'کارشناس', department: 'فروش' })
      .expect(201);
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ username: 'new.person', password: created.body.temporaryPassword }).expect(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const blocked = await agent.get('/api/news').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: created.body.temporaryPassword, newPassword: 'Brand-new-pass-1' })
      .expect(200);
    await agent.get('/api/news').expect(200);
  });

  it('keeps manager-only actions away from employees', async () => {
    const { agent, id } = await createEmployee(admin, { username: 'plain.user' });
    await agent.post('/api/employees').send({ username: 'x.y', firstName: 'a', lastName: 'b', position: 'c', department: 'd' }).expect(403);
    await agent.put('/api/settings').send({ departments: ['هک'] }).expect(403);
    await agent.post('/api/news').send({ title: 't', summary: 's', content: 'c', category: 'اخبار' }).expect(403);
    // Employees cannot promote themselves.
    await agent.patch(`/api/employees/${id}`).send({ role: 'manager' }).expect(403);
    const self = await agent.patch(`/api/employees/${id}`).send({ extension: '214' }).expect(200);
    expect(self.body.extension).toBe('214');
    // Fields that were not sent stay as they were.
    expect(self.body.position).toBe('کارشناس');
    expect(self.body.department).toBe('فروش');
  });
});
