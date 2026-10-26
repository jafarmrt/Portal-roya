import { and, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { calendarEvents, trainingEnrollments, trainings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
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
      await tx.insert(calendarEvents).values({
        id: newId('evt'),
        title: `دوره آموزشی: ${body.title}`,
        date: body.date,
        type: 'training',
        description: `مدرس: ${body.instructor}${body.instructorRole ? ` (${body.instructorRole})` : ''}`,
        time: body.time || null,
        location: body.location || null,
        badgeColor: 'bg-blue-600',
      });
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

trainingsRouter.delete(
  '/trainings/:id',
  requirePermission('trainings.manage'),
  route(async (req, res) => {
    const deleted = await db.delete(trainings).where(eq(trainings.id, req.params.id)).returning({ id: trainings.id });
    if (deleted.length === 0) throw new HttpError(404, 'دوره یافت نشد.');
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
