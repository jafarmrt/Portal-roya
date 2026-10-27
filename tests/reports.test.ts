import { and, eq, sql } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayJalali, toJalali } from '../shared/jalali';
import type { ReportOverview, StoredMonthlySummary } from '../shared/reports';
import { db, pool } from '../server/db/index';
import { employees, newsReads, notifications, reportSummaries, trainingEnrollments, trainingFeedback } from '../server/db/schema';
import { processMonthlySummary } from '../server/reports';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

interface AuditItem {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  title: string;
  detail: string;
}

const article = (title: string, extra: object = {}) => ({
  title,
  summary: 'خلاصه',
  content: '<p>متن</p>',
  contentFormat: 'html',
  category: 'اطلاعیه مهم',
  ...extra,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const range = { from: toJalali(Date.now() - DAY_MS), to: todayJalali() };

/** Moves a read to a number of minutes after the item was published. */
async function readAfter(newsId: string, userId: string, minutes: number) {
  await db
    .update(newsReads)
    .set({ readAt: sql`(select publish_at from news where id = ${newsId}) + make_interval(mins => ${minutes})` })
    .where(and(eq(newsReads.newsId, newsId), eq(newsReads.userId, userId)));
}

const lastSeen = async (id: string) => (await db.select({ at: employees.lastSeenAt }).from(employees).where(eq(employees.id, id)))[0].at;
const auditOf = async (agent: Agent, query = '') => (await agent.get(`/api/audit-log${query}`).expect(200)).body as { items: AuditItem[]; hasMore: boolean };

describe('reports, the monthly summary and the change history', () => {
  let admin: Agent;
  let manager: Person;
  let sales1: Person;
  let sales2: Person;
  let designer: Person;
  let ackItem: string;
  let salesItem: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    manager = await createEmployee(admin, { username: 'rep.manager', department: 'فناوری اطلاعات', role: 'manager' });
    sales1 = await createEmployee(admin, { username: 'rep.sales1', department: 'فروش' });
    sales2 = await createEmployee(admin, { username: 'rep.sales2', department: 'فروش' });
    designer = await createEmployee(admin, { username: 'rep.design', department: 'طراحی' });
    // In the phone book only: never part of an audience or of the people who have been away.
    await admin
      .post('/api/employees')
      .send({ hasAccount: false, firstName: 'کارگر', lastName: 'کارگاه', position: 'تکنسین', department: 'تولید' })
      .expect(201);
  });
  afterAll(() => pool.end());

  it('shows how far announcements reached, per department and category, and how soon they were read', async () => {
    ackItem = (await manager.agent.post('/api/news').send(article('بخشنامهٔ ساعت کاری', { requiresAck: true })).expect(201)).body.id;
    salesItem = (await admin.post('/api/news').send(article('جلسهٔ فروش', { category: 'اخبار سازمان', targetDepartments: ['فروش'] })).expect(201)).body.id;
    // A draft is not part of the reach.
    await admin.post('/api/news').send({ title: 'نیمه‌کاره', draft: true }).expect(201);

    await sales1.agent.post(`/api/news/${ackItem}/ack`).expect(200);
    await sales2.agent.post(`/api/news/${ackItem}/read`).expect(200);
    await admin.post(`/api/news/${ackItem}/read`).expect(200);
    await sales1.agent.post(`/api/news/${salesItem}/read`).expect(200);
    // The author's own read does not count.
    await manager.agent.post(`/api/news/${ackItem}/read`).expect(200);
    await readAfter(ackItem, sales1.id, 30);
    await readAfter(ackItem, sales2.id, 90);
    const [adminRow] = await db.select().from(employees).where(eq(employees.username, 'admin'));
    await readAfter(ackItem, adminRow.id, 60);
    await readAfter(salesItem, sales1.id, 10);

    await sales1.agent.get(`/api/reports/overview?from=${range.from}&to=${range.to}`).expect(403);
    await admin.get(`/api/reports/overview?from=${range.to}&to=${range.from}`).expect(400);
    await admin.get('/api/reports/overview?from=1405/13/01&to=1405/13/02').expect(400);
    const report = (await manager.agent.get(`/api/reports/overview?from=${range.from}&to=${range.to}`).expect(200)).body as ReportOverview;

    const items = Object.fromEntries(report.news.items.map((i) => [i.id, i]));
    expect(report.news.items).toHaveLength(2);
    // Everyone but the author and the colleague without an account.
    expect(items[ackItem]).toMatchObject({ audience: 4, read: 3, acknowledged: 1, avgReadMinutes: 60, requiresAck: true, author: 'همکار rep.manager' });
    expect(items[salesItem]).toMatchObject({ audience: 2, read: 1, acknowledged: 0, avgReadMinutes: 10 });

    const departments = Object.fromEntries(report.news.departments.map((d) => [d.name, d]));
    expect(departments['فروش']).toMatchObject({ items: 2, audience: 4, read: 3, ackAudience: 2, acknowledged: 1, avgReadMinutes: 43, medianReadMinutes: 30 });
    expect(departments['طراحی']).toMatchObject({ items: 1, audience: 1, read: 0, avgReadMinutes: null });
    expect(departments['فناوری اطلاعات']).toMatchObject({ audience: 1, read: 1 });
    expect(departments['تولید']).toBeUndefined();
    // In the order of the department list.
    expect(report.news.departments.map((d) => d.name)).toEqual(['فناوری اطلاعات', 'فروش', 'طراحی']);

    expect(report.news.categories.map((c) => [c.name, c.items, c.audience, c.read])).toEqual([
      ['اطلاعیه مهم', 1, 4, 3],
      ['اخبار سازمان', 1, 2, 1],
    ]);
    expect(report.news.totals).toMatchObject({ items: 2, audience: 6, read: 4, ackAudience: 4, acknowledged: 1, avgReadMinutes: 48, medianReadMinutes: 45 });
  });

  it('shows how departments took part in polls and courses', async () => {
    const poll = (
      await manager.agent
        .post('/api/polls')
        .send({ title: 'ناهار جمعی', questions: [{ text: 'کدام روز؟', type: 'single', options: [{ text: 'شنبه' }, { text: 'یکشنبه' }] }] })
        .expect(201)
    ).body as { id: string; questions: { id: string; options: { id: string }[] }[] };
    const vote = { answers: [{ questionId: poll.questions[0].id, optionIds: [poll.questions[0].options[0].id] }] };
    await sales1.agent.post(`/api/polls/${poll.id}/vote`).send(vote).expect(200);
    await designer.agent.post(`/api/polls/${poll.id}/vote`).send(vote).expect(200);

    const course = (
      await admin
        .post('/api/trainings')
        .send({ title: 'اکسل', instructor: 'مهندس کریمی', date: todayJalali(), capacity: 1, description: 'جدول محوری', category: 'نرم‌افزار' })
        .expect(201)
    ).body.id as string;
    await sales1.agent.post(`/api/trainings/${course}/enroll`).expect(200);
    await sales2.agent.post(`/api/trainings/${course}/enroll`).expect(200);
    await db.update(trainingEnrollments).set({ attended: true }).where(and(eq(trainingEnrollments.trainingId, course), eq(trainingEnrollments.userId, sales1.id)));
    await db.insert(trainingFeedback).values({ trainingId: course, userId: sales1.id, satisfaction: 4, usefulness: 5 });

    const { participation } = (await admin.get(`/api/reports/overview?from=${range.from}&to=${range.to}`).expect(200)).body as ReportOverview;
    // The whole organisation with an account, the poll's creator included.
    expect(participation.polls).toEqual([expect.objectContaining({ id: poll.id, audience: 5, responses: 2, open: true })]);
    expect(participation.trainings).toEqual([
      expect.objectContaining({ id: course, enrolled: 1, waitlist: 1, attended: 1, absent: 0, feedback: 1, satisfaction: 4, usefulness: 5 }),
    ]);
    const departments = Object.fromEntries(participation.departments.map((d) => [d.name, d]));
    expect(departments['فروش']).toEqual({ name: 'فروش', staff: 2, pollAudience: 2, pollResponses: 1, trainingPeople: 1, enrollments: 1, attended: 1, absent: 0 });
    expect(departments['طراحی']).toMatchObject({ staff: 1, pollAudience: 1, pollResponses: 1, trainingPeople: 0 });
    expect(departments['تولید']).toBeUndefined();
    expect(participation.totals).toMatchObject({ staff: 5, pollAudience: 5, pollResponses: 2, trainingPeople: 1, waitlist: 1, feedback: 1, satisfaction: 4 });
  });

  it('lists colleagues who have not used the portal for a month', async () => {
    // Signing in and using the portal are noted.
    expect(await lastSeen(sales1.id)).not.toBeNull();
    await db.update(employees).set({ lastSeenAt: new Date(Date.now() - 40 * DAY_MS) }).where(eq(employees.id, sales2.id));
    await db.update(employees).set({ lastSeenAt: null }).where(eq(employees.id, designer.id));

    const idle = () => admin.get(`/api/reports/overview?from=${range.from}&to=${range.to}`).expect(200).then((r) => (r.body as ReportOverview).idle);
    expect((await idle()).map((p) => [p.name, p.department, p.lastSeenAt === null])).toEqual([
      ['همکار rep.design', 'طراحی', true],
      ['همکار rep.sales2', 'فروش', false],
    ]);

    // Coming back takes them off the list; within a few minutes the time is not written again.
    await sales2.agent.get('/api/news').expect(200);
    const seen = await lastSeen(sales2.id);
    expect(Date.now() - seen!.getTime()).toBeLessThan(60_000);
    expect((await idle()).map((p) => p.name)).toEqual(['همکار rep.design']);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    await db.update(employees).set({ lastSeenAt: twoMinutesAgo }).where(eq(employees.id, sales2.id));
    await sales2.agent.get('/api/news').expect(200);
    expect((await lastSeen(sales2.id))!.getTime()).toBe(twoMinutesAgo.getTime());
  });

  it('keeps a summary of each month and tells the people who see reports, once', async () => {
    const month = moment().format('jYYYY/jMM');
    const nextMonth = moment().endOf('jMonth').add(10, 'days');
    const early = nextMonth.clone().hour(6).toDate();
    const later = nextMonth.clone().hour(9).toDate();
    const reportTitles = async (userId: string) =>
      (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.linkTab, 'reports')))).map((n) => n.title);

    expect(await processMonthlySummary(early)).toBeNull();
    expect(await db.select().from(reportSummaries)).toEqual([]);

    const stored = await processMonthlySummary(later);
    expect(stored?.month).toBe(month);
    expect(stored?.data.news).toMatchObject({ items: 2, readPercent: 67, avgReadMinutes: 48, ackPercent: 25 });
    expect(stored?.data.news.topItem).toEqual({ id: ackItem, title: 'بخشنامهٔ ساعت کاری', percent: 75 });
    // The other item went to two people, too few to rank; the other departments are too small to compare.
    expect(stored?.data.news.lowItem).toBeNull();
    expect(stored?.data.news.bestDepartment).toBeNull();
    expect(stored?.data.participation).toMatchObject({ polls: 1, responsePercent: 40, trainings: 1, participants: 1, attendancePercent: 100, satisfaction: 4 });
    expect(await processMonthlySummary(later)).toBeNull();

    const [title] = await reportTitles(manager.id);
    expect(title).toMatch(/^خلاصهٔ گزارش .+ آماده است 📊$/);
    expect(await reportTitles(manager.id)).toHaveLength(1);
    expect(await reportTitles(sales1.id)).toEqual([]);

    const summaries = (await manager.agent.get('/api/reports/summaries').expect(200)).body as StoredMonthlySummary[];
    expect(summaries.map((s) => s.month)).toEqual([month]);
    await sales1.agent.get('/api/reports/summaries').expect(403);
  });

  it('records who changed what, for the admin to search', async () => {
    await manager.agent.get('/api/audit-log').expect(403);

    // Publishing, editing and deleting announcements.
    const edited = article('بخشنامهٔ ساعت کاری (اصلاح)', { requiresAck: true });
    await manager.agent.patch(`/api/news/${ackItem}`).send(edited).expect(200);
    await admin.delete(`/api/news/${salesItem}`).expect(200);
    const sales = await auditOf(admin, `?q=${encodeURIComponent('جلسهٔ فروش')}`);
    expect(sales.items.map((i) => [i.action, i.entity, i.actorName])).toEqual([
      ['delete', 'news', 'مدیر سیستم'],
      ['create', 'news', 'مدیر سیستم'],
    ]);
    const [edit] = (await auditOf(admin, '?entity=news&action=update')).items;
    expect(edit).toMatchObject({ entityId: ackItem, title: 'بخشنامهٔ ساعت کاری (اصلاح)', detail: 'عنوان', actorName: 'همکار rep.manager' });

    // A role given to a colleague, and a role's permissions.
    await admin.patch(`/api/employees/${sales2.id}`).send({ role: 'manager' }).expect(200);
    const [promotion] = (await auditOf(admin, '?entity=employee&action=update')).items;
    expect(promotion).toMatchObject({ entityId: sales2.id, title: 'همکار rep.sales2', detail: 'نقش: کارشناس ← مدیر' });
    const role = (await admin.post('/api/roles').send({ name: 'ناشر آزمایشی', permissions: ['news.manage'] }).expect(201)).body.id as string;
    await admin.patch(`/api/roles/${role}`).send({ permissions: ['reports.view'] }).expect(200);
    const roleEntries = (await auditOf(admin, `?entity=role`)).items;
    expect(roleEntries.map((i) => [i.action, i.detail])).toEqual([
      ['update', 'داده شد: مشاهدهٔ گزارش‌ها؛ گرفته شد: انتشار و مدیریت اخبار و اطلاعیه‌ها'],
      ['create', 'انتشار و مدیریت اخبار و اطلاعیه‌ها'],
    ]);
    // Arabic "ي" finds the Persian "ی".
    expect((await auditOf(admin, `?q=${encodeURIComponent('آزمايشي')}`)).items).toHaveLength(2);

    // A colleague's own contact details are not a management change; a manager's edit is.
    const before = (await auditOf(admin)).items[0].id;
    await sales1.agent.patch(`/api/employees/${sales1.id}`).send({ mobile: '09120000000' }).expect(200);
    expect((await auditOf(admin)).items[0].id).toBe(before);

    // Settings: what was added to a list.
    const { locations: current } = (await admin.get('/api/settings').expect(200)).body as { locations: string[] };
    await admin.put('/api/settings').send({ locations: [...current.slice(1), 'نمایشگاه'] }).expect(200);
    const [locations] = (await auditOf(admin, '?entity=settings')).items;
    expect(locations).toMatchObject({ title: 'محل‌های استقرار', detail: `اضافه: نمایشگاه؛ حذف: ${current[0]}` });

    // Older entries come page by page.
    const first = await auditOf(admin);
    const next = await auditOf(admin, `?before=${first.items[first.items.length - 1].id}`);
    expect(next.items.every((i) => i.id < first.items[first.items.length - 1].id)).toBe(true);
    await admin.get('/api/audit-log?entity=nothing').expect(400);
  });
});
