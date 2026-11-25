import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toJalali } from '../shared/jalali';
import { db, pool } from '../server/db/index';
import { auditLog, guides } from '../server/db/schema';
import { guideTextToHtml } from '../server/guideImport';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';
import { buildXlsx } from './xlsxFile';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const HEADER = ['پرسش', 'دسته', 'پاسخ کوتاه', 'متن کامل', 'واحد', 'مسئول', 'تاریخ بازبینی'];
const NEXT_YEAR = toJalali(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

interface PreviewRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
  action?: string;
  changes?: string[];
  owner?: string;
}

const preview = (agent: Agent, rows: string[][], header = HEADER) =>
  agent.post('/api/guides/import/preview').attach('file', buildXlsx([header, ...rows]), 'guides.xlsx');
const valid = (rows: PreviewRow[]) => rows.filter((r) => r.errors.length === 0).map((r) => r.data);

describe('the text of a cell as a guide', () => {
  it('makes paragraphs, lists, a table and bold text, and never keeps HTML from the file', () => {
    expect(guideTextToHtml('درخواست را ثبت کنید.\n\nبعد منتظر تأیید بمانید.')).toBe('<p>درخواست را ثبت کنید.</p><p>بعد منتظر تأیید بمانید.</p>');
    expect(guideTextToHtml('برای:\n- ازدواج دائم\n• فوت **همسر**')).toBe('<p>برای:</p><ul><li>ازدواج دائم</li><li>فوت <strong>همسر</strong></li></ul>');
    expect(guideTextToHtml('۱. نامه بنویسید.\n2) تأیید بگیرید.\r\nتمام.')).toBe('<ol><li>نامه بنویسید.</li><li>تأیید بگیرید.</li></ol><p>تمام.</p>');
    expect(guideTextToHtml('| نوع | تأیید |\n|---|---|\n| ساعتی | سرپرست واحد |')).toBe(
      '<table><tbody><tr><th>نوع</th><th>تأیید</th></tr><tr><td>ساعتی</td><td>سرپرست واحد</td></tr></tbody></table>',
    );
    // A number that starts a sentence is not a list, and Excel's Windows line breaks leave no trace.
    expect(guideTextToHtml('۳۰ روز در سال_x000D_\nبا احتساب جمعه‌ها')).toBe('<p>۳۰ روز در سال</p><p>با احتساب جمعه‌ها</p>');
    expect(guideTextToHtml('<script>alert(1)</script> 2 < 3')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; 2 &lt; 3</p>');
  });
});

describe('bulk guide import', () => {
  let admin: Agent;
  let owner: Person;
  let reader: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    owner = await createEmployee(admin, { username: 'hr.owner', department: 'طراحی' });
    reader = await createEmployee(admin, { username: 'sales.reader', department: 'فروش' });
  });
  afterAll(() => pool.end());

  it('is for document managers and needs the question, category and text columns', async () => {
    await reader.agent.post('/api/guides/import/preview').attach('file', buildXlsx([HEADER, ['پ', 'د', '', 'م']]), 'guides.xlsx').expect(403);
    await reader.agent.post('/api/guides/import').send({ rows: [{ title: 'پ', category: 'د', content: 'م' }] }).expect(403);
    await request(app).post('/api/guides/import').send({ rows: [{ title: 'پ', category: 'د', content: 'م' }] }).expect(401);

    const missing = await preview(admin, [['چطور مرخصی بگیرم؟', 'مرخصی']], ['پرسش', 'دسته']).expect(400);
    expect(missing.body.error).toContain('متن کامل');
    await preview(admin, []).expect(400);
    await admin.post('/api/guides/import/preview').expect(400);
  });

  it('shows what each row would do, with the reason a row cannot be saved', async () => {
    const res = await preview(admin, [
      ['چطور مرخصی بگیرم؟', 'مرخصی', 'درخواست را در سامانه ثبت کنید.', '۱. درخواست را ثبت کنید.\n۲. تأیید بگیرید.', 'طراحی', 'hr.owner', NEXT_YEAR],
      ['ساعت کاری چقدر است؟', 'حضور و غیاب', '', '۴۴ ساعت در هفته.', 'واحد ناشناخته', '', ''],
      ['کار در شب چه مزدی دارد؟', 'حضور و غیاب', '', '۳۵٪ بیشتر.', '', 'کسی که نیست', ''],
      ['چطور مرخصی بگیرم', 'مرخصی', '', 'تکراری.', '', '', ''],
      ['', 'مرخصی', '', 'بدون پرسش.', '', '', ''],
      ['فوق‌العادهٔ نوبت‌کاری چقدر است؟', 'حضور و غیاب', '', '۱۰٪ تا ۲۲٫۵٪.', '', 'همکار hr.owner', '1400/01/01'],
      ['اضافه‌کاری چطور حساب می‌شود؟', 'اضافه‌کاری', 'ک'.repeat(501), '۴۰٪ بیشتر.', '', '', ''],
      ['مرخصی بدون حقوق چطور است؟', 'مرخصي', '', 'با تصویب مدیرعامل.', 'فروش', 'ROYA\\HR.Owner', ''],
    ]).expect(200);
    const rows = res.body.rows as PreviewRow[];
    expect(rows.map((r) => r.row)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows[0]).toMatchObject({ errors: [], action: 'create', owner: 'همکار hr.owner' });
    expect(rows[1].errors).toEqual(['واحد: «واحد ناشناخته» در فهرست واحدهای پرتال نیست.']);
    expect(rows[2].errors[0]).toContain('«کسی که نیست» در فهرست همکاران پیدا نشد');
    expect(rows[3].errors).toEqual(['پرسش: همین پرسش در ردیف ۲ این فایل هم آمده است.']);
    expect(rows[4].errors).toEqual(['پرسش: این فیلد الزامی است']);
    expect(rows[5].errors).toEqual(['تاریخ بازبینی: باید در آینده باشد.']);
    expect(rows[6].errors).toEqual(['پاسخ کوتاه: حداکثر ۵۰۰ حرف']);
    expect(rows[7]).toMatchObject({ errors: [], action: 'create', owner: 'همکار hr.owner' });
    // Nothing is saved by looking.
    expect(await db.select().from(guides)).toHaveLength(0);
  });

  it('saves the rows without an error, once, and updates a guide only when asked to', async () => {
    const file = [
      ['چطور مرخصی بگیرم؟', 'مرخصی', 'درخواست را در سامانه ثبت کنید.', '۱. درخواست را ثبت کنید.\n۲. تأیید بگیرید.', 'طراحی', 'hr.owner', NEXT_YEAR],
      ['مرخصی بدون حقوق چطور است؟', 'مرخصي', '', 'با تصویب مدیرعامل.', '', '', ''],
      ['ساعت کاری چقدر است؟', 'حضور و غیاب', '', '۴۴ ساعت در هفته.', 'واحد ناشناخته', '', ''],
    ];
    const first = (await preview(admin, file).expect(200)).body.rows as PreviewRow[];
    const saved = await admin.post('/api/guides/import').send({ rows: valid(first) }).expect(201);
    expect(saved.body).toMatchObject({ created: 2, updated: 0, unchanged: 0, leftAlone: 0, skipped: [] });

    const list = (await reader.agent.get('/api/guides').expect(200)).body as { title: string; category: string; content: string; owner: string; department: string }[];
    expect(list).toHaveLength(2);
    const leave = list.find((g) => g.title === 'چطور مرخصی بگیرم؟')!;
    expect(leave).toMatchObject({ category: 'مرخصی', owner: 'همکار hr.owner', department: 'طراحی', content: '<ol><li>درخواست را ثبت کنید.</li><li>تأیید بگیرید.</li></ol>' });
    // «مرخصي» is the same category as «مرخصی», so the list has one heading.
    expect(new Set(list.map((g) => g.category))).toEqual(new Set(['مرخصی']));
    const [row] = await db.select().from(guides);
    expect(row.reviewAt && toJalali(row.reviewAt)).toBe(NEXT_YEAR);
    const history = await db.select().from(auditLog);
    expect(history.some((h) => h.action === 'import' && h.entity === 'guide' && h.detail.includes('۲ راهنمای جدید'))).toBe(true);

    // The same file again changes nothing.
    const again = (await preview(admin, file).expect(200)).body.rows as PreviewRow[];
    expect(again.map((r) => r.action)).toEqual(['unchanged', 'unchanged', undefined]);
    const repeated = await admin.post('/api/guides/import').send({ rows: valid(again), updateExisting: true }).expect(201);
    expect(repeated.body).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(await db.select().from(guides)).toHaveLength(2);

    // A changed answer is shown as an update; empty cells keep what the guide says.
    const edited = [['چطور مرخصی بگیرم', '', 'درخواست را در سامانهٔ حضور و غیاب ثبت کنید.', '', 'فروش', '', '']];
    const change = (await preview(admin, edited).expect(200)).body.rows as PreviewRow[];
    expect(change[0]).toMatchObject({ errors: [], action: 'update', changes: ['پاسخ کوتاه', 'واحد: فروش'] });
    const kept = await admin.post('/api/guides/import').send({ rows: valid(change) }).expect(201);
    expect(kept.body).toMatchObject({ created: 0, updated: 0, leftAlone: 1 });
    expect((await db.select().from(guides)).find((g) => g.id === row.id)).toMatchObject({ summary: 'درخواست را در سامانه ثبت کنید.', department: 'طراحی' });

    const updated = await admin.post('/api/guides/import').send({ rows: valid(change), updateExisting: true }).expect(201);
    expect(updated.body).toMatchObject({ created: 0, updated: 1, leftAlone: 0 });
    const after = (await db.select().from(guides)).find((g) => g.id === row.id)!;
    expect(after).toMatchObject({
      title: 'چطور مرخصی بگیرم؟',
      summary: 'درخواست را در سامانهٔ حضور و غیاب ثبت کنید.',
      department: 'فروش',
      ownerId: owner.id,
      content: '<ol><li>درخواست را ثبت کنید.</li><li>تأیید بگیرید.</li></ol>',
    });
    expect(after.reviewAt?.getTime()).toBe(row.reviewAt?.getTime());
  });

  it('reads a CSV file with line breaks inside a cell', async () => {
    const csv = '﻿پرسش,دسته,متن کامل\r\nبرای ازدواج چه مرخصی‌ای دارم؟,مرخصی,"۳ روز با مزد برای:\n- ازدواج دائم\n- فوت همسر، پدر، مادر و فرزندان"\r\n';
    const res = await admin.post('/api/guides/import/preview').attach('file', Buffer.from(csv, 'utf8'), 'guides.csv').expect(200);
    const rows = res.body.rows as PreviewRow[];
    expect(rows).toHaveLength(1);
    await admin.post('/api/guides/import').send({ rows: valid(rows) }).expect(201);
    const [guide] = (await db.select().from(guides)).filter((g) => g.title === 'برای ازدواج چه مرخصی‌ای دارم؟');
    expect(guide.content).toBe('<p>۳ روز با مزد برای:</p><ul><li>ازدواج دائم</li><li>فوت همسر، پدر، مادر و فرزندان</li></ul>');
  });

  it('finds the owner by full name, unless the name is shared or the colleague has no portal account', async () => {
    await admin.post('/api/employees').send({ hasAccount: false, firstName: 'رضا', lastName: 'نوری', position: 'اپراتور', department: 'تولید' }).expect(201);
    for (const username of ['sara.one', 'sara.two']) {
      await admin.post('/api/employees').send({ username, firstName: 'سارا', lastName: 'احمدی', position: 'کارشناس', department: 'فروش', role: 'employee' }).expect(201);
    }
    const res = await preview(admin, [
      ['بیمار شدم چه کنم؟', 'بیماری', '', 'به شرکت خبر بدهید.', '', 'رضا نوری', ''],
      ['مرخصی زایمان چقدر است؟', 'بیماری', '', 'نه ماه.', '', 'سارا احمدی', ''],
      ['ساعت شیردهی چطور است؟', 'بیماری', '', 'هر سه ساعت نیم ساعت.', '', 'sara.two', ''],
      ['کمک‌هزینهٔ زایمان چقدر است؟', 'بیماری', '', 'از تأمین اجتماعی.', '', 'همکار  hr.owner', ''],
    ]).expect(200);
    const rows = res.body.rows as PreviewRow[];
    expect(rows[0].errors).toEqual(['مسئول: مسئول راهنما باید همکار فعال با حساب پرتال باشد.']);
    expect(rows[1].errors).toEqual(['مسئول: چند همکار با نام «سارا احمدی» هست؛ نام کاربری مسئول را بنویسید.']);
    expect(rows[2]).toMatchObject({ errors: [], owner: 'سارا احمدی' });
    expect(rows[3]).toMatchObject({ errors: [], owner: 'همکار hr.owner' });
  });
});
