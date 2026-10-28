import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { ALL_PERMISSIONS } from '../shared/permissions';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

const newsItem = { title: 'اطلاعیه', summary: 'خلاصه', content: 'متن', category: 'اخبار' };
const newUser = (username: string, role?: string) => ({
  username,
  firstName: 'همکار',
  lastName: username,
  position: 'کارشناس',
  department: 'فروش',
  ...(role ? { role } : {}),
});

describe('roles and permissions', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let adminId: string;
  let manager: Awaited<ReturnType<typeof createEmployee>>;
  let expert: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    adminId = (await admin.get('/api/auth/me').expect(200)).body.user.id;
    manager = await createEmployee(admin, { username: 'manager.one', role: 'manager' });
    expert = await createEmployee(admin, { username: 'expert.one' });
  });
  afterAll(() => pool.end());

  it('makes the first user an admin with every permission', async () => {
    const me = await admin.get('/api/auth/me').expect(200);
    expect(me.body.user.role).toBe('admin');
    expect([...me.body.user.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());

    const roles = await expert.agent.get('/api/roles').expect(200);
    expect(roles.body.map((r: { id: string }) => r.id)).toEqual(['admin', 'manager', 'employee']);
  });

  it('lets managers publish but not manage users, settings or roles by default', async () => {
    await manager.agent.post('/api/news').send(newsItem).expect(201);
    await manager.agent.post('/api/employees').send(newUser('nope.one')).expect(403);
    await manager.agent.put('/api/settings').send({ departments: ['الف'] }).expect(403);
    await manager.agent.post('/api/roles').send({ name: 'نقش من' }).expect(403);
    await manager.agent.patch('/api/roles/manager').send({ permissions: ALL_PERMISSIONS }).expect(403);
    await manager.agent.get('/api/moods/summary').expect(200);

    await expert.agent.post('/api/news').send(newsItem).expect(403);
    await expert.agent.get('/api/moods/summary').expect(403);
  });

  it('applies permission changes made by the admin immediately', async () => {
    await admin.patch('/api/roles/manager').send({ permissions: ['news.manage', 'users.manage'] }).expect(200);
    const me = await manager.agent.get('/api/auth/me').expect(200);
    expect(me.body.user.permissions.sort()).toEqual(['news.manage', 'users.manage']);

    await manager.agent.post('/api/employees').send(newUser('hired.one')).expect(201);
    await manager.agent.post('/api/polls').send({ title: 'نظر', questions: [{ text: 'نظر شما؟', type: 'text' }] }).expect(403);
  });

  it('never lets a user manager touch admin accounts or hand out the admin role', async () => {
    await manager.agent.post('/api/employees').send(newUser('sneaky.one', 'admin')).expect(403);
    await manager.agent.patch(`/api/employees/${manager.id}`).send({ role: 'admin' }).expect(403);
    await manager.agent.patch(`/api/employees/${adminId}`).send({ isActive: false }).expect(403);
    await manager.agent.post(`/api/employees/${adminId}/reset-password`).expect(403);
    // Ordinary accounts are fine.
    const plain = await createEmployee(admin, { username: 'plain.two' });
    await manager.agent.post(`/api/employees/${plain.id}/reset-password`).expect(200);
  });

  it('keeps the admin role complete and at least one admin active', async () => {
    await admin.patch('/api/roles/admin').send({ permissions: [] }).expect(400);
    await admin.delete('/api/roles/manager').expect(400);
    const demoted = await admin.patch(`/api/employees/${adminId}`).send({ role: 'employee' }).expect(400);
    expect(demoted.body.error).toContain('ادمین');
    await admin.post('/api/employees').send(newUser('ghost.one', 'no-such-role')).expect(400);
    await admin.patch('/api/roles/manager').send({ permissions: ['news.manage', 'bogus.perm'] }).expect(400);
  });

  it('supports custom roles that can be assigned and removed', async () => {
    const created = await admin.post('/api/roles').send({ name: 'سرپرست واحد', permissions: ['polls.manage'] }).expect(201);
    const roleId = created.body.id;
    await admin.post('/api/roles').send({ name: 'سرپرست واحد' }).expect(409);

    await admin.patch(`/api/employees/${expert.id}`).send({ role: roleId }).expect(200);
    await expert.agent.post('/api/polls').send({ title: 'ناهار', questions: [{ text: 'غذای پیشنهادی؟', type: 'text' }] }).expect(201);

    const blocked = await admin.delete(`/api/roles/${roleId}`).expect(409);
    expect(blocked.body.error).toContain('1 همکار');
    await admin.patch(`/api/employees/${expert.id}`).send({ role: 'employee' }).expect(200);
    await admin.delete(`/api/roles/${roleId}`).expect(200);
    await expert.agent.post('/api/polls').send({ title: 'دوباره', questions: [{ text: 'غذای پیشنهادی؟', type: 'text' }] }).expect(403);
  });

  it('separates app links from the other portal settings', async () => {
    await admin.patch('/api/roles/manager').send({ permissions: ['systems.manage'] }).expect(200);
    const systems = [{ id: 'crm', name: 'CRM', description: '', iconName: 'Database', url: 'https://crm.local', bgColor: 'bg-red-50', textColor: 'text-red-700' }];
    await manager.agent.put('/api/settings').send({ systems }).expect(200);
    await manager.agent.put('/api/settings').send({ systems, departments: ['الف'] }).expect(403);
  });

  it('lets the sender or a moderator remove a birthday wish', async () => {
    await admin.patch('/api/roles/manager').send({ permissions: ['comments.moderate'] }).expect(200);
    const other = await createEmployee(admin, { username: 'other.one' });
    const send = () => expert.agent.post(`/api/employees/${other.id}/birthday_wishes`).send({ message: 'تولدت مبارک' }).expect(201);
    const wishIds = async () => {
      const all = await admin.get('/api/birthday_wishes').expect(200);
      return (all.body[other.id] ?? []).map((w: { id: string }) => w.id) as string[];
    };

    await send();
    let [id] = await wishIds();
    await other.agent.delete(`/api/birthday_wishes/${id}`).expect(403);
    await expert.agent.delete(`/api/birthday_wishes/${id}`).expect(200);

    await send();
    [id] = await wishIds();
    await manager.agent.delete(`/api/birthday_wishes/${id}`).expect(200);
    expect(await wishIds()).toEqual([]);
  });

  it('keeps someone who manages staff within their own permissions', async () => {
    const hrRole = (await admin.post('/api/roles').send({ name: 'کارگزینی', permissions: ['users.manage'] }).expect(201)).body.id;
    const readerRole = (await admin.post('/api/roles').send({ name: 'خوانندهٔ صندوق', permissions: ['suggestions.management'] }).expect(201)).body.id;
    const hr = await createEmployee(admin, { username: 'hr.officer', role: hrRole });
    const reader = await createEmployee(admin, { username: 'box.reader', role: readerRole });
    const plain = await createEmployee(admin, { username: 'plain.three' });

    // Not their own role, and no role holding a permission they lack.
    const self = await hr.agent.patch(`/api/employees/${hr.id}`).send({ role: readerRole }).expect(403);
    expect(self.body.error).toContain('خودتان');
    const give = await hr.agent.patch(`/api/employees/${plain.id}`).send({ role: readerRole }).expect(403);
    expect(give.body.error).toContain('خوانندهٔ صندوق');
    await hr.agent.post('/api/employees').send(newUser('reader.two', readerRole)).expect(403);
    await hr.agent.post('/api/employees').send(newUser('hr.two', hrRole)).expect(201);
    await hr.agent.patch(`/api/employees/${plain.id}`).send({ role: hrRole }).expect(200);

    // Someone holding more than they do keeps role, password and access; the rest of the profile is theirs to keep up.
    await hr.agent.post(`/api/employees/${reader.id}/reset-password`).expect(403);
    await hr.agent.patch(`/api/employees/${reader.id}`).send({ role: 'employee' }).expect(403);
    await hr.agent.patch(`/api/employees/${reader.id}`).send({ isActive: false }).expect(403);
    await hr.agent.delete(`/api/employees/${reader.id}/account`).expect(403);
    await hr.agent.patch(`/api/employees/${reader.id}`).send({ position: 'مدیرعامل' }).expect(200);

    // The Excel import keeps to the same rules.
    const row = (username: string, role: string) => ({ firstName: 'الف', lastName: 'ب', username, position: 'پ', department: 'فروش', role });
    const imported = await hr.agent
      .post('/api/employees/import')
      .send({ rows: [row('imp.reader', 'خوانندهٔ صندوق'), row('box.reader', 'کارشناس'), row('imp.plain', 'کارشناس')] })
      .expect(201);
    expect(imported.body.created.map((c: { username: string }) => c.username)).toEqual(['imp.plain']);
    expect(imported.body.skipped.map((r: { errors: string[] }) => r.errors[0])).toEqual([
      'سطح دسترسی: «خوانندهٔ صندوق» دسترسی‌هایی دارد که خودتان ندارید',
      'سطح دسترسی: این همکار دسترسی‌هایی دارد که شما ندارید؛ سطح دسترسی او را ادمین پرتال تغییر می‌دهد',
    ]);

    // The admin is not limited.
    await admin.patch(`/api/employees/${plain.id}`).send({ role: readerRole }).expect(200);
  });

  it('resolves imported roles by Persian name and keeps the admin role to admins', async () => {
    await admin.post('/api/roles').send({ name: 'سرپرست' }).expect(201);
    const row = (username: string, role: string) => ({ firstName: 'الف', lastName: 'ب', username, position: 'پ', department: 'فروش', role });
    const res = await admin
      .post('/api/employees/import')
      .send({ rows: [row('imp.one', 'سرپرست'), row('imp.two', 'کارشناس'), row('imp.three', 'ناشناخته')] })
      .expect(201);
    expect(res.body.created.map((c: { username: string }) => c.username)).toEqual(['imp.one', 'imp.two']);
    expect(res.body.skipped[0].errors[0]).toContain('ناشناخته');

    await admin.patch('/api/roles/manager').send({ permissions: ['users.manage'] }).expect(200);
    const byManager = await manager.agent.post('/api/employees/import').send({ rows: [row('imp.four', 'ادمین برنامه')] }).expect(201);
    expect(byManager.body.created).toEqual([]);
    expect(byManager.body.skipped[0].errors[0]).toContain('ادمین');
  });

  it('renames the built-in levels on upgrade, unless an admin already named them', async () => {
    const names = async () =>
      Object.fromEntries((await pool.query<{ id: string; name: string }>('SELECT id, name FROM roles')).rows.map((r) => [r.id, r.name]));
    const before = await names();
    // As on a server before 2.43: old names, except one an admin had changed, and a custom level already called «همکار».
    await pool.query(`UPDATE roles SET name = 'ادمین برنامه' WHERE id = 'admin'`);
    await pool.query(`UPDATE roles SET name = 'مدیران محتوا' WHERE id = 'manager'`);
    await pool.query(`UPDATE roles SET name = 'کارشناس' WHERE id = 'employee'`);
    await pool.query(`INSERT INTO roles (id, name, description, permissions, is_system) VALUES ('same-name', 'همکار', '', '{}', false)`);

    for (const statement of readFileSync('drizzle/0027_access_level_names.sql', 'utf8').split('--> statement-breakpoint')) {
      await pool.query(statement);
    }
    const after = await names();
    expect([after.admin, after.manager, after.employee]).toEqual(['ادمین پرتال', 'مدیران محتوا', 'کارشناس']);

    await pool.query(`DELETE FROM roles WHERE id = 'same-name'`);
    for (const id of ['admin', 'manager', 'employee']) await pool.query('UPDATE roles SET name = $1 WHERE id = $2', [before[id], id]);
  });
});
