import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications } from '../server/db/schema';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;

interface Profile {
  id: string;
  username: string;
  hasAccount: boolean;
  role: string;
}

const worker = { firstName: 'حسن', lastName: 'کارگر', position: 'اپراتور تولید', department: 'تولید', extension: '310' };

async function notificationCount(userId: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.userId, userId));
  return row.count;
}

describe('people without a portal account', () => {
  let admin: Agent;
  let workerId: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
  });
  afterAll(() => pool.end());

  it('adds someone to the phone book without a username, password or role', async () => {
    const res = await admin.post('/api/employees').send({ ...worker, hasAccount: false, role: 'manager' }).expect(201);
    expect(res.body.temporaryPassword).toBeNull();
    expect(res.body.employee).toMatchObject({ hasAccount: false, username: '', role: 'employee' });
    workerId = res.body.employee.id;

    const colleague = await createEmployee(admin, { username: 'sara' });
    const list = (await colleague.agent.get('/api/employees').expect(200)).body as Profile[];
    expect(list.find((e) => e.id === workerId)).toMatchObject({ hasAccount: false, username: '' });
  });

  it('keeps roles and password resets for people with an account', async () => {
    await admin.patch(`/api/employees/${workerId}`).send({ role: 'manager' }).expect(400);
    await admin.post(`/api/employees/${workerId}/reset-password`).expect(400);
    await admin.patch(`/api/employees/${workerId}`).send({ extension: '311' }).expect(200);
  });

  it('does not notify people who cannot read notifications', async () => {
    const sara = await createEmployee(admin, { username: 'sara2' });
    await admin.post(`/api/employees/${workerId}/introduce`).send({}).expect(201);
    await sara.agent.post(`/api/employees/${workerId}/birthday_wishes`).send({ message: 'تولدت مبارک' }).expect(201);
    expect(await notificationCount(workerId)).toBe(0);
    // Colleagues with an account still hear about the introduction.
    expect(await notificationCount(sara.id)).toBeGreaterThan(0);
  });

  it('gives portal access later with a temporary password, and takes it away again', async () => {
    await admin.post(`/api/employees/${workerId}/account`).send({ username: 'h.kargar', signIn: 'ldap' }).expect(400);
    const granted = await admin.post(`/api/employees/${workerId}/account`).send({ username: 'H.Kargar', role: 'employee' }).expect(200);
    expect(granted.body.employee).toMatchObject({ hasAccount: true, username: 'h.kargar' });
    await admin.post(`/api/employees/${workerId}/account`).send({ username: 'h.kargar' }).expect(409);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'h.kargar', password: granted.body.temporaryPassword }).expect(200);
    await agent.get('/api/auth/me').expect(200);

    const revoked = await admin.delete(`/api/employees/${workerId}/account`).expect(200);
    expect(revoked.body).toMatchObject({ hasAccount: false, role: 'employee', isActive: true });
    // The open session ends and the old password no longer works, but the person stays listed.
    await agent.get('/api/auth/me').expect(401);
    await request(app).post('/api/auth/login').send({ username: 'h.kargar', password: granted.body.temporaryPassword }).expect(401);
    const list = (await admin.get('/api/employees').expect(200)).body as Profile[];
    expect(list.find((e) => e.id === workerId)?.hasAccount).toBe(false);

    // The kept username can be given back to the same person.
    await admin.post(`/api/employees/${workerId}/account`).send({ username: 'h.kargar' }).expect(200);
  });

  it('refuses to take access from yourself, but another admin may', async () => {
    const me = (await admin.get('/api/auth/me').expect(200)).body.user as Profile;
    await admin.delete(`/api/employees/${me.id}/account`).expect(400);

    const other = await createEmployee(admin, { username: 'second.admin', role: 'admin' });
    await other.agent.delete(`/api/employees/${me.id}/account`).expect(200);
    await admin.get('/api/auth/me').expect(401);
    const first = (await other.agent.get('/api/employees').expect(200)).body as Profile[];
    expect(first.find((e) => e.id === me.id)?.hasAccount).toBe(false);
  });

  it('only lets user managers change access', async () => {
    const plain = await createEmployee(await loginAs('second.admin'), { username: 'plain' });
    await plain.agent.post(`/api/employees/${workerId}/account`).send({ username: 'x.y.z' }).expect(403);
    await plain.agent.delete(`/api/employees/${workerId}/account`).expect(403);
  });

  it('imports rows without a username into the phone book only', async () => {
    const manager = await loginAs('second.admin');
    const rows = [
      { firstName: 'حسن', lastName: 'کارگر', position: 'اپراتور', department: 'تولید' },
      { firstName: 'رضا', lastName: 'نگهبان', position: 'نگهبان', department: 'تولید', role: 'مدیر' },
      { firstName: 'رضا', lastName: 'نگهبان', position: 'نگهبان', department: 'تولید' },
      { firstName: 'نیما', lastName: 'کاربر', username: 'nima', position: 'کارشناس', department: 'فروش' },
    ];
    const csv = 'نام,نام خانوادگی,نام کاربری,سمت,واحد,نقش\n' +
      rows.map((r) => [r.firstName, r.lastName, r.username ?? '', r.position, r.department, r.role ?? ''].join(',')).join('\n');
    const preview = await manager.post('/api/employees/import/preview').attach('file', Buffer.from(csv), 'staff.csv').expect(200);
    expect(preview.body.rows.map((r: { errors: string[] }) => r.errors)).toEqual([[], [], [], []]);
    expect(preview.body.rows[0].warnings.join(' ')).toContain('از قبل در دفتر تلفن');
    expect(preview.body.rows[1].warnings.join(' ')).toContain('نقش');
    expect(preview.body.rows[2].warnings.join(' ')).toContain('ردیف 3');

    const res = await manager.post('/api/employees/import').send({ rows: rows.slice(1) }).expect(201);
    expect(res.body.skipped).toEqual([]);
    expect(res.body.created.map((c: { hasAccount: boolean; temporaryPassword: string | null }) => [c.hasAccount, c.temporaryPassword === null]))
      .toEqual([[false, true], [false, true], [true, false]]);
    const nima = res.body.created[2];
    await request(app).post('/api/auth/login').send({ username: 'nima', password: nima.temporaryPassword }).expect(200);
  });
});

async function loginAs(username: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: `${username}-Pass-123` }).expect(200);
  return agent;
}
