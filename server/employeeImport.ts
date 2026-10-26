import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { toLatinDigits } from '../shared/jalali.js';
import { db } from './db/index.js';
import { ADMIN_ROLE_ID, DEFAULT_ROLE_ID } from '../shared/permissions.js';
import { employees, roles } from './db/schema.js';
import { optionalJalaliDate, optionalText, requiredText, username } from './validation.js';

export const MAX_IMPORT_ROWS = 300;

// Header names accepted for each field, compared after normalizeHeader().
const COLUMNS = {
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
const REQUIRED: Field[] = ['firstName', 'lastName', 'username', 'position', 'department'];

export const FIELD_LABELS: Record<Field, string> = {
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
  username,
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

export const importRowsSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS) });

export interface CheckedRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
  value?: ImportRow;
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
  const missing = REQUIRED.filter((f) => !fields.includes(f)).map((f) => FIELD_LABELS[f]);

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

/**
 * Validates import rows and checks usernames against the database and each other.
 * Existing usernames are never overwritten, so an account (local or linked to Active Directory) stays as it is.
 */
export async function checkRows(
  records: { row: number; data: Record<string, unknown> }[],
  { allowAdmin }: { allowAdmin: boolean },
): Promise<CheckedRow[]> {
  const resolveRole = await roleResolver();
  const checked: CheckedRow[] = records.map(({ row, data }) => {
    const text: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) if (k in COLUMNS && v != null) text[k] = String(v).trim();
    const role = resolveRole(text.role ?? '');
    if (!role) return { row, data: text, errors: [`نقش: «${text.role}» در فهرست نقش‌های پرتال نیست`] };
    if (role === ADMIN_ROLE_ID && !allowAdmin) return { row, data: text, errors: ['نقش: فقط ادمین برنامه می‌تواند نقش ادمین بدهد'] };
    const candidate = {
      // Missing required cells become '' so the error reads "required" rather than a type error.
      ...Object.fromEntries(REQUIRED.map((f) => [f, ''])),
      ...text,
      username: (text.username ?? '').replace(/^.*\\/, '').replace(/@.*$/, ''),
      role,
      // Excel drops the leading zero when a mobile number is typed as a number.
      mobile: toLatinDigits(text.mobile ?? '').replace(/^9\d{9}$/, '0$&'),
      extension: toLatinDigits(text.extension ?? ''),
    };
    const parsed = rowSchema.safeParse(candidate);
    return parsed.success ? { row, data: text, errors: [], value: parsed.data } : { row, data: text, errors: firstIssue(parsed.error) };
  });

  const seen = new Map<string, number>();
  for (const r of checked) {
    if (!r.value) continue;
    const earlier = seen.get(r.value.username);
    if (earlier) r.errors.push(`نام کاربری «${r.value.username}» در ردیف ${earlier} هم آمده است.`);
    else seen.set(r.value.username, r.row);
  }

  const names = [...seen.keys()];
  if (names.length > 0) {
    const existing = await db.select({ username: employees.username }).from(employees).where(inArray(employees.username, names));
    const taken = new Set(existing.map((e) => e.username));
    for (const r of checked) {
      if (r.value && taken.has(r.value.username)) r.errors.push(`حسابی با نام کاربری «${r.value.username}» از قبل وجود دارد.`);
    }
  }
  for (const r of checked) if (r.errors.length > 0) delete r.value;
  return checked;
}
