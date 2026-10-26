import { eq, sql } from 'drizzle-orm';
import { cleanDepartmentName, departmentKey, findDepartment } from '../shared/departments.js';
import { db } from './db/index.js';
import { settings } from './db/schema.js';
import { broadcastChange } from './events.js';
import { HttpError } from './http.js';
import { ensureSettings } from './settings.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The managed list of departments, in the order set in the portal settings. */
export async function departmentList(): Promise<string[]> {
  return (await ensureSettings()).departments;
}

/** Runs `fn` with the department list locked, and saves the list it returns. */
async function changeList<T>(fn: (list: string[], tx: Tx) => Promise<{ list: string[]; result: T }>): Promise<T> {
  await ensureSettings();
  const { changed, result } = await db.transaction(async (tx) => {
    const [row] = await tx.select({ departments: settings.departments }).from(settings).where(eq(settings.id, 'global')).for('update');
    const { list, result } = await fn([...row.departments], tx);
    const changed = JSON.stringify(list) !== JSON.stringify(row.departments);
    if (changed) await tx.update(settings).set({ departments: list }).where(eq(settings.id, 'global'));
    return { changed, result };
  });
  if (changed) broadcastChange('settings');
  return result;
}

/** The list's spelling of `value`, or a 400 naming the unknown department. */
export async function requireDepartment(value: string): Promise<string> {
  const found = findDepartment(await departmentList(), value);
  if (!found) throw new HttpError(400, `واحد «${cleanDepartmentName(value)}» در فهرست واحدهای سازمان نیست؛ ابتدا آن را در تنظیمات اضافه کنید.`);
  return found;
}

/** Like requireDepartment, but adds the department to the list when it is new (for Active Directory and setup). */
export async function ensureDepartment(value: string): Promise<string> {
  const name = cleanDepartmentName(value);
  const existing = findDepartment(await departmentList(), name);
  if (existing) return existing;
  return changeList(async (list) => {
    const found = findDepartment(list, name);
    return found ? { list, result: found } : { list: [...list, name], result: name };
  });
}

/** Adds the given new departments, e.g. those confirmed in an Excel import. Returns the list's spelling of each. */
export async function addDepartments(names: string[]): Promise<Map<string, string>> {
  return changeList(async (list) => {
    const out = new Map<string, string>();
    for (const value of names) {
      const name = cleanDepartmentName(value);
      if (!name) continue;
      let found = findDepartment(list, name);
      if (!found) {
        list.push(name);
        found = name;
      }
      out.set(value, found);
    }
    return { list, result: out };
  });
}

/** Moves every record from department `from` to `to` (exact names). */
async function moveRecords(tx: Tx, from: string, to: string) {
  if (from === to) return;
  await tx.execute(sql`update employees set department = ${to} where department = ${from}`);
  await tx.execute(sql`update polls set department = ${to} where department = ${from}`);
  await tx.execute(sql`
    update news
    set target_departments = array(select distinct d from unnest(array_replace(target_departments, ${from}, ${to})) as d)
    where ${from} = any(target_departments)
  `);
}

/** How many colleagues, news items and polls use each department name (including names not in the list). */
export async function departmentUsage(): Promise<Map<string, { employees: number; activeEmployees: number; news: number; polls: number }>> {
  const usage = new Map<string, { employees: number; activeEmployees: number; news: number; polls: number }>();
  const entry = (name: string) => {
    if (!usage.has(name)) usage.set(name, { employees: 0, activeEmployees: 0, news: 0, polls: 0 });
    return usage.get(name)!;
  };
  const people = await db.execute<{ name: string; total: number; active: number }>(
    sql`select department as name, count(*)::int as total, count(*) filter (where is_active)::int as active from employees group by department`,
  );
  for (const r of people.rows) Object.assign(entry(r.name), { employees: r.total, activeEmployees: r.active });
  const items = await db.execute<{ name: string; count: number }>(sql`select d as name, count(*)::int as count from news, unnest(target_departments) as d group by d`);
  for (const r of items.rows) entry(r.name).news = r.count;
  const asked = await db.execute<{ name: string; count: number }>(
    sql`select department as name, count(*)::int as count from polls where department <> 'all' group by department`,
  );
  for (const r of asked.rows) entry(r.name).polls = r.count;
  return usage;
}

/**
 * Renames a department everywhere it is used. When the new name is another department in the list,
 * the two are merged: everyone moves to that one and the old name leaves the list.
 */
export async function renameDepartment(fromValue: string, toValue: string) {
  const to = cleanDepartmentName(toValue);
  if (!to) throw new HttpError(400, 'نام تازهٔ واحد را بنویسید.');
  const result = await changeList(async (list, tx) => {
    const from = findDepartment(list, fromValue);
    if (!from) throw new HttpError(404, `واحد «${cleanDepartmentName(fromValue)}» در فهرست نیست.`);
    const other = list.find((d) => d !== from && departmentKey(d) === departmentKey(to));
    const target = other ?? to;
    await moveRecords(tx, from, target);
    const next = other ? list.filter((d) => d !== from) : list.map((d) => (d === from ? to : d));
    return { list: next, result: { from, to: target, merged: Boolean(other) } };
  });
  broadcastChange('employees');
  broadcastChange('news');
  broadcastChange('polls');
  return result;
}

/**
 * Checks a new department list from the settings page: names are tidied, spelling variants of one
 * department are kept once, and a department still in use cannot be dropped (rename or merge it instead).
 */
export async function checkDepartmentList(values: string[]): Promise<string[]> {
  const list: string[] = [];
  for (const value of values) {
    const name = cleanDepartmentName(value);
    if (name && !findDepartment(list, name)) list.push(name);
  }
  if (list.length === 0) throw new HttpError(400, 'فهرست واحدها نمی‌تواند خالی باشد.');
  const current = await departmentList();
  const usage = await departmentUsage();
  const inUse = current.filter((d) => !findDepartment(list, d) && usage.has(d));
  if (inUse.length > 0) {
    throw new HttpError(
      400,
      `واحد «${inUse[0]}» هنوز استفاده می‌شود (همکاران، اخبار یا نظرسنجی‌ها)؛ برای حذف، آن را در واحد دیگری ادغام کنید.`,
    );
  }
  // An existing department keeps its stored spelling, so records that use it still match.
  return list.map((d) => findDepartment(current, d) ?? d);
}

/**
 * Makes the stored data agree with the department list. Runs at every start-up:
 * - spelling variants inside the list are merged into the first one;
 * - a department used by colleagues, news or polls but missing from the list is added to it;
 * - records written with a variant spelling are moved to the list's spelling.
 * Nothing is deleted, so no colleague loses their department.
 */
export async function reconcileDepartments(): Promise<{ added: string[]; renamed: { from: string; to: string }[] }> {
  const report = { added: [] as string[], renamed: [] as { from: string; to: string }[] };
  await changeList(async (current, tx) => {
    const list: string[] = [];
    const moves: { from: string; to: string }[] = [];
    for (const d of current) {
      const name = cleanDepartmentName(d);
      if (!name) continue;
      const found = findDepartment(list, name);
      if (found) moves.push({ from: d, to: found });
      else {
        list.push(name);
        if (name !== d) moves.push({ from: d, to: name });
      }
    }

    const used = await tx.execute<{ name: string }>(sql`
      select department as name from employees
      union select d from news, unnest(target_departments) as d
      union select department from polls where department <> 'all'
    `);
    // Sorted so that the spelling kept for a new department does not depend on row order.
    for (const { name: value } of [...used.rows].sort((a, b) => a.name.localeCompare(b.name, 'fa'))) {
      let found = findDepartment(list, value);
      if (!found) {
        found = cleanDepartmentName(value) || 'نامشخص';
        if (!findDepartment(list, found)) {
          list.push(found);
          report.added.push(found);
        } else found = findDepartment(list, found)!;
      }
      if (found !== value) moves.push({ from: value, to: found });
    }

    const unique = [...new Map(moves.map((m) => [m.from, m])).values()];
    for (const m of unique) await moveRecords(tx, m.from, m.to);
    report.renamed = unique;
    return { list, result: undefined };
  });
  return report;
}

/** requireDepartment for a list, e.g. a news audience; repeated names are kept once. */
export async function requireDepartments(values: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const value of values) {
    const name = await requireDepartment(value);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}
