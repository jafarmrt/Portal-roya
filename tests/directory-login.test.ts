import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryUser } from '../server/ldap';

const directory = vi.hoisted(() => ({ authenticate: vi.fn(), down: false }));

vi.mock('../server/ldap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/ldap')>();
  return {
    ...actual,
    isDirectoryEnabled: () => true,
    // An outage throws outside the vi.fn, which would otherwise report the error as a test failure.
    authenticateWithDirectory: async (username: string, password: string) => {
      if (directory.down) throw new actual.DirectoryUnavailableError('connect ECONNREFUSED');
      return directory.authenticate(username, password);
    },
  };
});

const { pool } = await import('../server/db/index');
const { ADMIN, app, createEmployee, resetDatabase, setupAdmin } = await import('./helpers');

function adUser(overrides: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    username: 'sara.ahmadi',
    dn: 'CN=Sara Ahmadi,OU=Staff,DC=roya,DC=local',
    firstName: 'سارا',
    lastName: 'احمدی',
    email: 'sara@roya.local',
    position: 'کارشناس فروش',
    department: 'فروش',
    extension: '214',
    mobile: '',
    isAdmin: null,
    ...overrides,
  };
}

describe('Active Directory sign-in', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
  });
  beforeEach(() => directory.authenticate.mockReset());
  afterAll(() => pool.end());

  it('reports directory sign-in on the status endpoint', async () => {
    const res = await request(app).get('/api/system/status').expect(200);
    expect(res.body.directoryLogin).toBe(true);
  });

  it('keeps the local admin working without asking AD', async () => {
    await request(app).post('/api/auth/login').send(ADMIN).expect(200);
    expect(directory.authenticate).not.toHaveBeenCalled();
  });

  it('creates the portal account from AD on first sign-in', async () => {
    directory.authenticate.mockResolvedValue(adUser());
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username: 'ROYA\\Sara.Ahmadi', password: 'ad-password' }).expect(200);
    expect(directory.authenticate).toHaveBeenCalledWith('sara.ahmadi', 'ad-password');
    expect(res.body.user).toMatchObject({
      username: 'sara.ahmadi',
      firstName: 'سارا',
      department: 'فروش',
      extension: '214',
      role: 'employee',
      authSource: 'ldap',
      mustChangePassword: false,
    });
    await agent.get('/api/employees').expect(200);
  });

  it('refreshes the profile from AD on later sign-ins without duplicating the account', async () => {
    directory.authenticate.mockResolvedValue(adUser({ position: 'سرپرست فروش' }));
    const res = await request(app).post('/api/auth/login').send({ username: 'sara.ahmadi@roya.local', password: 'ad-password' }).expect(200);
    expect(res.body.user.position).toBe('سرپرست فروش');
    const list = await admin.get('/api/employees').expect(200);
    expect(list.body.filter((e: { username: string }) => e.username === 'sara.ahmadi')).toHaveLength(1);
  });

  it('rejects a wrong AD password', async () => {
    directory.authenticate.mockResolvedValue(null);
    await request(app).post('/api/auth/login').send({ username: 'sara.ahmadi', password: 'wrong' }).expect(401);
  });

  it('blocks an AD account that a manager deactivated in the portal', async () => {
    const list = await admin.get('/api/employees').expect(200);
    const sara = list.body.find((e: { username: string }) => e.username === 'sara.ahmadi');
    await admin.patch(`/api/employees/${sara.id}`).send({ isActive: false }).expect(200);
    directory.authenticate.mockResolvedValue(adUser());
    await request(app).post('/api/auth/login').send({ username: 'sara.ahmadi', password: 'ad-password' }).expect(401);
    expect(directory.authenticate).not.toHaveBeenCalled();
    await admin.patch(`/api/employees/${sara.id}`).send({ isActive: true }).expect(200);
  });

  it('does not let AD accounts change or reset a portal password', async () => {
    directory.authenticate.mockResolvedValue(adUser());
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username: 'sara.ahmadi', password: 'ad-password' }).expect(200);
    await agent.post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'New-pass-123' }).expect(400);
    await admin.post(`/api/employees/${res.body.user.id}/reset-password`).expect(400);
  });

  it('links an existing local account when its AD password is accepted', async () => {
    const { password } = await createEmployee(admin, { username: 'reza.karimi' });
    directory.authenticate.mockResolvedValue(adUser({ username: 'reza.karimi', firstName: 'رضا', lastName: 'کریمی' }));
    const res = await request(app).post('/api/auth/login').send({ username: 'reza.karimi', password: 'ad-password' }).expect(200);
    expect(res.body.user.authSource).toBe('ldap');
    // From now on only the AD password counts.
    directory.authenticate.mockResolvedValue(null);
    await request(app).post('/api/auth/login').send({ username: 'reza.karimi', password }).expect(401);
  });

  it('syncs the manager role from the AD admin group but never demotes the last manager', async () => {
    directory.authenticate.mockResolvedValue(adUser({ username: 'boss', isAdmin: true }));
    const boss = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'ad-password' }).expect(200);
    expect(boss.body.user.role).toBe('manager');
    directory.authenticate.mockResolvedValue(adUser({ username: 'boss', isAdmin: false }));
    const demoted = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'ad-password' }).expect(200);
    expect(demoted.body.user.role).toBe('employee');
  });

  it('answers 503 when AD is down, but local accounts still sign in', async () => {
    directory.down = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).post('/api/auth/login').send({ username: 'sara.ahmadi', password: 'ad-password' });
    expect(res.status).toBe(503);
    await request(app).post('/api/auth/login').send({ username: ADMIN.username, password: 'wrong-password' }).expect(401);
    await request(app).post('/api/auth/login').send(ADMIN).expect(200);
    directory.down = false;
  });
});
