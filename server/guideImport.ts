import { z } from 'zod';
import { cleanDepartmentName, departmentKey, findDepartment } from '../shared/departments.js';
import { jalaliToDate, toJalali, toPersianDigits } from '../shared/jalali.js';
import { db } from './db/index.js';
import { employees, guides } from './db/schema.js';
import { departmentList } from './departments.js';
import { richTextToPlain, sanitizeRichText } from './richText.js';
import { fullName } from './serializers.js';
import { headerLookup, sheetRecords } from './spreadsheet.js';
import { jalaliDateValue, requiredText, textValue } from './validation.js';

// Guides written in Excel, one per row, e.g. the questions and answers taken from a regulation.
// The file is checked into a preview first; only the rows without an error are saved.

export const MAX_GUIDE_IMPORT_ROWS = 300;

// Header names accepted for each field, compared after normalizeHeader().
const COLUMNS = {
  title: ['پرسش', 'عنوان', 'پرسش یا عنوان', 'سوال', 'سؤال', 'title', 'question'],
  category: ['دسته', 'دسته‌بندی', 'دسته بندی', 'category'],
  summary: ['پاسخ کوتاه', 'خلاصه', 'summary', 'short answer'],
  content: ['متن کامل', 'متن', 'پاسخ کامل', 'پاسخ', 'content', 'answer'],
  department: ['واحد', 'واحد مربوط', 'department'],
  owner: ['مسئول', 'مسئول راهنما', 'نام کاربری مسئول', 'owner'],
  reviewDate: ['تاریخ بازبینی', 'بازبینی', 'review date'],
} as const;

type Field = keyof typeof COLUMNS;
const REQUIRED: Field[] = ['title', 'category', 'content'];

export const GUIDE_FIELD_LABELS: Record<Field, string> = {
  title: 'پرسش',
  category: 'دسته',
  summary: 'پاسخ کوتاه',
  content: 'متن کامل',
  department: 'واحد',
  owner: 'مسئول',
  reviewDate: 'تاریخ بازبینی',
};

const HEADER_LOOKUP = headerLookup<Field>(COLUMNS);

/** The file's rows as records, and the required columns its header row does not have. */
export function guideRowsToRecords(rows: string[][]) {
  const { fields, records } = sheetRecords(rows, HEADER_LOOKUP);
  return { records, missing: REQUIRED.filter((f) => !fields.includes(f)).map((f) => GUIDE_FIELD_LABELS[f]) };
}

const rowSchema = z.object({
  title: requiredText(200),
  category: requiredText(100),
  summary: textValue(500).default(''),
  content: requiredText(20000),
  department: textValue(100).default(''),
  owner: textValue(200).default(''),
  reviewDate: jalaliDateValue.default(''),
});

export const guideImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_GUIDE_IMPORT_ROWS),
  // Rows whose question the portal already has: true brings those guides up to date, false leaves them alone.
  updateExisting: z.boolean().default(false),
});

const BULLET = /^[-–•*]\s+/;
const NUMBERED = /^[0-9۰-۹]{1,2}[.)]\s+/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_RULE = /^\|[\s:|-]+\|$/;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (text: string) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/**
 * A cell's plain text as the HTML the editor would store: each line a paragraph; lines that start
 * with «-» or «•» a bullet list; lines that start with «1.» or «۱.» a numbered list; lines written
 * as «| a | b |» a table whose first row is the heading; `**bold**`.
 */
export function guideTextToHtml(text: string): string {
  // Excel stores a line break typed on Windows as `_x000D_` followed by a new line.
  const lines = text.replace(/_x000D_/g, '').split(/\r?\n/).map((l) => l.trim());
  const out: string[] = [];
  let i = 0;
  const run = (pattern: RegExp) => {
    const items: string[] = [];
    while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++]);
    return items;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line) i++;
    else if (BULLET.test(line)) out.push(`<ul>${run(BULLET).map((l) => `<li>${inline(l.replace(BULLET, ''))}</li>`).join('')}</ul>`);
    else if (NUMBERED.test(line)) out.push(`<ol>${run(NUMBERED).map((l) => `<li>${inline(l.replace(NUMBERED, ''))}</li>`).join('')}</ol>`);
    else if (TABLE_ROW.test(line)) {
      const rows = run(TABLE_ROW)
        .filter((l) => !TABLE_RULE.test(l))
        .map((l) => l.slice(1, -1).split('|').map((c) => inline(c.trim())));
      const cells = (row: string[], tag: 'th' | 'td') => `<tr>${row.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
      out.push(`<table><tbody>${rows.map((r, n) => cells(r, n === 0 ? 'th' : 'td')).join('')}</tbody></table>`);
    } else {
      out.push(`<p>${inline(line)}</p>`);
      i++;
    }
  }
  return sanitizeRichText(out.join(''));
}

/** Two questions with the same key are the same guide: spelling variants and the closing «؟» do not make a new one. */
export const guideTitleKey = (title: string) => departmentKey(title.replace(/[؟?!.،:\s]+$/u, ''));

type Existing = typeof guides.$inferSelect;
type Person = typeof employees.$inferSelect;

/** What a row saves: a new guide's columns, or the columns of an existing guide that change. */
export interface GuideValues {
  title: string;
  category: string;
  summary: string;
  content: string;
  department: string;
  ownerId: string | null;
  reviewAt: Date | null;
}

export interface CheckedGuideRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
  /** 'unchanged' rows match a guide that already says the same. */
  action?: 'create' | 'update' | 'unchanged';
  /** For the preview: what an update changes, and who the owner cell was read as. */
  changes?: string[];
  owner?: string;
  value?: GuideValues;
  update?: { id: string; set: Partial<GuideValues> };
}

function issues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path[0] as Field | undefined;
    return field && GUIDE_FIELD_LABELS[field] ? `${GUIDE_FIELD_LABELS[field]}: ${issue.message}` : issue.message;
  });
}

const personKey = (value: string) => departmentKey(value);

/** The colleague an owner cell names: by username (also `ROYA\ali` or `ali@roya.local`), else by full name. */
function findOwner(value: string, people: Person[]): { person?: Person; error?: string } {
  const login = value.replace(/^.*\\/, '').replace(/@.*$/, '').trim().toLowerCase();
  const byLogin = people.find((p) => p.username && p.username.toLowerCase() === login);
  const named = byLogin ? [byLogin] : people.filter((p) => personKey(fullName(p)) === personKey(value));
  // Someone who can keep a guide current is preferred to a namesake who cannot.
  const able = named.filter((p) => p.isActive && p.hasAccount);
  if (named.length === 0) return { error: `مسئول: «${value}» در فهرست همکاران پیدا نشد؛ نام کامل یا نام کاربری او را بنویسید.` };
  if (able.length === 0) return { error: 'مسئول: مسئول راهنما باید همکار فعال با حساب پرتال باشد.' };
  if (able.length > 1) return { error: `مسئول: چند همکار با نام «${value}» هست؛ نام کاربری مسئول را بنویسید.` };
  return { person: able[0] };
}

/**
 * Validates the rows against the guides, departments and colleagues the portal has. A row whose
 * question matches a guide updates it: only the cells the row fills in change.
 */
export async function checkGuideRows(records: { row: number; data: Record<string, unknown> }[], now = new Date()): Promise<CheckedGuideRow[]> {
  const existing = await db.select().from(guides);
  const people = await db.select().from(employees);
  const departments = await departmentList();
  const byTitle = new Map<string, Existing>(existing.map((g) => [guideTitleKey(g.title), g]));
  // One spelling per category: the portal's own, else the first one in the file.
  const categories = new Map<string, string>(existing.map((g) => [departmentKey(g.category), g.category]));
  const seen = new Map<string, number>();

  return records.map(({ row, data }): CheckedGuideRow => {
    const text = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '').trim()])) as Record<string, string>;
    const target = byTitle.get(guideTitleKey(text.title ?? ''));
    // An empty cell keeps what the guide already says, so the row is checked with those values filled in.
    const parsed = rowSchema.safeParse(target ? { title: target.title, category: target.category, content: 'x', ...withoutEmpty(text) } : text);
    if (!parsed.success) return { row, data: text, errors: issues(parsed.error) };
    const cells = parsed.data;
    const errors: string[] = [];

    const key = guideTitleKey(cells.title);
    const first = seen.get(key);
    if (first !== undefined) errors.push(`پرسش: همین پرسش در ردیف ${toPersianDigits(first)} این فایل هم آمده است.`);
    else seen.set(key, row);

    const categoryKey = departmentKey(cells.category);
    if (!categories.has(categoryKey)) categories.set(categoryKey, cleanDepartmentName(cells.category));
    const category = categories.get(categoryKey)!;

    let content: string | undefined;
    if (text.content) {
      content = guideTextToHtml(text.content);
      if (!richTextToPlain(content)) errors.push('متن کامل: این فیلد الزامی است');
    }

    let department: string | undefined;
    if (text.department) {
      department = findDepartment(departments, text.department);
      if (!department) errors.push(`واحد: «${text.department}» در فهرست واحدهای پرتال نیست.`);
    }

    let owner: Person | undefined;
    if (text.owner) {
      const found = findOwner(text.owner, people);
      if (found.error) errors.push(found.error);
      owner = found.person;
    }

    let reviewAt: Date | null | undefined;
    if (cells.reviewDate) {
      reviewAt = jalaliToDate(cells.reviewDate, '08:00');
      if (!reviewAt) errors.push('تاریخ بازبینی: تاریخ نامعتبر است.');
      else if (reviewAt.getTime() !== target?.reviewAt?.getTime() && reviewAt <= now) errors.push('تاریخ بازبینی: باید در آینده باشد.');
    }

    const preview = { row, data: text, owner: owner ? fullName(owner) : undefined };
    if (errors.length > 0) return { ...preview, errors };

    if (!target) {
      return {
        ...preview,
        errors,
        action: 'create',
        value: { title: cells.title, category, summary: cells.summary, content: content!, department: department ?? '', ownerId: owner?.id ?? null, reviewAt: reviewAt ?? null },
      };
    }

    const set: Partial<GuideValues> = {};
    const changes: string[] = [];
    const change = <K extends keyof GuideValues>(field: Field, column: K, value: GuideValues[K] | undefined, same: boolean, shown?: string) => {
      if (value === undefined || same) return;
      set[column] = value;
      changes.push(shown ? `${GUIDE_FIELD_LABELS[field]}: ${shown}` : GUIDE_FIELD_LABELS[field]);
    };
    change('category', 'category', text.category ? category : undefined, category === target.category, category);
    change('summary', 'summary', text.summary ? cells.summary : undefined, cells.summary === target.summary);
    change('content', 'content', content, content === target.content);
    change('department', 'department', department, department === target.department, department);
    change('owner', 'ownerId', owner?.id, owner?.id === target.ownerId, owner && fullName(owner));
    change('reviewDate', 'reviewAt', reviewAt ?? undefined, reviewAt?.getTime() === target.reviewAt?.getTime(), reviewAt ? toJalali(reviewAt) : undefined);
    if (changes.length === 0) return { ...preview, errors, action: 'unchanged' };
    return { ...preview, errors, action: 'update', changes, update: { id: target.id, set } };
  });
}

const withoutEmpty = (record: Record<string, string>) => Object.fromEntries(Object.entries(record).filter(([, v]) => v !== ''));
