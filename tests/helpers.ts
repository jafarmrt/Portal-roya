import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../server/app';
import { db, runMigrations } from '../server/db/index';
import { ensureRoles } from '../server/roles';

export const app = createApp();

export const ADMIN = { username: 'admin', password: 'Admin-pass-123' };

export const TEST_DEPARTMENTS = ['فناوری اطلاعات', 'فروش', 'طراحی', 'تولید', 'd'];

/** Brings the test database to the latest schema and empties every table. */
export async function resetDatabase() {
  await runMigrations();
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length > 0) {
    await db.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`));
  }
  await ensureRoles();
}

/** Runs first-time setup and returns an agent logged in as the first admin. */
export async function setupAdmin() {
  const agent = request.agent(app);
  const res = await agent.post('/api/system/setup').send({
    ...ADMIN,
    firstName: 'مدیر',
    lastName: 'سیستم',
    position: 'مدیر فناوری',
    department: 'فناوری اطلاعات',
  });
  if (res.status !== 201 && res.status !== 200) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  // Colleagues may only be put in departments from the list, so the tests' departments are added to it.
  await agent.put('/api/settings').send({ departments: TEST_DEPARTMENTS }).expect(200);
  return agent;
}

/** Creates an employee through the API and returns a logged-in agent that already chose a password. */
export async function createEmployee(
  admin: ReturnType<typeof request.agent>,
  data: { username: string; department?: string; role?: string },
) {
  const created = await admin.post('/api/employees').send({
    username: data.username,
    firstName: 'همکار',
    lastName: data.username,
    position: 'کارشناس',
    department: data.department ?? 'فروش',
    role: data.role ?? 'employee',
  });
  if (created.status !== 201) throw new Error(`create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: data.username, password: created.body.temporaryPassword }).expect(200);
  const password = `${data.username}-Pass-123`;
  await agent.post('/api/auth/change-password').send({ currentPassword: created.body.temporaryPassword, newPassword: password }).expect(200);
  return { agent, id: created.body.employee?.id ?? created.body.id, password };
}
