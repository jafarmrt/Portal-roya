import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryListing, DirectoryUser } from '../server/ldap';

const directory = vi.hoisted(() => ({ authenticate: vi.fn(), list: vi.fn(), down: false }));

vi.mock('../server/ldap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/ldap')>();
  return {
    ...actual,
    isDirectoryEnabled: () => true,
    canListDirectory: () => true,
    authenticateWithDirectory: (username: string, password: string) => directory.authenticate(username, password),
    listDirectoryUsers: async () => {
      if (directory.down) throw new actual.DirectoryUnavailableError('connect ECONNREFUSED');
      return directory.list();
    },
  };
});

const { pool } = await import('../server/db/index');
const { config } = await import('../server/config');
const { SESSION_COOKIE } = await import('../server/auth');
const { app, createEmployee, resetDatabase, setupAdmin } = await import('./helpers');

function listed(overrides: Partial<DirectoryListing> = {}): DirectoryListing {
  return {
    username: 'ali.rezaei',
    dn: 'CN=Ali Rezaei,OU=Edari,DC=roya,DC=com',
    firstName: 'Ali',
    lastName: 'Rezaei',
    email: '',
    position: '',
    department: 'Edari',
    extension: '',
    mobile: '',
    ...overrides,
  };
}

function adUser(overrides: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    username: 'nima.sadeghi',
    dn: 'CN=Nima Sadeghi,OU=Edari,DC=roya,DC=com',
    firstName: 'Nima',
    lastName: 'Sadeghi',
    email: '',
    position: '',
    department: '',
    extension: '',
    mobile: '',
    isAdmin: null,
    ...overrides,
  };
}

async function signInWithAd(user: DirectoryUser) {
  directory.authenticate.mockResolvedValue(user);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username: user.username, password: 'ad-password' }).expect(200);
  return { agent, user: res.body.user };
}

describe('Active Directory users list and first sign-in', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
  });
  beforeEach(() => {
    directory.authenticate.mockReset();
    directory.list.mockReset();
  });
  afterAll(() => pool.end());

  it('lists active AD users who are not in the portal yet as import rows', async () => {
    await createEmployee(admin, { username: 'reza.karimi' });
    directory.list.mockResolvedValue([
      listed(),
      listed({ username: 'reza.karimi', firstName: 'Reza', lastName: 'Karimi' }),
      listed({ username: 'scanner', firstName: '', lastName: '' }),
    ]);
    const res = await admin.get('/api/employees/directory').expect(200);
    expect(res.body.newUsers).toEqual([
      { firstName: 'Ali', lastName: 'Rezaei', username: 'ali.rezaei', position: 'نامشخص', department: 'Edari', email: '', mobile: '', extension: '' },
    ]);
    expect(res.body.inPortal).toBe(1);
    expect(res.body.unnamed).toEqual(['scanner']);
    // The first admin is a local account, not a Windows user.
    expect(res.body.notInDirectory).toEqual([{ username: 'admin', name: 'مدیر سیستم' }]);
  });

  it('answers 503 when AD cannot be reached, and only user managers may ask', async () => {
    directory.down = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await admin.get('/api/employees/directory').expect(503);
    } finally {
      directory.down = false;
    }
    const staff = await createEmployee(admin, { username: 'staff.member' });
    await staff.agent.get('/api/employees/directory').expect(403);
  });

  it('imports AD accounts without temporary passwords', async () => {
    const csv = 'نام,نام خانوادگی,نام کاربری,سمت,واحد\nعلی,رضایی,ali.rezaei,کارشناس,فروش\n';
    const preview = await admin.post('/api/employees/import/preview').field('signIn', 'ldap').attach('file', Buffer.from(csv), 'ad.csv').expect(200);
    expect(preview.body.rows[0].errors).toEqual([]);
    const res = await admin
      .post('/api/employees/import')
      .send({ rows: preview.body.rows.map((r: { data: unknown }) => r.data), signIn: 'ldap' })
      .expect(201);
    expect(res.body.created[0]).toMatchObject({ username: 'ali.rezaei', authSource: 'ldap', temporaryPassword: null });

    // The imported Persian name stays, and only the birthday is still asked for.
    const { user } = await signInWithAd(adUser({ username: 'ali.rezaei', firstName: 'Ali', lastName: 'Rezaei' }));
    expect(user).toMatchObject({ firstName: 'علی', lastName: 'رضایی', authSource: 'ldap', mustChangePassword: false, needsProfile: true });
  });

  it('asks a new AD user for a Persian name and birthday, and never takes the name from AD', async () => {
    const { agent, user } = await signInWithAd(adUser());
    expect(user).toMatchObject({ firstName: 'nima.sadeghi', lastName: '', needsProfile: true });

    await agent.post('/api/auth/profile').send({ firstName: 'Nima', lastName: 'Sadeghi', birthDate: '1370/05/12' }).expect(400);
    await agent.post('/api/auth/profile').send({ firstName: 'نیما', lastName: 'صادقی', birthDate: '' }).expect(400);
    const done = await agent.post('/api/auth/profile').send({ firstName: 'نیما', lastName: 'صادقی', birthDate: '1370/05/12', hideBirthday: true }).expect(200);
    expect(done.body.user).toMatchObject({ firstName: 'نیما', lastName: 'صادقی', birthDate: '1370/05/12', hideBirthday: true, needsProfile: false });

    // Later sign-ins keep the Persian name and an English AD title does not replace a Persian position.
    await admin.patch(`/api/employees/${user.id}`).send({ position: 'کارشناس اداری' }).expect(200);
    const again = await signInWithAd(adUser({ position: 'Office Clerk', department: 'Admin' }));
    expect(again.user).toMatchObject({ firstName: 'نیما', lastName: 'صادقی', position: 'کارشناس اداری', needsProfile: false });
  });

  it('lets colleagues change their own name but not their position', async () => {
    const { agent, id } = await createEmployee(admin, { username: 'mina.rad' });
    const res = await agent.patch(`/api/employees/${id}`).send({ firstName: 'مینا', lastName: 'راد' }).expect(200);
    expect(res.body).toMatchObject({ firstName: 'مینا', lastName: 'راد' });
    await agent.patch(`/api/employees/${id}`).send({ position: 'مدیر' }).expect(403);
    const log = await admin.get('/api/audit-log').expect(200);
    expect(JSON.stringify(log.body)).toContain('مینا راد');
  });

  it('renews a session that is in use, so colleagues stay signed in', async () => {
    const { id } = await createEmployee(admin, { username: 'long.session' });
    const dayOld = jwt.sign({ sub: id, iat: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 }, config.sessionSecret, { expiresIn: '30d' });
    const renewed = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${dayOld}`).expect(200);
    expect(String(renewed.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=`);

    const fresh = jwt.sign({ sub: id }, config.sessionSecret, { expiresIn: '30d' });
    const kept = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${fresh}`).expect(200);
    expect(kept.headers['set-cookie']).toBeUndefined();
  });
});
