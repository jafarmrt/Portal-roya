import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { Router } from 'express';
import moment from 'moment-jalaali';
import { z } from 'zod';
import { todayJalali, toPersianDigits } from '../../shared/jalali.js';
import { audit, fromTo } from '../audit.js';
import { can, requirePermission, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { calendarEvents, employees, trainingEnrollments, trainingFeedback, trainings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { assetUrl, attachment, jalaliDate, optionalText, requiredText } from '../validation.js';

export const trainingsRouter = Router();

type Training = typeof trainings.$inferSelect;
type Enrollment = typeof trainingEnrollments.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The people who run trainings, and a course's own instructor, take attendance and read its feedback. */
const runs = (viewer: SessionUser | null | undefined, training: Pick<Training, 'instructorId'>) =>
  Boolean(viewer && (can(viewer, 'trainings.manage') || training.instructorId === viewer.id));

/** Signed up and not marked absent: the people a course's reminders, survey and handouts are for. */
const participates = (e: Enrollment) => e.status === 'enrolled' && e.attended !== false;

const byJoined = (a: Enrollment, b: Enrollment) => a.createdAt.getTime() - b.createdAt.getTime();

/** "«اکسل پیشرفته»، ۱۴۰۵/۰۸/۲۰ ساعت ۹ تا ۱۲، سالن آموزش" */
const describe = (t: Pick<Training, 'title' | 'date' | 'time' | 'location'>) =>
  toPersianDigits(`«${t.title}»، ${t.date}${t.time ? ` ساعت ${t.time}` : ''}${t.location ? `، ${t.location}` : ''}`);

async function listTrainings(viewer: SessionUser | null) {
  const [rows, enrollments, feedback] = await Promise.all([
    db.select().from(trainings).orderBy(desc(trainings.date)),
    db.select().from(trainingEnrollments),
    db.select({ trainingId: trainingFeedback.trainingId, userId: trainingFeedback.userId }).from(trainingFeedback),
  ]);
  return rows.map((t) => {
    const own = enrollments.filter((e) => e.trainingId === t.id).sort(byJoined);
    const waitlist = own.filter((e) => e.status === 'waitlist');
    const mine = viewer ? own.find((e) => e.userId === viewer.id) : undefined;
    const answers = feedback.filter((f) => f.trainingId === t.id);
    const { remindedAt: _reminded, feedbackRequestedAt: _asked, ...fields } = t;
    return {
      ...fields,
      createdAt: t.createdAt.toISOString(),
      enrolledUserIds: own.filter((e) => e.status === 'enrolled').map((e) => e.userId),
      waitlistCount: waitlist.length,
      myStatus: mine?.status ?? null,
      myWaitlistPosition: mine?.status === 'waitlist' ? waitlist.indexOf(mine) + 1 : undefined,
      myAttended: mine?.attended ?? null,
      myFeedback: Boolean(viewer && answers.some((f) => f.userId === viewer.id)),
      // How many answered the survey, for the people who run the course.
      feedbackCount: runs(viewer, t) ? answers.length : undefined,
    };
  });
}

trainingsRouter.get(
  '/trainings',
  route(async (req, res) => {
    res.json(await listTrainings(viewerOf(req)));
  }),
);

const trainingSchema = z.object({
  title: requiredText(200),
  instructor: requiredText(100),
  instructorRole: optionalText(100),
  instructorId: z.string().trim().max(100).nullish().transform((v) => v || null),
  date: jalaliDate,
  time: optionalText(20),
  duration: optionalText(50),
  location: optionalText(200),
  capacity: z.coerce.number().int().min(1).max(1000),
  description: requiredText(5000),
  coverImage: assetUrl,
  category: requiredText(100),
  prerequisites: optionalText(1000),
});

type TrainingInput = z.infer<typeof trainingSchema>;

async function checkInstructor(body: TrainingInput) {
  if (!body.instructorId) return;
  const [person] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, body.instructorId), eq(employees.isActive, true), eq(employees.hasAccount, true)));
  if (!person) throw new HttpError(400, 'مدرس انتخاب‌شده در پرتال حساب فعال ندارد.');
}

/** The calendar entry every training gets; it is kept in step with the training. */
const calendarEntryFor = (body: TrainingInput) => ({
  title: `دوره آموزشی: ${body.title}`,
  date: body.date,
  type: 'training',
  description: `مدرس: ${body.instructor}${body.instructorRole ? ` (${body.instructorRole})` : ''}`,
  time: body.time || null,
  location: body.location || null,
  badgeColor: 'bg-blue-600',
  // The training tells its own enrollees about changes.
  notify: false,
});

/**
 * Moves people from the waitlist into the free places, first come first served, and returns them.
 * Courses that already took place keep their list as it was. Call inside a transaction that locked the training.
 */
async function fillFromWaitlist(tx: Tx, training: Training) {
  if (training.date < todayJalali()) return [];
  const rows = (await tx.select().from(trainingEnrollments).where(eq(trainingEnrollments.trainingId, training.id))).sort(byJoined);
  const free = training.capacity - rows.filter((r) => r.status === 'enrolled').length;
  const promoted = rows.filter((r) => r.status === 'waitlist').slice(0, Math.max(0, free)).map((r) => r.userId);
  if (promoted.length > 0) {
    await tx
      .update(trainingEnrollments)
      .set({ status: 'enrolled' })
      .where(and(eq(trainingEnrollments.trainingId, training.id), inArray(trainingEnrollments.userId, promoted)));
  }
  return promoted;
}

const tellPromoted = (training: Training, userIds: string[]) =>
  createNotifications(userIds, {
    title: 'جای شما در دوره قطعی شد 🎓',
    message: `یک جا در دورهٔ ${describe(training)} آزاد شد و از لیست انتظار ثبت‌نام شدید. اگر نمی‌توانید بیایید، ثبت‌نام را لغو کنید تا نفر بعدی جای شما را بگیرد.`,
    type: 'training',
    linkTab: 'training',
    linkId: training.id,
  });

async function lockTraining(tx: Tx, id: string) {
  const [training] = await tx.select().from(trainings).where(eq(trainings.id, id)).for('update');
  if (!training) throw new HttpError(404, 'دوره یافت نشد.');
  return training;
}

async function loadTraining(id: string) {
  const [training] = await db.select().from(trainings).where(eq(trainings.id, id));
  if (!training) throw new HttpError(404, 'دوره یافت نشد.');
  return training;
}

trainingsRouter.post(
  '/trainings',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(trainingSchema, req.body);
    await checkInstructor(body);
    const id = newId('tr');
    await db.transaction(async (tx) => {
      await tx.insert(trainings).values({ id, ...body });
      // Every training also appears on the organization calendar.
      await tx.insert(calendarEvents).values({ id: newId('evt'), trainingId: id, ...calendarEntryFor(body) });
    });
    await audit(viewer, { action: 'create', entity: 'training', id, title: body.title, detail: `تاریخ ${toPersianDigits(body.date)}` });
    await createNotifications(await audienceIds([], viewer.id), {
      title: 'دوره آموزشی جدید 🎓',
      message: `دوره «${body.title}» برای تاریخ ${body.date} تعریف شد.`,
      type: 'training',
      linkTab: 'training',
      linkId: id,
    });
    broadcastChange('trainings');
    broadcastChange('calendar');
    res.status(201).json({ success: true, id });
  }),
);

const updateSchema = trainingSchema.extend({
  // Tell the people who signed up that the training changed (e.g. a new date or room).
  notifyEnrolled: z.boolean().default(false),
});

trainingsRouter.put(
  '/trainings/:id',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { notifyEnrolled, ...body } = parse(updateSchema, req.body);
    await checkInstructor(body);
    const { training, before, signedUp, promoted } = await db.transaction(async (tx) => {
      const existing = await lockTraining(tx, req.params.id);
      const rows = await tx.select().from(trainingEnrollments).where(eq(trainingEnrollments.trainingId, existing.id));
      const enrolled = rows.filter((r) => r.status === 'enrolled').length;
      if (body.capacity < enrolled) {
        throw new HttpError(400, `ظرفیت نمی‌تواند کمتر از تعداد ثبت‌نام‌شده‌ها (${enrolled} نفر) باشد.`);
      }
      const moved = existing.date !== body.date;
      const [updated] = await tx
        .update(trainings)
        // A new day gets its own reminder and survey.
        .set({ ...body, ...(moved ? { remindedAt: null, feedbackRequestedAt: null } : {}) })
        .where(eq(trainings.id, existing.id))
        .returning();
      const entry = calendarEntryFor(body);
      const linked = await tx.update(calendarEvents).set(entry).where(eq(calendarEvents.trainingId, existing.id)).returning({ id: calendarEvents.id });
      if (linked.length === 0) await tx.insert(calendarEvents).values({ id: newId('evt'), trainingId: existing.id, ...entry });
      // A larger capacity takes people off the waitlist.
      const promoted = await fillFromWaitlist(tx, updated);
      return { training: updated, before: existing, signedUp: rows.map((r) => r.userId), promoted };
    });
    await audit(viewer, {
      action: 'update',
      entity: 'training',
      id: training.id,
      title: training.title,
      detail: [
        before.title !== training.title ? `عنوان قبلی: ${before.title}` : '',
        before.date !== training.date ? `تاریخ: ${toPersianDigits(fromTo(before.date, training.date))}` : '',
        before.time !== training.time ? `ساعت: ${toPersianDigits(fromTo(before.time, training.time))}` : '',
        before.location !== training.location ? `مکان: ${fromTo(before.location, training.location)}` : '',
        before.capacity !== training.capacity ? `ظرفیت: ${toPersianDigits(fromTo(String(before.capacity), String(training.capacity)))}` : '',
      ].filter(Boolean).join('، '),
    });
    if (notifyEnrolled) {
      await createNotifications(
        signedUp.filter((id) => id !== viewer.id && !promoted.includes(id)),
        {
          title: 'تغییر در دورهٔ آموزشی 🎓',
          message: `مشخصات دورهٔ «${body.title}» که در آن ثبت‌نام کرده‌اید تغییر کرد. تاریخ: ${body.date}${body.time ? `، ساعت ${body.time}` : ''}${body.location ? `، ${body.location}` : ''}.`,
          type: 'training',
          linkTab: 'training',
          linkId: training.id,
        },
      );
    }
    await tellPromoted(training, promoted);
    broadcastChange('trainings');
    broadcastChange('calendar');
    res.json({ success: true });
  }),
);

trainingsRouter.delete(
  '/trainings/:id',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const signedUp = await db
      .select({ userId: trainingEnrollments.userId })
      .from(trainingEnrollments)
      .where(eq(trainingEnrollments.trainingId, req.params.id));
    // The training's calendar entry goes with it (foreign key cascade).
    const [deleted] = await db.delete(trainings).where(eq(trainings.id, req.params.id)).returning();
    if (!deleted) throw new HttpError(404, 'دوره یافت نشد.');
    await audit(viewer, {
      action: 'delete',
      entity: 'training',
      id: deleted.id,
      title: deleted.title,
      detail: `تاریخ ${toPersianDigits(deleted.date)}${signedUp.length > 0 ? `، ${toPersianDigits(signedUp.length)} ثبت‌نام` : ''}`,
    });
    if (deleted.date >= todayJalali()) {
      await createNotifications(
        signedUp.map((r) => r.userId).filter((id) => id !== viewer.id),
        { title: 'دورهٔ آموزشی لغو شد', message: `دورهٔ ${describe(deleted)} که در آن ثبت‌نام کرده بودید لغو شد.`, type: 'training', linkTab: 'training' },
      );
    }
    broadcastChange('trainings');
    broadcastChange('calendar');
    res.json({ success: true });
  }),
);

/** Who signed up and who is waiting, with attendance, for the people who run the course. */
trainingsRouter.get(
  '/trainings/:id/enrollments',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const training = await loadTraining(req.params.id);
    if (!runs(viewer, training)) throw new HttpError(403, 'دسترسی کافی ندارید');
    const rows = await db
      .select({ enrollment: trainingEnrollments, person: employees })
      .from(trainingEnrollments)
      .innerJoin(employees, eq(employees.id, trainingEnrollments.userId))
      .where(eq(trainingEnrollments.trainingId, training.id))
      .orderBy(asc(trainingEnrollments.createdAt));
    res.json(
      rows.map(({ enrollment, person }) => ({
        userId: person.id,
        name: fullName(person),
        position: person.position,
        department: person.department,
        extension: person.extension,
        enrolledAt: enrollment.createdAt.toISOString(),
        status: enrollment.status,
        attended: enrollment.attended,
      })),
    );
  }),
);

/** Removes someone from a training (e.g. they can no longer attend) and tells them; the next on the waitlist moves up. */
trainingsRouter.delete(
  '/trainings/:id/enrollments/:userId',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { training, promoted } = await db.transaction(async (tx) => {
      const training = await lockTraining(tx, req.params.id);
      const removed = await tx
        .delete(trainingEnrollments)
        .where(and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.userId, req.params.userId)))
        .returning();
      if (removed.length === 0) throw new HttpError(404, 'این همکار در دوره ثبت‌نام نکرده است.');
      return { training, promoted: await fillFromWaitlist(tx, training) };
    });
    if (req.params.userId !== viewer.id) {
      await createNotifications([req.params.userId], {
        title: 'لغو ثبت‌نام دوره',
        message: `ثبت‌نام شما در دورهٔ «${training.title}» توسط مسئول آموزش لغو شد.`,
        type: 'training',
        linkTab: 'training',
        linkId: training.id,
      });
    }
    await tellPromoted(training, promoted);
    broadcastChange('trainings');
    res.json({ success: true });
  }),
);

/** Signs up for a course, or joins its waitlist when it is full. */
trainingsRouter.post(
  '/trainings/:id/enroll',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const result = await db.transaction(async (tx) => {
      const training = await lockTraining(tx, req.params.id);
      if (training.date < todayJalali()) throw new HttpError(400, 'این دوره برگزار شده است.');
      const rows = (await tx.select().from(trainingEnrollments).where(eq(trainingEnrollments.trainingId, training.id))).sort(byJoined);
      const waitlist = rows.filter((r) => r.status === 'waitlist');
      const existing = rows.find((r) => r.userId === viewer.id);
      if (existing) return { status: existing.status, position: existing.status === 'waitlist' ? waitlist.indexOf(existing) + 1 : undefined };
      const full = rows.filter((r) => r.status === 'enrolled').length >= training.capacity;
      await tx.insert(trainingEnrollments).values({ trainingId: training.id, userId: viewer.id, status: full ? 'waitlist' : 'enrolled' });
      return full ? { status: 'waitlist' as const, position: waitlist.length + 1 } : { status: 'enrolled' as const };
    });
    broadcastChange('trainings');
    res.json(result);
  }),
);

/** Cancels one's own sign-up (or place on the waitlist); the next person waiting takes the place. */
trainingsRouter.delete(
  '/trainings/:id/enroll',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { training, promoted } = await db.transaction(async (tx) => {
      const training = await lockTraining(tx, req.params.id);
      if (training.date < todayJalali()) throw new HttpError(400, 'این دوره برگزار شده است.');
      const mine = and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.userId, viewer.id));
      const [row] = await tx.select().from(trainingEnrollments).where(mine);
      if (!row) throw new HttpError(404, 'در این دوره ثبت‌نام نکرده‌اید.');
      // Once the instructor has taken attendance the sign-up is part of the course record.
      if (row.attended !== null) throw new HttpError(400, 'حضور و غیاب شما ثبت شده است؛ برای لغو با مسئول آموزش هماهنگ کنید.');
      await tx.delete(trainingEnrollments).where(mine);
      return { training, promoted: await fillFromWaitlist(tx, training) };
    });
    await tellPromoted(training, promoted);
    broadcastChange('trainings');
    res.json({ success: true });
  }),
);

/** The instructor (or a training manager) marks who came, from the day of the course. */
trainingsRouter.put(
  '/trainings/:id/attendance',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { userId, attended } = parse(z.object({ userId: requiredText(100), attended: z.boolean().nullable() }), req.body);
    const training = await loadTraining(req.params.id);
    if (!runs(viewer, training)) throw new HttpError(403, 'دسترسی کافی ندارید');
    if (training.date > todayJalali()) throw new HttpError(400, 'حضور و غیاب از روز برگزاری دوره ثبت می‌شود.');
    const updated = await db
      .update(trainingEnrollments)
      .set({ attended })
      .where(and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.userId, userId), eq(trainingEnrollments.status, 'enrolled')))
      .returning();
    if (updated.length === 0) throw new HttpError(404, 'این همکار در دوره ثبت‌نام نکرده است.');
    broadcastChange('trainings');
    res.json({ success: true });
  }),
);

/** Handouts and slides; the course's participants are told when new ones are added. */
trainingsRouter.put(
  '/trainings/:id/materials',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { materials } = parse(z.object({ materials: z.array(attachment).max(30) }), req.body);
    const training = await loadTraining(req.params.id);
    if (!runs(viewer, training)) throw new HttpError(403, 'دسترسی کافی ندارید');
    await db.update(trainings).set({ materials }).where(eq(trainings.id, training.id));
    const before = new Set(training.materials.map((m) => m.url));
    const added = materials.filter((m) => !before.has(m.url));
    if (added.length > 0) {
      const people = await db.select().from(trainingEnrollments).where(eq(trainingEnrollments.trainingId, training.id));
      await createNotifications(
        people.filter(participates).map((p) => p.userId).filter((id) => id !== viewer.id),
        {
          title: 'جزوه و اسلاید دوره 📎',
          message: `${toPersianDigits(added.length)} فایل به دورهٔ «${training.title}» اضافه شد: ${added.map((m) => m.name).join('، ')}`,
          type: 'training',
          linkTab: 'training',
          linkId: training.id,
        },
      );
    }
    broadcastChange('trainings');
    res.json({ success: true });
  }),
);

const feedbackSchema = z.object({
  satisfaction: z.number().int().min(1).max(5),
  usefulness: z.number().int().min(1).max(5),
  comment: optionalText(2000),
});

/** The short survey after the course, for those who took part; it can be changed later. */
trainingsRouter.post(
  '/trainings/:id/feedback',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(feedbackSchema, req.body);
    const training = await loadTraining(req.params.id);
    if (training.date > todayJalali()) throw new HttpError(400, 'نظر دربارهٔ دوره بعد از برگزاری آن ثبت می‌شود.');
    const [mine] = await db
      .select()
      .from(trainingEnrollments)
      .where(and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.userId, viewer.id)));
    if (!mine || !participates(mine)) throw new HttpError(403, 'فقط شرکت‌کننده‌های دوره نظر می‌دهند.');
    await db
      .insert(trainingFeedback)
      .values({ trainingId: training.id, userId: viewer.id, ...body })
      .onConflictDoUpdate({ target: [trainingFeedback.trainingId, trainingFeedback.userId], set: { ...body, submittedAt: new Date() } });
    broadcastChange('trainings');
    res.json({ success: true });
  }),
);

const average = (values: number[]) => (values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);

/** The survey's results without names, for the people who run the course. */
trainingsRouter.get(
  '/trainings/:id/feedback',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const training = await loadTraining(req.params.id);
    if (!runs(viewer, training)) throw new HttpError(403, 'دسترسی کافی ندارید');
    const [rows, people] = await Promise.all([
      db.select().from(trainingFeedback).where(eq(trainingFeedback.trainingId, training.id)).orderBy(desc(trainingFeedback.submittedAt)),
      db.select().from(trainingEnrollments).where(eq(trainingEnrollments.trainingId, training.id)),
    ]);
    const spread = (key: 'satisfaction' | 'usefulness') => [1, 2, 3, 4, 5].map((n) => rows.filter((r) => r[key] === n).length);
    res.json({
      count: rows.length,
      participants: people.filter(participates).length,
      satisfaction: average(rows.map((r) => r.satisfaction)),
      usefulness: average(rows.map((r) => r.usefulness)),
      satisfactionSpread: spread('satisfaction'),
      usefulnessSpread: spread('usefulness'),
      comments: rows.filter((r) => r.comment).map((r) => ({ comment: r.comment, submittedAt: r.submittedAt.toISOString() })),
    });
  }),
);

/** One colleague's courses (for their own profile, and for the people who run trainings). */
trainingsRouter.get(
  '/trainings/people/:userId',
  route(async (req, res) => {
    const viewer = currentUser(req);
    if (viewer.id !== req.params.userId && !can(viewer, 'trainings.manage')) throw new HttpError(403, 'دسترسی کافی ندارید');
    const rows = await db
      .select({ training: trainings, enrollment: trainingEnrollments })
      .from(trainingEnrollments)
      .innerJoin(trainings, eq(trainings.id, trainingEnrollments.trainingId))
      .where(eq(trainingEnrollments.userId, req.params.userId))
      .orderBy(desc(trainings.date));
    const taught = await db.select().from(trainings).where(eq(trainings.instructorId, req.params.userId)).orderBy(desc(trainings.date));
    res.json({
      courses: rows.map(({ training: t, enrollment: e }) => ({
        id: t.id,
        title: t.title,
        date: t.date,
        time: t.time,
        location: t.location,
        instructor: t.instructor,
        category: t.category,
        status: e.status,
        attended: e.attended,
        materialsCount: t.materials.length,
      })),
      taught: taught.map((t) => ({ id: t.id, title: t.title, date: t.date, category: t.category })),
    });
  }),
);

/**
 * Run by the scheduler from 8 in the morning: the day before a course, a reminder to the people
 * signed up and to its instructor; the day after (or within three days, if the server was off),
 * a request for feedback to those who took part.
 */
export async function processTrainingReminders(now = new Date(), fromHour = 8) {
  if (now.getHours() < fromHour) return { reminded: 0, surveyed: 0 };
  const day = (offset: number) => moment(now).add(offset, 'day').format('jYYYY/jMM/jDD');
  let reminded = 0;
  let surveyed = 0;

  const tomorrow = await db.select().from(trainings).where(and(eq(trainings.date, day(1)), isNull(trainings.remindedAt)));
  for (const training of tomorrow) {
    const claimed = await db
      .update(trainings)
      .set({ remindedAt: now })
      .where(and(eq(trainings.id, training.id), isNull(trainings.remindedAt)))
      .returning({ id: trainings.id });
    if (claimed.length === 0) continue;
    const people = await db
      .select({ userId: trainingEnrollments.userId })
      .from(trainingEnrollments)
      .where(and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.status, 'enrolled')));
    const link = { type: 'training' as const, linkTab: 'training' as const, linkId: training.id };
    await createNotifications(people.map((p) => p.userId).filter((id) => id !== training.instructorId), {
      title: 'یادآوری: دورهٔ آموزشی فردا 🎓',
      message: `دورهٔ ${describe(training)} فردا برگزار می‌شود. اگر نمی‌توانید بیایید، ثبت‌نام را لغو کنید تا جای شما به نفر بعدی برسد.`,
      ...link,
    });
    if (training.instructorId) {
      await createNotifications([training.instructorId], {
        title: 'یادآوری: فردا دوره دارید 🎓',
        message: `دورهٔ ${describe(training)} با ${toPersianDigits(people.length)} شرکت‌کننده فردا برگزار می‌شود. حضور و غیاب را از صفحهٔ آموزش ثبت کنید.`,
        ...link,
      });
    }
    reminded++;
  }

  const finished = await db
    .select()
    .from(trainings)
    .where(and(gte(trainings.date, day(-3)), lte(trainings.date, day(-1)), isNull(trainings.feedbackRequestedAt)));
  for (const training of finished) {
    const claimed = await db
      .update(trainings)
      .set({ feedbackRequestedAt: now })
      .where(and(eq(trainings.id, training.id), isNull(trainings.feedbackRequestedAt)))
      .returning({ id: trainings.id });
    if (claimed.length === 0) continue;
    const people = await db.select().from(trainingEnrollments).where(eq(trainingEnrollments.trainingId, training.id));
    await createNotifications(people.filter(participates).map((p) => p.userId).filter((id) => id !== training.instructorId), {
      title: 'دوره چطور بود؟ 🎓',
      message: `با دو سؤال کوتاه بگویید دورهٔ «${training.title}» چطور بود.${training.materials.length > 0 ? ' جزوه و اسلایدهای دوره هم در صفحهٔ آموزش است.' : ''}`,
      type: 'training',
      linkTab: 'training',
      linkId: training.id,
    });
    surveyed++;
  }
  return { reminded, surveyed };
}
