import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayJalali } from '../shared/jalali';
import { db, pool } from '../server/db/index';
import { calendarEvents } from '../server/db/schema';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

const NEXT_YEAR = String(Number(todayJalali().slice(0, 4)) + 1);

const training = {
  title: 'ایمنی کارگاه',
  instructor: 'مهندس رضایی',
  instructorRole: 'کارشناس HSE',
  date: `${NEXT_YEAR}/02/10`,
  time: '10:00',
  duration: '۲ ساعت',
  location: 'سالن اجتماعات',
  capacity: 2,
  description: 'آشنایی با اصول ایمنی',
  coverImage: '',
  category: 'ایمنی',
  prerequisites: '',
};

describe('editing trainings, calendar events and documents', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let sales: Awaited<ReturnType<typeof createEmployee>>;
  let design: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sales = await createEmployee(admin, { username: 'sales.edit', department: 'فروش' });
    design = await createEmployee(admin, { username: 'design.edit', department: 'طراحی' });
  });
  afterAll(() => pool.end());

  const notificationTitles = async (agent: typeof sales.agent) =>
    (await agent.get('/api/notifications').expect(200)).body.map((n: { title: string }) => n.title);

  it('keeps a training and its calendar entry in step, and tells enrolled people about changes', async () => {
    const created = await admin.post('/api/trainings').send(training).expect(201);
    const id = created.body.id;
    await sales.agent.post(`/api/trainings/${id}/enroll`).expect(200);
    await design.agent.post(`/api/trainings/${id}/enroll`).expect(200);

    const [entry] = await db.select().from(calendarEvents).where(eq(calendarEvents.trainingId, id));
    expect(entry).toMatchObject({ title: 'دوره آموزشی: ایمنی کارگاه', date: training.date, type: 'training' });

    // Capacity cannot drop below the number of people already signed up.
    await admin.put(`/api/trainings/${id}`).send({ ...training, capacity: 1 }).expect(400);
    await sales.agent.put(`/api/trainings/${id}`).send(training).expect(403);

    await admin
      .put(`/api/trainings/${id}`)
      .send({ ...training, title: 'ایمنی کارگاه (نوبت دوم)', date: `${NEXT_YEAR}/02/17`, capacity: 5, notifyEnrolled: true })
      .expect(200);
    const list = await sales.agent.get('/api/trainings').expect(200);
    expect(list.body.find((t: { id: string }) => t.id === id)).toMatchObject({ title: 'ایمنی کارگاه (نوبت دوم)', capacity: 5 });
    const entries = await db.select().from(calendarEvents).where(eq(calendarEvents.trainingId, id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'دوره آموزشی: ایمنی کارگاه (نوبت دوم)', date: `${NEXT_YEAR}/02/17` });
    expect(await notificationTitles(sales.agent)).toContain('تغییر در دورهٔ آموزشی 🎓');

    // The training's calendar entry is edited through the training only.
    await admin.put(`/api/calendar_events/${entries[0].id}`).send({ title: 'دستی', date: training.date, type: 'training' }).expect(400);

    // Deleting the training removes its calendar entry.
    await admin.delete(`/api/trainings/${id}`).expect(200);
    expect(await db.select().from(calendarEvents).where(eq(calendarEvents.trainingId, id))).toHaveLength(0);
  });

  it('lists who signed up for a training and lets the organiser take someone off', async () => {
    const id = (await admin.post('/api/trainings').send(training).expect(201)).body.id;
    await sales.agent.post(`/api/trainings/${id}/enroll`).expect(200);
    await design.agent.post(`/api/trainings/${id}/enroll`).expect(200);

    const rows = await admin.get(`/api/trainings/${id}/enrollments`).expect(200);
    expect(rows.body.map((r: { userId: string }) => r.userId)).toEqual([sales.id, design.id]);
    expect(rows.body[0]).toMatchObject({ name: 'همکار sales.edit', department: 'فروش', position: 'کارشناس' });
    await sales.agent.get(`/api/trainings/${id}/enrollments`).expect(403);

    await admin.delete(`/api/trainings/${id}/enrollments/${design.id}`).expect(200);
    await admin.delete(`/api/trainings/${id}/enrollments/${design.id}`).expect(404);
    const after = await admin.get('/api/trainings').expect(200);
    expect(after.body.find((t: { id: string }) => t.id === id).enrolledUserIds).toEqual([sales.id]);
    expect(await notificationTitles(design.agent)).toContain('لغو ثبت‌نام دوره');
  });

  it('edits calendar events', async () => {
    const created = await admin
      .post('/api/calendar_events')
      .send({ title: 'جلسهٔ ماهانه', date: `${NEXT_YEAR}/03/01`, type: 'meeting', time: '09:00' })
      .expect(201);
    const updated = await admin
      .put(`/api/calendar_events/${created.body.id}`)
      .send({ title: 'جلسهٔ ماهانه (جابه‌جا شد)', date: `${NEXT_YEAR}/03/02`, type: 'meeting', time: '', location: 'اتاق جلسات' })
      .expect(200);
    expect(updated.body).toMatchObject({ title: 'جلسهٔ ماهانه (جابه‌جا شد)', date: `${NEXT_YEAR}/03/02`, location: 'اتاق جلسات' });
    expect(updated.body.time).toBeUndefined();
    await sales.agent.put(`/api/calendar_events/${created.body.id}`).send({ title: 'x', date: `${NEXT_YEAR}/03/02`, type: 'meeting' }).expect(403);
    await admin.put('/api/calendar_events/missing').send({ title: 'x', date: `${NEXT_YEAR}/03/02`, type: 'meeting' }).expect(404);
  });

  it('edits the details of a document', async () => {
    const upload = await admin
      .post('/api/uploads')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'form.pdf', contentType: 'application/pdf' })
      .expect(201);
    const doc = await admin
      .post('/api/documents')
      .send({ title: 'فرم مرخصی', description: '', category: 'فرم‌ها', file: { name: 'form.pdf', url: upload.body.url, size: 13, mimeType: 'application/pdf' } })
      .expect(201);
    await admin.put(`/api/documents/${doc.body.id}`).send({ title: 'فرم درخواست مرخصی', description: 'نسخهٔ ۱۴۰۵', category: 'منابع انسانی' }).expect(200);
    const list = await sales.agent.get('/api/documents').expect(200);
    expect(list.body.find((d: { id: string }) => d.id === doc.body.id)).toMatchObject({
      title: 'فرم درخواست مرخصی',
      description: 'نسخهٔ ۱۴۰۵',
      category: 'منابع انسانی',
      fileUrl: upload.body.url,
    });
    await sales.agent.put(`/api/documents/${doc.body.id}`).send({ title: 'x', category: 'y' }).expect(403);
  });
});
