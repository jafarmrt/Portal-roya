import { eq, sql } from 'drizzle-orm';
import { cleanDepartmentName, departmentKey, findDepartment } from '../shared/departments.js';
import { db } from './db/index.js';
import { settings } from './db/schema.js';
import { broadcastChange } from './events.js';
import { HttpError } from './http.js';
import { ensureSettings } from './settings.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ListUsage {
  employees: number;
  activeEmployees: number;
  news: number;
  documents: number;
  polls: number;
  /** Calendar events addressed to the entry. */
  events: number;
  /** Guides filed under the department (departments only). */
  guides: number;
}

const emptyUsage = (): ListUsage => ({ employees: 0, activeEmployees: 0, news: 0, documents: 0, polls: 0, events: 0, guides: 0 });

/** What differs between the managed lists (departments, locations); the rules are the same. */
interface ListKind {
  column: 'departments' | 'locations';
  /** "واحد", "محل استقرار": the name of one entry in messages. */
  noun: string;
  /** "فهرست واحدهای سازمان" */
  listName: string;
  /** Whether the list may be emptied (every colleague needs a department, but not a location). */
  mayBeEmpty: boolean;
  /** Where the names are used, for messages: "(همکاران، اخبار یا نظرسنجی‌ها)". */
  usedIn: string;
  /** Every name stored in records, including names missing from the list. */
  usedNames: (tx: Tx) => Promise<string[]>;
  /** Moves every record from name `from` to `to` (exact names). */
  moveRecords: (tx: Tx, from: string, to: string) => Promise<void>;
  usage: () => Promise<Map<string, ListUsage>>;
  /** Resources whose data changes when a name is renamed. */
  renames: Parameters<typeof broadcastChange>[0][];
}

/**
 * A list of names kept in the settings that records must use: names are tidied, spelling variants
 * ("ي/ی", half-spaces, digits) count as one name, and renaming or merging updates every record.
 */
function managedList(kind: ListKind) {
  async function list(): Promise<string[]> {
    return (await ensureSettings())[kind.column];
  }

  /** Runs `fn` with the list locked, and saves the list it returns. */
  async function changeList<T>(fn: (list: string[], tx: Tx) => Promise<{ list: string[]; result: T }>): Promise<T> {
    await ensureSettings();
    const { changed, result } = await db.transaction(async (tx) => {
      const [row] = await tx.select({ names: settings[kind.column] }).from(settings).where(eq(settings.id, 'global')).for('update');
      const { list, result } = await fn([...row.names], tx);
      const changed = JSON.stringify(list) !== JSON.stringify(row.names);
      if (changed) await tx.update(settings).set({ [kind.column]: list }).where(eq(settings.id, 'global'));
      return { changed, result };
    });
    if (changed) broadcastChange('settings');
    return result;
  }

  /** The list's spelling of `value`, or a 400 naming the unknown entry. */
  async function require(value: string): Promise<string> {
    const found = findDepartment(await list(), value);
    if (!found) throw new HttpError(400, `${kind.noun} «${cleanDepartmentName(value)}» در ${kind.listName} نیست؛ ابتدا آن را در تنظیمات اضافه کنید.`);
    return found;
  }

  /** Like require, but adds the name to the list when it is new (for Active Directory and setup). */
  async function ensure(value: string): Promise<string> {
    const name = cleanDepartmentName(value);
    const existing = findDepartment(await list(), name);
    if (existing) return existing;
    return changeList(async (current) => {
      const found = findDepartment(current, name);
      return found ? { list: current, result: found } : { list: [...current, name], result: name };
    });
  }

  /** Adds the given new names, e.g. those confirmed in an Excel import. Returns the list's spelling of each. */
  async function add(names: string[]): Promise<Map<string, string>> {
    return changeList(async (current) => {
      const out = new Map<string, string>();
      for (const value of names) {
        const name = cleanDepartmentName(value);
        if (!name) continue;
        let found = findDepartment(current, name);
        if (!found) {
          current.push(name);
          found = name;
        }
        out.set(value, found);
      }
      return { list: current, result: out };
    });
  }

  /**
   * Renames an entry everywhere it is used. When the new name is another entry of the list, the two
   * are merged: every record moves to that one and the old name leaves the list.
   */
  async function rename(fromValue: string, toValue: string) {
    const to = cleanDepartmentName(toValue);
    if (!to) throw new HttpError(400, `نام تازهٔ ${kind.noun} را بنویسید.`);
    const result = await changeList(async (current, tx) => {
      const from = findDepartment(current, fromValue);
      if (!from) throw new HttpError(404, `${kind.noun} «${cleanDepartmentName(fromValue)}» در فهرست نیست.`);
      const other = current.find((d) => d !== from && departmentKey(d) === departmentKey(to));
      const target = other ?? to;
      await kind.moveRecords(tx, from, target);
      const next = other ? current.filter((d) => d !== from) : current.map((d) => (d === from ? to : d));
      return { list: next, result: { from, to: target, merged: Boolean(other) } };
    });
    for (const resource of kind.renames) broadcastChange(resource);
    return result;
  }

  /**
   * Checks a new list from the settings page: names are tidied, spelling variants are kept once,
   * and an entry still in use cannot be dropped (rename or merge it instead).
   */
  async function checkList(values: string[]): Promise<string[]> {
    const next: string[] = [];
    for (const value of values) {
      const name = cleanDepartmentName(value);
      if (name && !findDepartment(next, name)) next.push(name);
    }
    if (next.length === 0 && !kind.mayBeEmpty) throw new HttpError(400, `${kind.listName} نمی‌تواند خالی باشد.`);
    const current = await list();
    const usage = await kind.usage();
    const inUse = current.filter((d) => !findDepartment(next, d) && usage.has(d));
    if (inUse.length > 0) {
      throw new HttpError(400, `${kind.noun} «${inUse[0]}» هنوز استفاده می‌شود ${kind.usedIn}؛ برای حذف، آن را در ${kind.noun} دیگری ادغام کنید.`);
    }
    // An existing entry keeps its stored spelling, so records that use it still match.
    return next.map((d) => findDepartment(current, d) ?? d);
  }

  /**
   * Makes the stored data agree with the list. Runs at every start-up:
   * - spelling variants inside the list are merged into the first one;
   * - a name used by records but missing from the list is added to it;
   * - records written with a variant spelling are moved to the list's spelling.
   * Nothing is deleted, so no record loses its value.
   */
  async function reconcile(): Promise<{ added: string[]; renamed: { from: string; to: string }[] }> {
    const report = { added: [] as string[], renamed: [] as { from: string; to: string }[] };
    await changeList(async (current, tx) => {
      const next: string[] = [];
      const moves: { from: string; to: string }[] = [];
      for (const d of current) {
        const name = cleanDepartmentName(d);
        if (!name) continue;
        const found = findDepartment(next, name);
        if (found) moves.push({ from: d, to: found });
        else {
          next.push(name);
          if (name !== d) moves.push({ from: d, to: name });
        }
      }

      // Sorted so that the spelling kept for a new name does not depend on row order.
      for (const value of [...(await kind.usedNames(tx))].sort((a, b) => a.localeCompare(b, 'fa'))) {
        let found = findDepartment(next, value);
        if (!found) {
          found = cleanDepartmentName(value) || 'نامشخص';
          if (!findDepartment(next, found)) {
            next.push(found);
            report.added.push(found);
          } else found = findDepartment(next, found)!;
        }
        if (found !== value) moves.push({ from: value, to: found });
      }

      const unique = [...new Map(moves.map((m) => [m.from, m])).values()];
      for (const m of unique) await kind.moveRecords(tx, m.from, m.to);
      report.renamed = unique;
      return { list: next, result: undefined };
    });
    return report;
  }

  /** require for a list, e.g. a news audience; repeated names are kept once. */
  async function requireMany(values: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const value of values) {
      const name = await require(value);
      if (!out.includes(name)) out.push(name);
    }
    return out;
  }

  return { list, require, ensure, add, rename, checkList, reconcile, requireMany, usage: kind.usage };
}

/** Replaces `from` by `to` in an audience column of news, documents, polls and events, keeping each name once. */
async function replaceInAudiences(tx: Tx, column: 'target_departments' | 'target_locations', from: string, to: string) {
  const col = sql.identifier(column);
  for (const table of ['news', 'documents', 'polls', 'calendar_events']) {
    await tx.execute(sql`
      update ${sql.identifier(table)}
      set ${col} = array(select distinct d from unnest(array_replace(${col}, ${from}, ${to})) as d)
      where ${from} = any(${col})
    `);
  }
}

/**
 * How many documents, polls and calendar events name each entry in an audience column. Every table
 * the start-up reconcile reads names from must be counted here, or an entry removed from the list
 * while still in use comes back at the next restart.
 */
async function audienceUsage(column: 'target_departments' | 'target_locations', entry: (name: string) => ListUsage) {
  for (const [table, key] of [['documents', 'documents'], ['polls', 'polls'], ['calendar_events', 'events']] as const) {
    const items = await db.execute<{ name: string; count: number }>(
      sql`select d as name, count(*)::int as count from ${sql.identifier(table)}, unnest(${sql.identifier(column)}) as d group by d`,
    );
    for (const r of items.rows) entry(r.name)[key] = r.count;
  }
}

const departments = managedList({
  column: 'departments',
  noun: 'واحد',
  listName: 'فهرست واحدهای سازمان',
  mayBeEmpty: false,
  usedIn: '(همکاران، اخبار، اسناد، راهنماها، نظرسنجی‌ها یا رویدادهای تقویم)',
  usedNames: async (tx) => {
    const used = await tx.execute<{ name: string }>(sql`
      select department as name from employees where department <> ''
      union select d from news, unnest(target_departments) as d
      union select d from documents, unnest(target_departments) as d
      union select d from polls, unnest(target_departments) as d
      union select d from calendar_events, unnest(target_departments) as d
      union select department from guides where department <> ''
    `);
    return used.rows.map((r) => r.name);
  },
  moveRecords: async (tx, from, to) => {
    if (from === to) return;
    await tx.execute(sql`update employees set department = ${to} where department = ${from}`);
    await replaceInAudiences(tx, 'target_departments', from, to);
    await tx.execute(sql`update guides set department = ${to} where department = ${from}`);
    // On a merge the page of the department that stays is kept.
    await tx.execute(sql`delete from department_pages where department = ${from} and exists (select 1 from department_pages where department = ${to})`);
    await tx.execute(sql`update department_pages set department = ${to} where department = ${from}`);
    await tx.execute(sql`
      update settings set systems = (
        select coalesce(jsonb_agg(case when s->>'department' = ${from} then jsonb_set(s, '{department}', to_jsonb(${to}::text)) else s end), '[]'::jsonb)
        from jsonb_array_elements(systems) as s
      )
    `);
  },
  usage: async () => {
    const usage = new Map<string, ListUsage>();
    const entry = (name: string) => {
      if (!usage.has(name)) usage.set(name, emptyUsage());
      return usage.get(name)!;
    };
    const people = await db.execute<{ name: string; total: number; active: number }>(
      sql`select department as name, count(*)::int as total, count(*) filter (where is_active)::int as active from employees group by department`,
    );
    for (const r of people.rows) Object.assign(entry(r.name), { employees: r.total, activeEmployees: r.active });
    const items = await db.execute<{ name: string; count: number }>(sql`select d as name, count(*)::int as count from news, unnest(target_departments) as d group by d`);
    for (const r of items.rows) entry(r.name).news = r.count;
    await audienceUsage('target_departments', entry);
    const guides = await db.execute<{ name: string; count: number }>(
      sql`select department as name, count(*)::int as count from guides where department <> '' group by department`,
    );
    for (const r of guides.rows) entry(r.name).guides = r.count;
    return usage;
  },
  renames: ['employees', 'news', 'documents', 'polls', 'calendar', 'guides', 'department_pages', 'settings'],
});

const locations = managedList({
  column: 'locations',
  noun: 'محل استقرار',
  listName: 'فهرست محل‌های استقرار',
  mayBeEmpty: true,
  usedIn: '(همکاران یا مخاطبان اخبار، اسناد، نظرسنجی‌ها و رویدادها)',
  usedNames: async (tx) => {
    const used = await tx.execute<{ name: string }>(sql`
      select location as name from employees where location <> ''
      union select d from news, unnest(target_locations) as d
      union select d from documents, unnest(target_locations) as d
      union select d from polls, unnest(target_locations) as d
      union select d from calendar_events, unnest(target_locations) as d
    `);
    return used.rows.map((r) => r.name);
  },
  moveRecords: async (tx, from, to) => {
    if (from === to) return;
    await tx.execute(sql`update employees set location = ${to} where location = ${from}`);
    await replaceInAudiences(tx, 'target_locations', from, to);
  },
  usage: async () => {
    const usage = new Map<string, ListUsage>();
    const entry = (name: string) => {
      if (!usage.has(name)) usage.set(name, emptyUsage());
      return usage.get(name)!;
    };
    const people = await db.execute<{ name: string; total: number; active: number }>(
      sql`select location as name, count(*)::int as total, count(*) filter (where is_active)::int as active from employees where location <> '' group by location`,
    );
    for (const r of people.rows) Object.assign(entry(r.name), { employees: r.total, activeEmployees: r.active });
    const items = await db.execute<{ name: string; count: number }>(sql`select d as name, count(*)::int as count from news, unnest(target_locations) as d group by d`);
    for (const r of items.rows) entry(r.name).news = r.count;
    await audienceUsage('target_locations', entry);
    return usage;
  },
  renames: ['employees', 'news', 'documents', 'polls', 'calendar'],
});

/** The managed list of departments, in the order set in the portal settings. */
export const departmentList = departments.list;
/** The list's spelling of a department, or a 400 naming the unknown department. */
export const requireDepartment = departments.require;
/** Like requireDepartment, but adds the department to the list when it is new (for Active Directory and setup). */
export const ensureDepartment = departments.ensure;
/** Adds the given new departments, e.g. those confirmed in an Excel import. */
export const addDepartments = departments.add;
/** How many colleagues, news items and polls use each department name (including names not in the list). */
export const departmentUsage = departments.usage;
export const renameDepartment = departments.rename;
export const checkDepartmentList = departments.checkList;
export const reconcileDepartments = departments.reconcile;
export const requireDepartments = departments.requireMany;

/** The managed list of locations (branches, warehouse, floors). A colleague's location may also be empty. */
export const locationList = locations.list;
export const requireLocations = locations.requireMany;
export const locationUsage = locations.usage;
export const renameLocation = locations.rename;
export const checkLocationList = locations.checkList;
export const reconcileLocations = locations.reconcile;

/** A colleague's location as the list spells it; empty stays empty ("not set"). */
export async function requireLocation(value: string): Promise<string> {
  return value.trim() ? locations.require(value) : '';
}
