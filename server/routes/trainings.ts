import { and, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { calendarEvents, employees, trainingEnrollments, trainings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { assetUrl, jalaliDate, optionalText, requiredText } from '../validation.js';

export const trainingsRouter = Router();

async function listTrainings() {
  const [rows, enrollments] = await Promise.all([
    db.select().from(trainings).orderBy(desc(trainings.date)),
    db.select().from(trainingEnrollments),
  ]);
  return rows.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    enrolledUserIds: enrollments.filter((e) => e.trainingId === t.id).map((e) => e.userId),
  }));
}

trainingsRouter.get(
  '/trainings',
  route(async (_req, res) => {
    res.json(await listTrainings());
  }),
);

const trainingSchema = z.object({
  title: requiredText(200),
  instructor: requiredText(100),
  instructorRole: optionalText(100),
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

/** The calendar entry every training gets; it is kept in step with the training. */
const calendarEntryFor = (body: TrainingInput) => ({
  title: `دوره آموزشی: ${body.title}`,
  date: body.date,
  type: 'training',
  description: `مدرس: ${body.instructor}${body.instructorRole ? ` (${body.instructorRole})` : ''}`,
  time: body.time || null,
  location: body.location || null,
  badgeColor: 'bg-blue-600',
});

trainingsRouter.post(
  '/trainings',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(trainingSchema, req.body);
    const id = newId('tr');
    await db.transaction(async (tx) => {
      await tx.insert(trainings).values({ id, ...body });
      // Every training also appears on the organization calendar.
      await tx.insert(calendarEvents).values({ id: newId('evt'), trainingId: id, ...calendarEntryFor(body) });
    });
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
    const enrolledIds = await db.transaction(async (tx) => {
      const [training] = await tx.select().from(trainings).where(eq(trainings.id, req.params.id)).for('update');
      if (!training) throw new HttpError(404, 'دوره یافت نشد.');
      const enrolled = await tx
        .select({ userId: trainingEnrollments.userId })
        .from(trainingEnrollments)
        .where(eq(trainingEnrollments.trainingId, training.id));
      if (body.capacity < enrolled.length) {
        throw new HttpError(400, `ظرفیت نمی‌تواند کمتر از تعداد ثبت‌نام‌شده‌ها (${enrolled.length} نفر) باشد.`);
      }
      await tx.update(trainings).set(body).where(eq(trainings.id, training.id));
      const entry = calendarEntryFor(body);
      const linked = await tx.update(calendarEvents).set(entry).where(eq(calendarEvents.trainingId, training.id)).returning({ id: calendarEvents.id });
      if (linked.length === 0) await tx.insert(calendarEvents).values({ id: newId('evt'), trainingId: training.id, ...entry });
      return enrolled.map((e) => e.userId);
    });
    if (notifyEnrolled) {
      await createNotifications(enrolledIds.filter((id) => id !== viewer.id), {
        title: 'تغییر در دورهٔ آموزشی 🎓',
        message: `مشخصات دورهٔ «${body.title}» که در آن ثبت‌نام کرده‌اید تغییر کرد. تاریخ: ${body.date}${body.time ? `، ساعت ${body.time}` : ''}${body.location ? `، ${body.location}` : ''}.`,
        type: 'training',
        linkTab: 'training',
        linkId: req.params.id,
      });
    }
    broadcastChange('trainings');
    broadcastChange('calendar');
    res.json({ success: true });
  }),
);

trainingsRouter.delete(
  '/trainings/:id',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    // The training's calendar entry goes with it (foreign key cascade).
    const deleted = await db.delete(trainings).where(eq(trainings.id, req.params.id)).returning({ id: trainings.id });
    if (deleted.length === 0) throw new HttpError(404, 'دوره یافت نشد.');
    broadcastChange('trainings');
    broadcastChange('calendar');
    res.json({ success: true });
  }),
);

/** Who signed up for a training, for the people who run trainings. */
trainingsRouter.get(
  '/trainings/:id/enrollments',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const [training] = await db.select({ id: trainings.id }).from(trainings).where(eq(trainings.id, req.params.id));
    if (!training) throw new HttpError(404, 'دوره یافت نشد.');
    const rows = await db
      .select({ enrollment: trainingEnrollments, person: employees })
      .from(trainingEnrollments)
      .innerJoin(employees, eq(employees.id, trainingEnrollments.userId))
      .where(eq(trainingEnrollments.trainingId, training.id))
      .orderBy(trainingEnrollments.createdAt);
    res.json(
      rows.map(({ enrollment, person }) => ({
        userId: person.id,
        name: fullName(person),
        position: person.position,
        department: person.department,
        extension: person.extension,
        enrolledAt: enrollment.createdAt.toISOString(),
      })),
    );
  }),
);

/** Removes someone from a training (e.g. they can no longer attend) and tells them. */
trainingsRouter.delete(
  '/trainings/:id/enrollments/:userId',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [training] = await db.select().from(trainings).where(eq(trainings.id, req.params.id));
    if (!training) throw new HttpError(404, 'دوره یافت نشد.');
    const removed = await db
      .delete(trainingEnrollments)
      .where(and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.userId, req.params.userId)))
      .returning();
    if (removed.length === 0) throw new HttpError(404, 'این همکار در دوره ثبت‌نام نکرده است.');
    if (req.params.userId !== viewer.id) {
      await createNotifications([req.params.userId], {
        title: 'لغو ثبت‌نام دوره',
        message: `ثبت‌نام شما در دورهٔ «${training.title}» توسط مسئول آموزش لغو شد.`,
        type: 'training',
        linkTab: 'training',
        linkId: training.id,
      });
    }
    broadcastChange('trainings');
    res.json({ success: true });
  }),
);

trainingsRouter.post(
  '/trainings/:id/enroll',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const result = await db.transaction(async (tx) => {
      const [training] = await tx.select().from(trainings).where(eq(trainings.id, req.params.id)).for('update');
      if (!training) throw new HttpError(404, 'دوره یافت نشد.');
      const removed = await tx
        .delete(trainingEnrollments)
        .where(and(eq(trainingEnrollments.trainingId, training.id), eq(trainingEnrollments.userId, viewer.id)))
        .returning();
      if (removed.length > 0) return { enrolled: false };
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingEnrollments)
        .where(eq(trainingEnrollments.trainingId, training.id));
      if (count >= training.capacity) throw new HttpError(409, 'ظرفیت این دوره تکمیل شده است.');
      await tx.insert(trainingEnrollments).values({ trainingId: training.id, userId: viewer.id });
      return { enrolled: true };
    });
    broadcastChange('trainings');
    res.json(result);
  }),
);
