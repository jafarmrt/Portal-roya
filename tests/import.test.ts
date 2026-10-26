import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crc32, deflateRawSync } from 'zlib';
import { pool } from '../server/db/index';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

/** Builds a minimal .xlsx (shared strings + one sheet), the way Excel stores text cells. */
function buildXlsx(rows: string[][]) {
  const strings: string[] = [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sheetRows = rows
    .map((cells, r) => {
      const xml = cells
        .map((value, c) => {
          strings.push(value);
          return `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="s"><v>${strings.length - 1}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${xml}</row>`;
    })
    .join('');
  const files: Record<string, string> = {
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc32(raw), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const HEADER = ['نام', 'نام خانوادگی', 'نام کاربری', 'سمت', 'واحد', 'نقش', 'موبایل'];

describe('bulk employee import', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    await createEmployee(admin, { username: 'existing.user' });
  });
  afterAll(() => pool.end());

  it('previews an Excel file and flags bad, duplicate and existing rows', async () => {
    const file = buildXlsx([
      HEADER,
      ['علی', 'رضایی', 'Ali.Rezaei', 'کارشناس فروش', 'فروش', 'کارشناس', '۰۹۱۲۱۲۳۴۵۶۷'],
      ['مریم', 'احمدی', 'ROYA\\m.ahmadi', 'مدیر واحد', 'طراحی', 'مدیر', ''],
      ['تکراری', 'یک', 'ali.rezaei', 'کارشناس', 'فروش', '', ''],
      ['قدیمی', 'دو', 'existing.user', 'کارشناس', 'فروش', '', ''],
      ['بی‌نام', '', 'نام فارسی', 'کارشناس', 'فروش', '', ''],
    ]);
    const res = await admin.post('/api/employees/import/preview').attach('file', file, 'staff.xlsx').expect(200);
    const rows = res.body.rows as { row: number; data: Record<string, string>; errors: string[] }[];
    expect(rows.map((r) => r.row)).toEqual([2, 3, 4, 5, 6]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual([]);
    expect(rows[2].errors[0]).toContain('ردیف 2');
    expect(rows[3].errors[0]).toContain('از قبل وجود دارد');
    expect(rows[4].errors.join(' ')).toContain('نام خانوادگی: این فیلد الزامی است');
  });

  it('reads UTF-8 CSV with English headers and reports missing columns', async () => {
    const csv = '﻿first name,last name,username,position,department\nSara,Karimi,s.karimi,Designer,طراحی\n';
    const ok = await admin.post('/api/employees/import/preview').attach('file', Buffer.from(csv), 'staff.csv').expect(200);
    expect(ok.body.rows[0]).toMatchObject({ errors: [], data: { username: 's.karimi', department: 'طراحی' } });

    const bad = await admin.post('/api/employees/import/preview').attach('file', Buffer.from('نام,سمت\nعلی,کارشناس\n'), 'x.csv').expect(400);
    expect(bad.body.error).toContain('نام خانوادگی');
  });

  it('creates the valid rows with one-time passwords that work for login', async () => {
    const res = await admin
      .post('/api/employees/import')
      .send({
        rows: [
          { firstName: 'علی', lastName: 'رضایی', username: 'Ali.Rezaei', position: 'کارشناس', department: 'فروش', mobile: '۰۹۱۲۱۲۳۴۵۶۷' },
          { firstName: 'مریم', lastName: 'احمدی', username: 'm.ahmadi@roya.local', position: 'مدیر', department: 'طراحی', role: 'manager' },
          { firstName: 'قدیمی', lastName: 'دو', username: 'existing.user', position: 'کارشناس', department: 'فروش' },
        ],
      })
      .expect(201);
    expect(res.body.created.map((c: { username: string }) => c.username)).toEqual(['ali.rezaei', 'm.ahmadi']);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].username).toBe('existing.user');

    const ali = res.body.created[0];
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ username: 'ali.rezaei', password: ali.temporaryPassword }).expect(200);
    expect(login.body.mustChangePassword ?? login.body.user?.mustChangePassword).toBe(true);

    const list = await admin.get('/api/employees').expect(200);
    const maryam = list.body.find((e: { username: string }) => e.username === 'm.ahmadi');
    expect(maryam.role).toBe('manager');
    expect(list.body.find((e: { username: string }) => e.username === 'ali.rezaei').mobile).toBe('09121234567');
  });

  it('is only available to managers', async () => {
    const staff = await createEmployee(admin, { username: 'plain.staff' });
    await staff.agent.post('/api/employees/import').send({ rows: [{ firstName: 'x' }] }).expect(403);
    await staff.agent.post('/api/employees/import/preview').attach('file', Buffer.from('a'), 'x.csv').expect(403);
  });
});
