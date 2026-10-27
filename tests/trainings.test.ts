import { and, eq } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayJalali } from '../shared/jalali';
import { db, pool } from '../server/db/index';
import { notifications, trainings } from '../server/db/schema';
import { processTrainingReminders } from '../server/routes/trainings';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;
interface Training {
  id: string;
  enrolledUserIds: string[];
  waitlistCount: number;
  myStatus: 'enrolled' | 'waitlist' | null;
  myWaitlistPosition?: number;
  myAttended: boolean | null;
  myFeedback: boolean;
  feedbackCount?: number;
}

const NEXT_YEAR = String(Number(todayJalali().slice(0, 4)) + 1);
const course = {
  title: 'اکسل پیشرفته',
  instructor: 'مهندس کریمی',
  date: `${NEXT_YEAR}/02/10`,
  time: '9 تا 12',
  location: 'سالن آموزش',
  capacity: 1,
  description: 'فرمول‌ها و جدول محوری',
  category: 'نرم‌افزار',
};
const pdf = (name: string) => ({ name, url: `/uploads/${name.replace(/\W/g, '')}abc.pdf`, size: 1000, mimeType: 'application/pdf' });

const trainingOf = async (agent: Agent, id: string) =>
  ((await agent.get('/api/trainings').expect(200)).body as Training[]).find((t) => t.id === id)!;
const titlesFor = async (userId: string, trainingId: string) =>
  (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.linkId, trainingId)))).map((n) => n.title);

describe('trainings: waitlist, attendance, handouts, feedback and reminders', () => {
  let admin: Agent;
  let first: Person;
  let second: Person;
  let third: Person;
  let teacher: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    first = await createEmployee(admin, { username: 'tr.first', department: 'فروش' });
    second = await createEmployee(admin, { username: 'tr.second', department: 'فروش' });
    third = await createEmployee(admin, { username: 'tr.third', department: 'طراحی' });
    teacher = await createEmployee(admin, { username: 'tr.teacher', department: 'تولید' });
  });
  afterAll(() => pool.end());

  it('puts people on a waitlist when the course is full and moves the next one up when a place frees', async () => {
    const id = (await admin.post('/api/trainings').send(course).expect(201)).body.id;
    expect((await first.agent.post(`/api/trainings/${id}/enroll`).expect(200)).body).toEqual({ status: 'enrolled' });
    expect((await second.agent.post(`/api/trainings/${id}/enroll`).expect(200)).body).toEqual({ status: 'waitlist', position: 1 });
    expect((await third.agent.post(`/api/trainings/${id}/enroll`).expect(200)).body).toEqual({ status: 'waitlist', position: 2 });
    // Asking again changes nothing.
    expect((await third.agent.post(`/api/trainings/${id}/enroll`).expect(200)).body).toEqual({ status: 'waitlist', position: 2 });
    expect(await trainingOf(third.agent, id)).toMatchObject({ enrolledUserIds: [first.id], waitlistCount: 2, myStatus: 'waitlist', myWaitlistPosition: 2 });

    await first.agent.delete(`/api/trainings/${id}/enroll`).expect(200);
    await first.agent.delete(`/api/trainings/${id}/enroll`).expect(404);
    expect(await trainingOf(second.agent, id)).toMatchObject({ enrolledUserIds: [second.id], myStatus: 'enrolled', waitlistCount: 1 });
    expect(await titlesFor(second.id, id)).toContain('جای شما در دوره قطعی شد 🎓');
    expect(await trainingOf(third.agent, id)).toMatchObject({ myWaitlistPosition: 1 });

    // A larger capacity takes the rest off the waitlist; the organiser removing someone frees a place too.
    await admin.put(`/api/trainings/${id}`).send({ ...course, capacity: 2 }).expect(200);
    expect((await trainingOf(admin, id)).enrolledUserIds.sort()).toEqual([second.id, third.id].sort());
    await first.agent.post(`/api/trainings/${id}/enroll`).expect(200);
    await admin.delete(`/api/trainings/${id}/enrollments/${third.id}`).expect(200);
    expect((await trainingOf(admin, id)).enrolledUserIds.sort()).toEqual([first.id, second.id].sort());
    expect(await titlesFor(first.id, id)).toContain('جای شما در دوره قطعی شد 🎓');

    // Cancelling the course tells everyone signed up.
    await admin.delete(`/api/trainings/${id}`).expect(200);
    const cancelled = await db.select().from(notifications).where(and(eq(notifications.userId, second.id), eq(notifications.title, 'دورهٔ آموزشی لغو شد')));
    expect(cancelled).toHaveLength(1);
  });

  it('closes sign-up once the course has taken place', async () => {
    const id = (await admin.post('/api/trainings').send({ ...course, date: '1400/01/10', capacity: 5 }).expect(201)).body.id;
    await first.agent.post(`/api/trainings/${id}/enroll`).expect(400);
    await first.agent.delete(`/api/trainings/${id}/enroll`).expect(400);
  });

  it('lets the instructor take attendance, share handouts and read the feedback', async () => {
    const id = (await admin.post('/api/trainings').send({ ...course, date: todayJalali(), capacity: 2, instructorId: teacher.id }).expect(201)).body.id;
    await admin.post('/api/trainings').send({ ...course, instructorId: 'nobody' }).expect(400);
    await first.agent.post(`/api/trainings/${id}/enroll`).expect(200);
    await second.agent.post(`/api/trainings/${id}/enroll`).expect(200);
    await third.agent.post(`/api/trainings/${id}/enroll`).expect(200);

    const list = (await teacher.agent.get(`/api/trainings/${id}/enrollments`).expect(200)).body as { userId: string; status: string }[];
    expect(list.map((r) => [r.userId, r.status])).toEqual([[first.id, 'enrolled'], [second.id, 'enrolled'], [third.id, 'waitlist']]);
    await first.agent.get(`/api/trainings/${id}/enrollments`).expect(403);

    await teacher.agent.put(`/api/trainings/${id}/attendance`).send({ userId: first.id, attended: true }).expect(200);
    await teacher.agent.put(`/api/trainings/${id}/attendance`).send({ userId: second.id, attended: false }).expect(200);
    await teacher.agent.put(`/api/trainings/${id}/attendance`).send({ userId: third.id, attended: true }).expect(404);
    await first.agent.put(`/api/trainings/${id}/attendance`).send({ userId: first.id, attended: true }).expect(403);
    expect(await trainingOf(first.agent, id)).toMatchObject({ myAttended: true });
    // After attendance is taken, colleagues can no longer cancel themselves.
    await first.agent.delete(`/api/trainings/${id}/enroll`).expect(400);
    await second.agent.delete(`/api/trainings/${id}/enroll`).expect(400);

    await teacher.agent.put(`/api/trainings/${id}/materials`).send({ materials: [pdf('slides.pdf')] }).expect(200);
    await first.agent.put(`/api/trainings/${id}/materials`).send({ materials: [] }).expect(403);
    expect(await titlesFor(first.id, id)).toContain('جزوه و اسلاید دوره 📎');
    // Those marked absent are not sent the handouts or the survey.
    expect(await titlesFor(second.id, id)).not.toContain('جزوه و اسلاید دوره 📎');

    await first.agent.post(`/api/trainings/${id}/feedback`).send({ satisfaction: 5, usefulness: 4, comment: 'مثال‌ها عالی بود' }).expect(200);
    await first.agent.post(`/api/trainings/${id}/feedback`).send({ satisfaction: 4, usefulness: 4, comment: 'مثال‌ها عالی بود' }).expect(200);
    await second.agent.post(`/api/trainings/${id}/feedback`).send({ satisfaction: 1, usefulness: 1 }).expect(403);
    await third.agent.post(`/api/trainings/${id}/feedback`).send({ satisfaction: 1, usefulness: 1 }).expect(403);
    await first.agent.post(`/api/trainings/${id}/feedback`).send({ satisfaction: 6, usefulness: 1 }).expect(400);
    expect(await trainingOf(first.agent, id)).toMatchObject({ myFeedback: true });
    expect((await trainingOf(first.agent, id)).feedbackCount).toBeUndefined();
    expect(await trainingOf(teacher.agent, id)).toMatchObject({ feedbackCount: 1 });

    const results = (await teacher.agent.get(`/api/trainings/${id}/feedback`).expect(200)).body;
    expect(results).toMatchObject({ count: 1, participants: 1, satisfaction: 4, usefulness: 4, comments: [{ comment: 'مثال‌ها عالی بود' }] });
    expect(JSON.stringify(results)).not.toContain(first.id);
    await first.agent.get(`/api/trainings/${id}/feedback`).expect(403);

    // Feedback is for courses that took place.
    const future = (await admin.post('/api/trainings').send({ ...course, capacity: 5 }).expect(201)).body.id;
    await first.agent.post(`/api/trainings/${future}/enroll`).expect(200);
    await first.agent.post(`/api/trainings/${future}/feedback`).send({ satisfaction: 5, usefulness: 5 }).expect(400);
    await teacher.agent.put(`/api/trainings/${future}/attendance`).send({ userId: first.id, attended: true }).expect(403);
    await admin.put(`/api/trainings/${future}/attendance`).send({ userId: first.id, attended: true }).expect(400);

    // Each colleague's courses, for their profile.
    const mine = (await first.agent.get(`/api/trainings/people/${first.id}`).expect(200)).body;
    expect(mine.courses.find((c: { id: string }) => c.id === id)).toMatchObject({ status: 'enrolled', attended: true, materialsCount: 1 });
    expect((await admin.get(`/api/trainings/people/${teacher.id}`).expect(200)).body.taught.map((t: { id: string }) => t.id)).toContain(id);
    await second.agent.get(`/api/trainings/people/${first.id}`).expect(403);
  });

  it('reminds the day before and asks for feedback the day after', async () => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    const day = (offset: number) => moment(now).add(offset, 'day').format('jYYYY/jMM/jDD');
    await db.update(trainings).set({ remindedAt: now, feedbackRequestedAt: now });

    const tomorrow = (await admin.post('/api/trainings').send({ ...course, date: day(1), capacity: 1, instructorId: teacher.id }).expect(201)).body.id;
    await first.agent.post(`/api/trainings/${tomorrow}/enroll`).expect(200);
    await second.agent.post(`/api/trainings/${tomorrow}/enroll`).expect(200);
    const yesterday = (await admin.post('/api/trainings').send({ ...course, title: 'مذاکرهٔ فروش', date: day(-1), capacity: 3 }).expect(201)).body.id;
    const old = (await admin.post('/api/trainings').send({ ...course, title: 'قدیمی', date: day(-10), capacity: 3 }).expect(201)).body.id;
    // Signed up before the day, as they would have been.
    await db.update(trainings).set({ date: day(1) }).where(eq(trainings.id, yesterday));
    await first.agent.post(`/api/trainings/${yesterday}/enroll`).expect(200);
    await third.agent.post(`/api/trainings/${yesterday}/enroll`).expect(200);
    await db.update(trainings).set({ date: day(-1), remindedAt: now }).where(eq(trainings.id, yesterday));
    await admin.put(`/api/trainings/${yesterday}/attendance`).send({ userId: third.id, attended: false }).expect(200);

    const early = new Date(now);
    early.setHours(6);
    expect(await processTrainingReminders(early)).toEqual({ reminded: 0, surveyed: 0 });
    expect(await processTrainingReminders(now)).toEqual({ reminded: 1, surveyed: 1 });
    expect(await processTrainingReminders(now)).toEqual({ reminded: 0, surveyed: 0 });

    expect(await titlesFor(first.id, tomorrow)).toContain('یادآوری: دورهٔ آموزشی فردا 🎓');
    expect(await titlesFor(second.id, tomorrow)).not.toContain('یادآوری: دورهٔ آموزشی فردا 🎓');
    expect(await titlesFor(teacher.id, tomorrow)).toContain('یادآوری: فردا دوره دارید 🎓');
    expect(await titlesFor(first.id, yesterday)).toContain('دوره چطور بود؟ 🎓');
    expect(await titlesFor(third.id, yesterday)).not.toContain('دوره چطور بود؟ 🎓');
    // Courses older than a few days are not surveyed after the fact.
    const [{ feedbackRequestedAt }] = await db.select().from(trainings).where(eq(trainings.id, old));
    expect(feedbackRequestedAt).toBeNull();
  });
});
