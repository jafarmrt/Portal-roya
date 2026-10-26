import { z } from 'zod';
import { toLatinDigits } from '../shared/jalali.js';
import { db } from './db/index.js';
import { ADMIN_ROLE_ID, DEFAULT_ROLE_ID } from '../shared/permissions.js';
import { employees, roles } from './db/schema.js';
import { jalaliDateValue, optionalJalaliDate, optionalText, requiredText, textValue, username } from './validation.js';

export const MAX_IMPORT_ROWS = 300;

// Header names accepted for each field, compared after normalizeHeader().
const COLUMNS = {
  // The portal's own id, filled in by the staff export; rows that carry it update that person.
  id: ['شناسه', 'شناسه پرتال', 'id'],
  firstName: ['نام', 'firstname', 'first name', 'name'],
  lastName: ['نام خانوادگی', 'نام فامیل', 'فامیل', 'lastname', 'last name', 'surname'],
  username: ['نام کاربری', 'یوزرنیم', 'username', 'user name', 'login'],
  position: ['سمت', 'عنوان شغلی', 'position', 'title', 'job title'],
  department: ['واحد', 'دپارتمان', 'بخش', 'department'],
  role: ['نقش', 'دسترسی', 'role'],
  email: ['ایمیل', 'پست الکترونیک', 'email', 'e-mail'],
  mobile: ['موبایل', 'تلفن همراه', 'شماره موبایل', 'mobile', 'phone'],
  extension: ['داخلی', 'شماره داخلی', 'تلفن داخلی', 'extension', 'ext'],
  birthDate: ['تاریخ تولد', 'birthdate', 'birth date'],
  hireDate: ['تاریخ استخدام', 'تاریخ شروع همکاری', 'hiredate', 'hire date'],
} as const;

type Field = keyof typeof COLUMNS;
// A row without a username adds someone to the phone book only, without a portal account.
const REQUIRED: Field[] = ['firstName', 'lastName', 'position', 'department'];

export const FIELD_LABELS: Record<Field, string> = {
  id: 'شناسه',
  firstName: 'نام',
  lastName: 'نام خانوادگی',
  username: 'نام کاربری',
  position: 'سمت',
  department: 'واحد',
  role: 'نقش',
  email: 'ایمیل',
  mobile: 'موبایل',
  extension: 'داخلی',
  birthDate: 'تاریخ تولد',
  hireDate: 'تاریخ استخدام',
};

function normalizeHeader(value: string) {
  return value
    .replace(/[\u200c\u200e\u200f*:]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

const HEADER_LOOKUP = new Map<string, Field>(
  (Object.entries(COLUMNS) as [Field, readonly string[]][]).flatMap(([field, names]) => names.map((n) => [normalizeHeader(n), field])),
);

const rowSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  username: username.optional(),
  position: requiredText(100),
  department: requiredText(100),
  role: z.string().min(1).default(DEFAULT_ROLE_ID),
  email: optionalText(200),
  mobile: optionalText(30),
  extension: optionalText(20),
  birthDate: optionalJalaliDate,
  hireDate: optionalJalaliDate,
});
export type ImportRow = z.infer<typeof rowSchema>;

export const importRowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS),
  // Also put the imported colleagues on the dashboard's "new colleagues" wall.
  introduce: z.boolean().default(false),
});

// Columns an update may change; an empty cell keeps the current value.
const updateSchema = z
  .object({
    firstName: requiredText(100),
    lastName: requiredText(100),
    position: requiredText(100),
    department: requiredText(100),
    email: textValue(200),
    mobile: textValue(30),
    extension: textValue(20),
    birthDate: jalaliDateValue,
    hireDate: jalaliDateValue,
  })
  .partial();
type UpdateField = keyof z.infer<typeof updateSchema>;
const UPDATE_FIELDS = Object.keys(updateSchema.shape) as UpdateField[];

/** Changes to an existing person. `username` gives a phone-book-only person a portal account. */
export interface ImportUpdate {
  id: string;
  set: z.infer<typeof updateSchema> & { role?: string };
  username?: string;
}

export interface CheckedRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
  /** Shown in the preview but do not stop the row, e.g. a likely duplicate of someone already listed. */
  warnings: string[];
  /** 'unchanged' rows match someone whose details already equal the file. */
  action?: 'create' | 'update' | 'unchanged';
  /** Who an update row matched, and what it changes, for the preview. */
  target?: string;
  changes?: string[];
  value?: ImportRow;
  update?: ImportUpdate;
}

// Common spellings of the built-in roles, besides their ids and current names.
const ROLE_ALIASES: Record<string, string> = {
  ادمین: ADMIN_ROLE_ID,
  'ادمین برنامه': ADMIN_ROLE_ID,
  مدیر: 'manager',
  کارشناس: DEFAULT_ROLE_ID,
  کارمند: DEFAULT_ROLE_ID,
};

/** Maps a role cell (id or Persian name) to role ids; an empty cell means the default role. */
async function roleResolver() {
  const rows = await db.select({ id: roles.id, name: roles.name }).from(roles);
  const lookup = new Map<string, string>(Object.entries(ROLE_ALIASES).map(([k, v]) => [normalizeHeader(k), v]));
  for (const r of rows) {
    lookup.set(normalizeHeader(r.id), r.id);
    lookup.set(normalizeHeader(r.name), r.id);
  }
  return (value: string) => (value.trim() === '' ? DEFAULT_ROLE_ID : lookup.get(normalizeHeader(value)));
}

/** Turns spreadsheet rows (header first) into field records. */
export function rowsToRecords(rows: string[][]): { records: { row: number; data: Record<string, string> }[]; missing: string[] } {
  const headerIndex = rows.findIndex((r) => r.some((c) => c !== ''));
  if (headerIndex < 0) return { records: [], missing: REQUIRED.map((f) => FIELD_LABELS[f]) };
  const fields = rows[headerIndex].map((h) => HEADER_LOOKUP.get(normalizeHeader(h)));
  // A file that identifies people (by id or username) may hold only the columns to change, e.g. username and mobile.
  const identifies = fields.includes('id') || fields.includes('username');
  const missing = identifies ? [] : REQUIRED.filter((f) => !fields.includes(f)).map((f) => FIELD_LABELS[f]);

  const records = rows
    .map((cells, i) => ({ row: i + 1, cells }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((c) => c !== ''))
    .map(({ row, cells }) => {
      const data: Record<string, string> = {};
      fields.forEach((field, i) => {
        if (field && cells[i]) data[field] = cells[i];
      });
      return { row, data };
    });
  return { records, missing };
}

function firstIssue(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path[0] as Field | undefined;
    return field && FIELD_LABELS[field] ? `${FIELD_LABELS[field]}: ${issue.message}` : issue.message;
  });
}

type Existing = typeof employees.$inferSelect;

const cleanLogin = (value: string) => value.replace(/^.*\\/, '').replace(/@.*$/, '');
// Excel drops the leading zero when a mobile number is typed as a number.
const cleanMobile = (value: string) => toLatinDigits(value).replace(/^9\d{9}$/, '0$&');

/** Checks a row that matched an existing person and works out what it would change. */
function checkUpdate(
  row: number,
  text: Record<string, string>,
  target: Existing,
  resolveRole: (value: string) => string | undefined,
  roleName: (id: string) => string,
  allowAdmin: boolean,
): CheckedRow {
  const base = { row, data: text, warnings: [] as string[], target: `${target.firstName} ${target.lastName}`.trim() };
  if (target.role === ADMIN_ROLE_ID && !allowAdmin) return { ...base, errors: ['فقط ادمین برنامه می‌تواند مشخصات ادمین‌ها را تغییر دهد'] };

  const cells: Record<string, string> = {};
  for (const f of UPDATE_FIELDS) if (text[f]) cells[f] = f === 'mobile' ? cleanMobile(text[f]) : f === 'extension' ? toLatinDigits(text[f]) : text[f];
  const parsed = updateSchema.safeParse(cells);
  if (!parsed.success) return { ...base, errors: firstIssue(parsed.error) };

  const errors: string[] = [];
  const set: ImportUpdate['set'] = {};
  const changes: string[] = [];
  for (const f of UPDATE_FIELDS) {
    const value = parsed.data[f];
    if (value === undefined || value === target[f]) continue;
    set[f] = value;
    changes.push(`${FIELD_LABELS[f]}: ${target[f] || '—'} ← ${value}`);
  }

  let login: string | undefined;
  const loginCell = cleanLogin(text.username ?? '').toLowerCase();
  if (loginCell && loginCell !== target.username) {
    if (target.hasAccount) errors.push('نام کاربری حساب موجود از اکسل عوض نمی‌شود؛ ستون نام کاربری این ردیف را مثل قبل بگذارید.');
    else if (!username.safeParse(loginCell).success) errors.push(`نام کاربری: «${loginCell}» معتبر نیست (حروف انگلیسی، عدد و . _ -)`);
    else {
      login = loginCell;
      changes.push(`دسترسی پورتال با نام کاربری ${loginCell} (رمز موقت ساخته می‌شود)`);
    }
  } else if (loginCell && !target.hasAccount) {
    // The kept username of someone whose access was removed: giving it again restores access.
    login = loginCell;
    changes.push(`دسترسی دوباره به پورتال با نام کاربری ${loginCell} (رمز موقت ساخته می‌شود)`);
  }

  if (text.role) {
    const role = resolveRole(text.role);
    if (!role) errors.push(`نقش: «${text.role}» در فهرست نقش‌های پرتال نیست`);
    else if (!target.hasAccount && !login) base.warnings.push('بدون حساب پورتال نقش معنا ندارد؛ ستون نقش نادیده گرفته شد.');
    else if (role !== target.role) {
      if (target.role === ADMIN_ROLE_ID) errors.push('نقش ادمین را از ویرایش پروفایل تغییر دهید، نه از اکسل.');
      else if (role === ADMIN_ROLE_ID && !allowAdmin) errors.push('نقش: فقط ادمین برنامه می‌تواند نقش ادمین بدهد');
      else {
        set.role = role;
        changes.push(`نقش: ${roleName(target.role)} ← ${roleName(role)}`);
      }
    }
  }

  if (errors.length > 0) return { ...base, errors };
  if (changes.length === 0) return { ...base, errors: [], action: 'unchanged', changes };
  return { ...base, errors: [], action: 'update', changes, update: { id: target.id, set, username: login } };
}

/**
 * Validates import rows. A row with the portal id (from the staff export) or with the username of an
 * existing account updates that person; any other row adds someone new. Updates only change the cells
 * that are filled in, never rename an existing account, and only give an account to someone who has none.
 */
export async function checkRows(
  records: { row: number; data: Record<string, unknown> }[],
  { allowAdmin }: { allowAdmin: boolean },
): Promise<CheckedRow[]> {
  const resolveRole = await roleResolver();
  const roleNames = new Map((await db.select({ id: roles.id, name: roles.name }).from(roles)).map((r) => [r.id, r.name]));
  const roleName = (id: string) => roleNames.get(id) ?? id;
  const everyone = await db.select().from(employees);
  const byId = new Map(everyone.map((e) => [e.id, e]));
  const byUsername = new Map(everyone.filter((e) => e.username).map((e) => [e.username!, e]));

  const checked: CheckedRow[] = records.map(({ row, data }) => {
    const text: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) if (k in COLUMNS && v != null) text[k] = String(v).trim();
    const login = cleanLogin(text.username ?? '');

    const target = text.id ? byId.get(text.id) : byUsername.get(login.toLowerCase());
    if (text.id && !target) return { row, data: text, errors: [`شناسه «${text.id}» در پرتال پیدا نشد؛ برای افراد جدید ستون شناسه را خالی بگذارید.`], warnings: [] };
    if (target) return checkUpdate(row, text, target, resolveRole, roleName, allowAdmin);

    // Without a username there is no account, so the role cell does not apply.
    const role = login ? resolveRole(text.role ?? '') : DEFAULT_ROLE_ID;
    if (!role) return { row, data: text, errors: [`نقش: «${text.role}» در فهرست نقش‌های پرتال نیست`], warnings: [] };
    if (role === ADMIN_ROLE_ID && !allowAdmin) return { row, data: text, errors: ['نقش: فقط ادمین برنامه می‌تواند نقش ادمین بدهد'], warnings: [] };
    const candidate = {
      // Missing required cells become '' so the error reads "required" rather than a type error.
      ...Object.fromEntries(REQUIRED.map((f) => [f, ''])),
      ...text,
      username: login || undefined,
      role,
      mobile: cleanMobile(text.mobile ?? ''),
      extension: toLatinDigits(text.extension ?? ''),
    };
    const parsed = rowSchema.safeParse(candidate);
    const warnings = !login && text.role ? ['بدون نام کاربری حساب پورتال ساخته نمی‌شود؛ ستون نقش نادیده گرفته شد.'] : [];
    return parsed.success
      ? { row, data: text, errors: [], warnings, action: 'create', value: parsed.data }
      : { row, data: text, errors: firstIssue(parsed.error), warnings };
  });

  // Each person and each new username may appear only once in a file.
  const seenTarget = new Map<string, number>();
  const seenLogin = new Map<string, number>();
  for (const r of checked) {
    if (r.update) {
      const earlier = seenTarget.get(r.update.id);
      if (earlier) r.errors.push(`همین همکار در ردیف ${earlier} هم آمده است.`);
      else seenTarget.set(r.update.id, r.row);
    }
    const login = r.value?.username ?? r.update?.username;
    if (!login) continue;
    const earlier = seenLogin.get(login);
    if (earlier) r.errors.push(`نام کاربری «${login}» در ردیف ${earlier} هم آمده است.`);
    else seenLogin.set(login, r.row);
    // A new account may not take a username another person already has.
    const owner = byUsername.get(login);
    if (owner && owner.id !== r.update?.id) r.errors.push(`حسابی با نام کاربری «${login}» از قبل وجود دارد.`);
  }

  // People without a username cannot be matched by login, so a repeated name is flagged instead.
  const nameKey = (first: string, last: string) => normalizeHeader(`${first} ${last}`);
  const known = new Set(everyone.map((e) => nameKey(e.firstName, e.lastName)));
  const inFile = new Map<string, number>();
  for (const r of checked.filter((c) => c.value && !c.value.username)) {
    const key = nameKey(r.value!.firstName, r.value!.lastName);
    if (known.has(key)) r.warnings.push('همکاری با همین نام از قبل در دفتر تلفن هست؛ اگر همان شخص است این ردیف را حذف کنید.');
    const earlier = inFile.get(key);
    if (earlier) r.warnings.push(`همین نام در ردیف ${earlier} هم آمده است.`);
    else inFile.set(key, r.row);
  }

  for (const r of checked) {
    if (r.errors.length > 0) {
      delete r.value;
      delete r.update;
      delete r.action;
    }
  }
  return checked;
}
