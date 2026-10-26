import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireManager } from '../auth.js';
import { db } from '../db/index.js';
import { calendarEvents, customHolidays } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { HttpError, newId, parse, route } from '../http.js';
import { jalaliDate, optionalText, requiredText } from '../validation.js';

export const calendarRouter = Router();

calendarRouter.get(
  '/calendar_events',
  route(async (_req, res) => {
    const rows = await db.select().from(calendarEvents).orderBy(calendarEvents.date);
    res.json(rows.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), time: e.time ?? undefined, location: e.location ?? undefined })));
  }),
);

const eventSchema = z.object({
  title: requiredText(200),
  date: jalaliDate,
  type: z.enum(['holiday', 'training', 'birthday', 'meeting', 'event']),
  description: optionalText(2000),
  time: optionalText(20),
  location: optionalText(200),
  badgeColor: optionalText(50),
});

calendarRouter.post(
  '/calendar_events',
  requireManager,
  route(async (req, res) => {
    const body = parse(eventSchema, req.body);
    const [event] = await db
      .insert(calendarEvents)
      .values({ id: newId('evt'), ...body, time: body.time || null, location: body.location || null, badgeColor: body.badgeColor || null })
      .returning();
    broadcastChange('calendar');
    res.status(201).json(event);
  }),
);

calendarRouter.delete(
  '/calendar_events/:id',
  requireManager,
  route(async (req, res) => {
    const deleted = await db.delete(calendarEvents).where(eq(calendarEvents.id, req.params.id)).returning({ id: calendarEvents.id });
    if (deleted.length === 0) throw new HttpError(404, 'رویداد یافت نشد.');
    broadcastChange('calendar');
    res.json({ success: true });
  }),
);

// Custom holidays keyed by Jalali 'YYYY-MM-DD'. An empty title hides a built-in holiday.
calendarRouter.get(
  '/holidays',
  route(async (_req, res) => {
    const rows = await db.select().from(customHolidays);
    res.json(Object.fromEntries(rows.map((h) => [h.date, { title: h.title, isHoliday: h.isHoliday }])));
  }),
);

const holidayKey = z.string().regex(/^1[34]\d{2}-\d{2}-\d{2}$/, 'کلید تاریخ نامعتبر است');
const holidaySchema = z.object({ title: optionalText(200), isHoliday: z.boolean() });

calendarRouter.put(
  '/holidays/:date',
  requireManager,
  route(async (req, res) => {
    const date = parse(holidayKey, req.params.date);
    const body = parse(holidaySchema, req.body);
    await db
      .insert(customHolidays)
      .values({ date, ...body })
      .onConflictDoUpdate({ target: customHolidays.date, set: body });
    broadcastChange('holidays');
    res.json({ success: true });
  }),
);

calendarRouter.delete(
  '/holidays/:date',
  requireManager,
  route(async (req, res) => {
    const date = parse(holidayKey, req.params.date);
    await db.delete(customHolidays).where(eq(customHolidays.date, date));
    broadcastChange('holidays');
    res.json({ success: true });
  }),
);
