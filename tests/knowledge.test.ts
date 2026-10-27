import { deflateRawSync } from 'zlib';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toJalali } from '../shared/jalali';
import { normalizeForSearch } from '../shared/search';
import { db, pool } from '../server/db/index';
import { documents, guides, notifications } from '../server/db/schema';
import { processGuideReviews } from '../server/routes/guides';
import { extractText, pageText } from '../server/textExtract';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A zip archive (stored entries are enough for Office files). */
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(content, 'utf8'));
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const docx = (paragraphs: string[]) =>
  zip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  });

/** A one-page PDF with a line of Latin text in Helvetica. */
function pdf(text: string) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function upload(agent: Agent, name: string, content: Buffer, contentType: string) {
  const res = await agent.post('/api/uploads').attach('file', content, { filename: name, contentType }).expect(201);
  return res.body as { name: string; url: string; size: number; mimeType: string };
}

describe('reading the text of files', () => {
  it('reads Word and PDF files', async () => {
    expect(await extractText(docx(['آیین‌نامهٔ مرخصی', 'درخواست در سامانهٔ حضور و غیاب']), DOCX_TYPE, 'a.docx')).toBe('آیین‌نامهٔ مرخصی\nدرخواست در سامانهٔ حضور و غیاب');
    expect(await extractText(pdf('Petty cash request form'), 'application/pdf', 'a.pdf')).toContain('Petty cash request form');
    expect(await extractText(Buffer.from('not a zip'), DOCX_TYPE, 'broken.docx').catch(() => 'failed')).toBe('failed');
  });

  it('puts Persian lines stored letter by letter, left to right, back in reading order', () => {
    // "در سامانه" drawn from the left: ه، ن، ا، م، ا، س، (space)، ر، د — one piece per letter.
    const letters = [...'در سامانه'].reverse();
    const items = letters.map((str, i) => ({ str, x: 100 + i * 10, y: 700, width: 10, height: 12 }));
    expect(pageText(items)).toBe('در سامانه');
    // Whole words with gaps instead of spaces, and a Latin line below.
    expect(pageText([
      { str: 'مرخصی', x: 100, y: 700, width: 40, height: 12 },
      { str: 'فرم', x: 150, y: 700.5, width: 25, height: 12 },
      { str: 'Leave', x: 100, y: 680, width: 30, height: 12 },
      { str: 'form', x: 135, y: 680, width: 25, height: 12 },
    ])).toBe('فرم مرخصی\nLeave form');
  });

  it('matches words with or without vowel marks and the hamza of «ـهٔ»', () => {
    expect(normalizeForSearch('سامان ٔه حضور')).toBe(normalizeForSearch('سامانه حضور'));
    expect(normalizeForSearch('سامانهٔ')).toBe('سامانه');
  });
});

describe('guides, department pages and search', () => {
  let admin: Agent;
  let owner: Person;
  let sales: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    owner = await createEmployee(admin, { username: 'finance.owner', department: 'طراحی' });
    sales = await createEmployee(admin, { username: 'sales.reader', department: 'فروش' });
  });
  afterAll(() => pool.end());

  it('publishes a guide that its owner keeps current and colleagues rate', async () => {
    const reviewDate = toJalali(new Date(Date.now() + 2 * DAY_MS));
    const created = await admin
      .post('/api/guides')
      .send({
        title: 'درخواست تنخواه',
        category: 'اداری و مالی',
        summary: 'از فرم تا تسویه',
        content: '<p>فرم را پر کنید.</p><script>alert(1)</script>',
        department: 'طراحی',
        ownerId: owner.id,
        reviewDate,
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.content).toBe('<p>فرم را پر کنید.</p>');
    await sales.agent.post('/api/guides').send({ title: 'x', category: 'y', content: '<p>z</p>' }).expect(403);

    // The owner edits the text but cannot hand the guide to someone else.
    const edited = await owner.agent
      .put(`/api/guides/${id}`)
      .send({ title: 'درخواست تنخواه', category: 'اداری و مالی', content: '<p>فرم تنخواه را پر کنید.</p>', ownerId: sales.id, department: 'فروش', reviewDate })
      .expect(200);
    expect(edited.body).toMatchObject({ ownerId: owner.id, department: 'طراحی', updatedBy: 'همکار finance.owner' });
    await sales.agent.put(`/api/guides/${id}`).send({ title: 'x', category: 'y', content: '<p>z</p>' }).expect(403);

    // Feedback: helpful or not, and a question that goes to the owner.
    await sales.agent.post(`/api/guides/${id}/feedback`).send({ helpful: true }).expect(200);
    const asked = await sales.agent.post(`/api/guides/${id}/question`).send({ text: 'سقف تنخواه چقدر است؟' }).expect(200);
    expect(asked.body.sentTo).toBe('همکار finance.owner');
    const ownerNotes = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(ownerNotes.some((n) => n.linkId === id && n.message.includes('سقف تنخواه چقدر است؟') && n.message.includes('همکار sales.reader'))).toBe(true);
    const seenByOwner = (await owner.agent.get('/api/guides').expect(200)).body.find((g: { id: string }) => g.id === id);
    expect(seenByOwner.feedback).toEqual({ helpful: 0, notHelpful: 1 });
    const seenBySales = (await sales.agent.get('/api/guides').expect(200)).body.find((g: { id: string }) => g.id === id);
    expect(seenBySales).toMatchObject({ myFeedback: false, reviewAt: null });
    expect(seenBySales.feedback).toBeUndefined();

    // Review reminder once, to the owner.
    await processGuideReviews(new Date(Date.now() + 3 * DAY_MS));
    await processGuideReviews(new Date(Date.now() + 4 * DAY_MS));
    const reminders = (await db.select().from(notifications).where(eq(notifications.userId, owner.id))).filter((n) => n.title.startsWith('زمان بازبینی راهنما'));
    expect(reminders).toHaveLength(1);
    const [row] = await db.select().from(guides).where(eq(guides.id, id));
    expect(row.reviewRemindedAt).not.toBeNull();

    // Visitors can read guides while guest access is on.
    await admin.put('/api/settings').send({ guestAccess: true }).expect(200);
    expect((await request(app).get('/api/guides').expect(200)).body).toHaveLength(1);
  });

  it('lets an admin choose a department head, who then keeps the page current', async () => {
    await sales.agent.put(`/api/department_pages/${encodeURIComponent('فروش')}`).send({ about: '<p>x</p>' }).expect(403);
    await admin.put(`/api/department_pages/${encodeURIComponent('فروش')}`).send({ headId: sales.id, about: '<p>پیش‌فاکتور</p>' }).expect(200);
    const updated = await sales.agent
      .put(`/api/department_pages/${encodeURIComponent('فروش')}`)
      .send({ headId: owner.id, about: '<p>پیش‌فاکتور و قرارداد</p><img src="https://x.example/a.png">' })
      .expect(200);
    // The head edits the text, not who leads the department.
    expect(updated.body).toMatchObject({ headId: sales.id, about: '<p>پیش‌فاکتور و قرارداد</p>' });
    await admin.put(`/api/department_pages/${encodeURIComponent('نیست')}`).send({ about: '' }).expect(400);

    // Renaming the department takes its page, guides and systems along.
    await admin.put('/api/settings').send({
      systems: [{ id: 'crm', name: 'CRM', description: '', iconName: 'Globe', url: 'https://crm.local', bgColor: 'bg-gray-50', textColor: 'text-gray-700', department: 'فروش' }],
    }).expect(200);
    await admin.post('/api/settings/departments/rename').send({ from: 'فروش', to: 'فروش و بازاریابی' }).expect(200);
    const pages = (await admin.get('/api/department_pages').expect(200)).body as { department: string }[];
    expect(pages.map((p) => p.department)).toEqual(['فروش و بازاریابی']);
    const settings = (await admin.get('/api/settings').expect(200)).body;
    expect(settings.systems[0].department).toBe('فروش و بازاریابی');
  });

  it('finds words inside document files, only in documents the person may see', async () => {
    const file = await upload(admin, 'leave.docx', docx(['آیین‌نامهٔ مرخصی', 'درخواست مرخصی در سامانهٔ حضور و غیاب ثبت می‌شود.']), DOCX_TYPE);
    const doc = await admin.post('/api/documents').send({ title: 'آیین‌نامه', category: 'آیین‌نامه‌ها', file }).expect(201);
    const secret = await upload(admin, 'secret.docx', docx(['حقوق مدیران حضور']), DOCX_TYPE);
    await admin.post('/api/documents').send({ title: 'محرمانه', category: 'آیین‌نامه‌ها', file: secret, targetDepartments: ['طراحی'] }).expect(201);

    const found = await sales.agent.get('/api/search').query({ q: 'سامانه حضور' }).expect(200);
    expect(found.body.documents).toHaveLength(1);
    expect(found.body.documents[0].id).toBe(doc.body.id);
    expect(found.body.documents[0].snippet).toContain('سامانه حضور و غیاب');
    // Visitors only search documents meant for everyone, too.
    expect((await request(app).get('/api/search').query({ q: 'حقوق' }).expect(200)).body.documents).toHaveLength(0);
    expect((await owner.agent.get('/api/search').query({ q: 'حقوق' }).expect(200)).body.documents).toHaveLength(1);

    // A new version is read again.
    const v2 = await upload(admin, 'leave-2.docx', docx(['مرخصی ساعتی']), DOCX_TYPE);
    await admin.post(`/api/documents/${doc.body.id}/versions`).send({ file: v2 }).expect(201);
    expect((await sales.agent.get('/api/search').query({ q: 'سامانه حضور' }).expect(200)).body.documents).toHaveLength(0);
    const [row] = await db.select().from(documents).where(eq(documents.id, doc.body.id));
    expect(row.contentText).toBe('مرخصی ساعتی');
  });

  it('counts searches that found nothing for the reports', async () => {
    await sales.agent.post('/api/search/misses').send({ q: 'فرم مأموریت' }).expect(200);
    await owner.agent.post('/api/search/misses').send({ q: ' فرم  مأموریت ' }).expect(200);
    await owner.agent.post('/api/search/misses').send({ q: 'ab' }).expect(200);
    await request(app).post('/api/search/misses').send({ q: 'guest search' }).expect(401);
    await sales.agent.get('/api/search/misses').expect(403);
    const misses = await admin.get('/api/search/misses').expect(200);
    expect(misses.body).toEqual([expect.objectContaining({ query: 'فرم مأموریت', count: 2 })]);
  });
});
