import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanDepartmentName, departmentKey, findDepartment, suggestDepartment } from '../shared/departments';
import { db, pool } from '../server/db/index';
import { reconcileDepartments } from '../server/departments';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;

const departmentsOf = async (admin: Agent) => (await admin.get('/api/settings').expect(200)).body.departments as string[];
const departmentOf = async (admin: Agent, id: string) =>
  ((await admin.get('/api/employees').expect(200)).body as { id: string; department: string }[]).find((e) => e.id === id)!.department;

describe('department names', () => {
  it('treats spelling variants as the same department', () => {
    expect(departmentKey('منابع انساني')).toBe(departmentKey('منابع  انسانی'));
    expect(departmentKey('فناوری اطلاعات (IT)')).toBe(departmentKey('فناوري‌اطلاعات(it)'));
    expect(departmentKey('واحد ۱')).toBe(departmentKey('واحد 1'));
    expect(cleanDepartmentName('  مالي   و  اداري ')).toBe('مالی و اداری');
    expect(findDepartment(['فروش', 'مالی'], ' فروش ')).toBe('فروش');
    expect(findDepartment(['فروش'], 'تولید')).toBeUndefined();
    expect(suggestDepartment(['فروش و امور مشتریان', 'مالی'], 'فروش')).toBe('فروش و امور مشتریان');
  });
});

describe('one department list for the whole portal', () => {
  let admin: Agent;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
  });
  afterAll(() => pool.end());

  it('adds the first admin’s department to the list at setup', async () => {
    expect(await departmentsOf(admin)).toContain('فناوری اطلاعات');
  });

  it('only accepts departments from the list, written the list’s way', async () => {
    const base = { hasAccount: false, firstName: 'رضا', lastName: 'نوری', position: 'اپراتور' };
    const bad = await admin.post('/api/employees').send({ ...base, department: 'کارگاه' }).expect(400);
    expect(bad.body.error).toContain('کارگاه');

    const ok = await admin.post('/api/employees').send({ ...base, department: '  فروش ' }).expect(201);
    expect(ok.body.employee.department).toBe('فروش');
    await admin.patch(`/api/employees/${ok.body.employee.id}`).send({ department: 'ناموجود' }).expect(400);

    await admin.post('/api/polls').send({ title: 'x', targetDepartments: ['ناموجود'], questions: [{ text: 'x؟', type: 'text' }] }).expect(400);
    await admin
      .post('/api/news')
      .send({ title: 't', summary: 's', content: 'c', category: 'اخبار', targetDepartments: ['ناموجود'] })
      .expect(400);
    const item = await admin
      .post('/api/news')
      .send({ title: 't', summary: 's', content: 'c', category: 'اخبار', targetDepartments: ['فروش', 'فروش '] })
      .expect(201);
    expect(item.body.targetDepartments).toEqual(['فروش']);
  });

  it('brings existing free-text departments into the list without losing anyone', async () => {
    const a = await createEmployee(admin, { username: 'messy.a', department: 'فروش' });
    const b = await createEmployee(admin, { username: 'messy.b', department: 'فروش' });
    const c = await createEmployee(admin, { username: 'messy.c', department: 'فروش' });
    // Data written before the list was enforced: variants and departments the list never had.
    await db.execute(sql`update employees set department = 'فروش  ' where id = ${a.id}`);
    await db.execute(sql`update employees set department = 'منابع انساني' where id = ${b.id}`);
    await db.execute(sql`update employees set department = 'منابع انسانی' where id = ${c.id}`);
    await db.execute(sql`update news set target_departments = array['منابع انساني', 'فروش']`);
    await db.execute(sql`update settings set departments = array['فروش', 'فروش ', 'طراحی', 'فناوری اطلاعات', 'تولید', 'd']`);
    const before = await db.execute<{ n: number }>(sql`select count(*)::int as n from employees`);

    const report = await reconcileDepartments();
    expect(report.added).toEqual(['منابع انسانی']);

    const list = await departmentsOf(admin);
    expect(list.filter((d) => departmentKey(d) === departmentKey('فروش'))).toEqual(['فروش']);
    expect(list).toContain('منابع انسانی');
    expect(await departmentOf(admin, a.id)).toBe('فروش');
    expect(await departmentOf(admin, b.id)).toBe('منابع انسانی');
    expect(await departmentOf(admin, c.id)).toBe('منابع انسانی');
    const news = await db.execute<{ t: string[] }>(sql`select target_departments as t from news`);
    expect([...news.rows[0].t].sort()).toEqual(['فروش', 'منابع انسانی'].sort());
    const after = await db.execute<{ n: number }>(sql`select count(*)::int as n from employees`);
    expect(after.rows[0].n).toBe(before.rows[0].n);

    // Running it again changes nothing.
    expect(await reconcileDepartments()).toEqual({ added: [], renamed: [] });
  });

  it('reports how many colleagues use each department', async () => {
    const res = await admin.get('/api/settings/departments').expect(200);
    const hr = res.body.find((d: { name: string }) => d.name === 'منابع انسانی');
    expect(hr).toMatchObject({ employees: 2, activeEmployees: 2, news: 1 });
  });

  it('does not drop a department that is still in use', async () => {
    const list = await departmentsOf(admin);
    const res = await admin.put('/api/settings').send({ departments: list.filter((d) => d !== 'منابع انسانی') }).expect(400);
    expect(res.body.error).toContain('منابع انسانی');
    // An unused one can go, and a variant spelling of an existing one is not added twice.
    await admin.put('/api/settings').send({ departments: [...list.filter((d) => d !== 'd'), 'طراحي '] }).expect(200);
    const next = await departmentsOf(admin);
    expect(next).not.toContain('d');
    expect(next.filter((d) => departmentKey(d) === departmentKey('طراحی'))).toEqual(['طراحی']);
  });

  it('renames a department everywhere, and merges into an existing one', async () => {
    const people = (await admin.get('/api/employees').expect(200)).body as { id: string; department: string }[];
    const hr = people.filter((e) => e.department === 'منابع انسانی').map((e) => e.id);
    const poll = await admin
      .post('/api/polls')
      .send({ title: 'رضایت از رفاهیات', targetDepartments: ['منابع انسانی', 'فروش'], questions: [{ text: 'چقدر راضی هستید؟', type: 'rating' }] })
      .expect(201);
    const usage = (await admin.get('/api/settings/departments').expect(200)).body as { name: string; polls: number }[];
    expect(usage.find((d) => d.name === 'منابع انسانی')?.polls).toBe(1);
    const pollAudience = async () => (await db.execute<{ t: string[] }>(sql`select target_departments as t from polls where id = ${poll.body.id}`)).rows[0].t;

    const renamed = await admin.post('/api/settings/departments/rename').send({ from: 'منابع انسانی', to: 'سرمایه انسانی' }).expect(200);
    expect(renamed.body).toMatchObject({ to: 'سرمایه انسانی', merged: false });
    for (const id of hr) expect(await departmentOf(admin, id)).toBe('سرمایه انسانی');
    const news = await db.execute<{ t: string[] }>(sql`select target_departments as t from news`);
    expect(news.rows[0].t).toContain('سرمایه انسانی');
    expect((await pollAudience()).sort()).toEqual(['سرمایه انسانی', 'فروش'].sort());

    const merged = await admin.post('/api/settings/departments/rename').send({ from: 'سرمایه انسانی', to: 'فروش' }).expect(200);
    expect(merged.body).toMatchObject({ to: 'فروش', merged: true });
    for (const id of hr) expect(await departmentOf(admin, id)).toBe('فروش');
    expect(await departmentsOf(admin)).not.toContain('سرمایه انسانی');
    const merged2 = await db.execute<{ t: string[] }>(sql`select target_departments as t from news`);
    expect(merged2.rows[0].t).toEqual(['فروش']);
    expect(await pollAudience()).toEqual(['فروش']);
  });

  it('lets only portal managers change departments', async () => {
    const staff = await createEmployee(admin, { username: 'dept.staff' });
    await staff.agent.get('/api/settings/departments').expect(403);
    await staff.agent.post('/api/settings/departments/rename').send({ from: 'فروش', to: 'x' }).expect(403);
  });

  it('asks about unknown departments in an Excel import, then creates or maps them', async () => {
    const csv = [
      'نام,نام خانوادگی,سمت,واحد',
      'حسن,کارگر,اپراتور,کارگاه',
      'زهرا,کریمی,کارشناس,واحد فروش',
      'نیما,امینی,کارشناس,فروش',
    ].join('\n');
    const preview = await admin.post('/api/employees/import/preview').attach('file', Buffer.from(csv), 'staff.csv').expect(200);
    expect(preview.body.newDepartments).toEqual([
      { name: 'کارگاه', rows: [2] },
      { name: 'واحد فروش', rows: [3], suggestion: 'فروش' },
    ]);
    expect(preview.body.rows[0].errors).toEqual([]);
    expect(preview.body.rows[0].warnings.join(' ')).toContain('کارگاه');
    expect(preview.body.rows[2].warnings).toEqual([]);

    const rows = preview.body.rows.map((r: { data: Record<string, string> }) => r.data);
    // Without a decision the rows are not imported into a department nobody created.
    const undecided = await admin.post('/api/employees/import').send({ rows }).expect(201);
    expect(undecided.body.created.map((c: { firstName: string }) => c.firstName)).toEqual(['نیما']);
    expect(undecided.body.skipped.map((s: { row: number }) => s.row)).toEqual([1, 2]);

    const decided = await admin
      .post('/api/employees/import')
      .send({ rows: rows.slice(0, 2), departments: { کارگاه: 'کارگاه', 'واحد فروش': 'فروش' } })
      .expect(201);
    expect(decided.body.created.map((c: { department: string }) => c.department)).toEqual(['کارگاه', 'فروش']);
    expect(await departmentsOf(admin)).toContain('کارگاه');
    expect(await departmentsOf(admin)).not.toContain('واحد فروش');
  });
});
