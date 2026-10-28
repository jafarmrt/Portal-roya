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
      { firstName: 'Ali', lastName: 'Rezaei', username: 'ali.rezaei', position: '', department: 'Edari', email: '', mobile: '', extension: '' },
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

  it('asks a new AD user for a Persian name, birthday, unit and position, and never takes the name from AD', async () => {
    const { agent, user } = await signInWithAd(adUser());
    expect(user).toMatchObject({ firstName: 'nima.sadeghi', lastName: '', position: '', department: '', needsProfile: true });

    const place = { department: 'فروش', position: 'کارشناس فروش' };
    await agent.post('/api/auth/profile').send({ firstName: 'Nima', lastName: 'Sadeghi', birthDate: '1370/05/12', ...place }).expect(400);
    await agent.post('/api/auth/profile').send({ firstName: 'نیما', lastName: 'صادقی', birthDate: '', ...place }).expect(400);
    const names = { firstName: 'نیما', lastName: 'صادقی', birthDate: '1370/05/12', hideBirthday: true };
    expect((await agent.post('/api/auth/profile').send(names).expect(400)).body.error).toContain('واحد');
    await agent.post('/api/auth/profile').send({ ...names, department: 'Unknown OU', position: 'کارشناس' }).expect(400);
    const done = await agent.post('/api/auth/profile').send({ ...names, ...place }).expect(200);
    expect(done.body.user).toMatchObject({ firstName: 'نیما', lastName: 'صادقی', birthDate: '1370/05/12', hideBirthday: true, ...place, needsProfile: false });

    // Whoever manages staff is told, and the change history says the colleague chose it.
    const told = (await admin.get('/api/notifications').expect(200)).body.find((n: { title: string }) => n.title === 'همکار تازه در پرتال');
    expect(told.message).toBe('نیما صادقی (nima.sadeghi) وارد پرتال شد و سمت «کارشناس فروش» و واحد «فروش» را برای خودش انتخاب کرد؛ اگر درست نیست در «مدیریت کارکنان» اصلاحش کنید.');
    expect(told.linkTab).toBe('people');
    const history = (await admin.get('/api/audit-log').expect(200)).body;
    expect(JSON.stringify(history)).toContain('در اولین ورود سمت «کارشناس فروش» و واحد «فروش» را برای خودش انتخاب کرد');
    // Once set, the unit and position are no longer the colleague's to change.
    await agent.post('/api/auth/profile').send({ ...names, department: 'تولید', position: 'مدیر' }).expect(200);
    expect((await agent.get('/api/auth/me').expect(200)).body.user).toMatchObject(place);

    // Later sign-ins keep the Persian name and an English AD title does not replace a Persian position.
    await admin.patch(`/api/employees/${user.id}`).send({ position: 'کارشناس اداری' }).expect(200);
    const again = await signInWithAd(adUser({ position: 'Office Clerk', department: 'Admin' }));
    expect(again.user).toMatchObject({ firstName: 'نیما', lastName: 'صادقی', position: 'کارشناس اداری', department: 'فروش', needsProfile: false });
  });

  it('takes a unit from AD only when the unit list has it, and never adds AD names to the list', async () => {
    const before = (await admin.get('/api/settings').expect(200)).body.departments;
    const known = await signInWithAd(adUser({ username: 'mina.ad', department: 'طراحي', position: 'طراح' }));
    expect(known.user).toMatchObject({ department: 'طراحی', position: 'طراح', needsProfile: true });
    const unknown = await signInWithAd(adUser({ username: 'reza.ad', department: 'OU-Workshop' }));
    expect(unknown.user).toMatchObject({ department: '', position: '' });
    expect((await admin.get('/api/settings').expect(200)).body.departments).toEqual(before);

    // Staff management counts them as needing completion until they choose; a manager can also set it.
    const listed = (await admin.get('/api/employees').expect(200)).body.find((e: { id: string }) => e.id === unknown.user.id);
    expect(listed).toMatchObject({ department: '', position: '' });
    await admin.patch(`/api/employees/${unknown.user.id}`).send({ department: 'تولید', position: 'تکنسین' }).expect(200);
    const again = await signInWithAd(adUser({ username: 'reza.ad', department: 'OU-Workshop' }));
    expect(again.user).toMatchObject({ department: 'تولید', position: 'تکنسین' });
  });

  it('joins a first AD sign-in to the phone-book entry with the same name instead of keeping two', async () => {
    const entry = await admin
      .post('/api/employees')
      .send({ hasAccount: false, firstName: 'سارا', lastName: 'کاظمی', position: 'حسابدار', department: 'فروش', mobile: '09120000000' })
      .expect(201);
    const personId = entry.body.employee.id;
    const { agent, user } = await signInWithAd(adUser({ username: 'sara.kazemi', firstName: 'Sara', lastName: 'Kazemi', extension: '230' }));
    // Something that points at the new account moves with it.
    const report = await createEmployee(admin, { username: 'report.of.sara' });
    await admin.patch(`/api/employees/${report.id}`).send({ directManagerId: user.id }).expect(200);

    // A unit and position chosen on the form do not replace the entry's.
    const profile = { firstName: 'سارا', lastName: 'كاظمي', birthDate: '1368/02/03', department: 'تولید', position: 'کارشناس' };
    const asked = await agent.post('/api/auth/profile').send(profile).expect(200);
    expect(asked.body.matches).toEqual([{ id: personId, name: 'سارا کاظمی', position: 'حسابدار', department: 'فروش' }]);
    await agent.post('/api/auth/profile').send({ ...profile, claim: 'emp-unknown' }).expect(400);

    const joined = await agent.post('/api/auth/profile').send({ ...profile, claim: personId }).expect(200);
    expect(joined.body.user).toMatchObject({
      id: personId,
      username: 'sara.kazemi',
      hasAccount: true,
      authSource: 'ldap',
      position: 'حسابدار',
      department: 'فروش',
      mobile: '09120000000',
      extension: '230',
      birthDate: '1368/02/03',
      needsProfile: false,
    });
    // The session now belongs to the joined entry, and only one Sara is left.
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.id).toBe(personId);
    const list = await admin.get('/api/employees').expect(200);
    expect(list.body.filter((e: { lastName: string }) => e.lastName === 'کاظمی')).toHaveLength(1);
    expect(list.body.find((e: { id: string }) => e.id === report.id).directManagerId).toBe(personId);
    const again = await signInWithAd(adUser({ username: 'sara.kazemi' }));
    expect(again.user.id).toBe(personId);
  });

  it('keeps a separate entry when the colleague says the namesake is someone else', async () => {
    await admin.post('/api/employees').send({ hasAccount: false, firstName: 'امید', lastName: 'نوری', position: 'انباردار', department: 'تولید' }).expect(201);
    const { agent } = await signInWithAd(adUser({ username: 'omid.nouri' }));
    const profile = { firstName: 'امید', lastName: 'نوری', birthDate: '1372/09/09', department: 'تولید', position: 'انباردار' };
    expect((await agent.post('/api/auth/profile').send(profile).expect(200)).body.matches).toHaveLength(1);
    const own = await agent.post('/api/auth/profile').send({ ...profile, claim: null }).expect(200);
    expect(own.body.user).toMatchObject({ username: 'omid.nouri', needsProfile: false });
    const list = await admin.get('/api/employees').expect(200);
    expect(list.body.filter((e: { lastName: string }) => e.lastName === 'نوری')).toHaveLength(2);
  });

  it('gives a phone-book entry its Windows username from a file without ids, instead of a second entry', async () => {
    await admin.post('/api/employees').send({ hasAccount: false, firstName: 'هدی', lastName: 'خرسند', position: 'مدیر طراحی', department: 'طراحی' }).expect(201);
    const csv = 'نام,نام خانوادگی,نام کاربری,سمت,واحد\nهدی,خرسند,h.khorsand,مدیر طراحی,طراحی\n';
    const preview = await admin.post('/api/employees/import/preview').field('signIn', 'ldap').attach('file', Buffer.from(csv), 'ad.csv').expect(200);
    expect(preview.body.rows[0]).toMatchObject({ action: 'update', target: 'هدی خرسند', errors: [] });
    const res = await admin
      .post('/api/employees/import')
      .send({ rows: preview.body.rows.map((r: { data: unknown }) => r.data), signIn: 'ldap' })
      .expect(201);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.updated[0]).toMatchObject({ username: 'h.khorsand', authSource: 'ldap', temporaryPassword: null });
    const list = await admin.get('/api/employees').expect(200);
    expect(list.body.filter((e: { lastName: string }) => e.lastName === 'خرسند')).toHaveLength(1);
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
    const { rows } = await pool.query<{ sv: number }>('SELECT session_version AS sv FROM employees WHERE id = $1', [id]);
    const sv = rows[0].sv;
    const dayOld = jwt.sign({ sub: id, sv, iat: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 }, config.sessionSecret, { expiresIn: '30d' });
    const renewed = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${dayOld}`).expect(200);
    expect(String(renewed.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=`);

    const fresh = jwt.sign({ sub: id, sv }, config.sessionSecret, { expiresIn: '30d' });
    const kept = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${fresh}`).expect(200);
    expect(kept.headers['set-cookie']).toBeUndefined();
  });

  it('keeps sessions from before the upgrade until the password changes', async () => {
    const { id } = await createEmployee(admin, { username: 'old.session' });
    await pool.query('UPDATE employees SET session_version = 0 WHERE id = $1', [id]);
    const before = jwt.sign({ sub: id }, config.sessionSecret, { expiresIn: '30d' });
    await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${before}`).expect(200);
    await pool.query('UPDATE employees SET session_version = 1 WHERE id = $1', [id]);
    await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=${before}`).expect(401);
  });
});
