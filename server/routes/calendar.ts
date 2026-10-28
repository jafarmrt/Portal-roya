import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { Router } from 'express';
import moment from 'moment-jalaali';
import { z } from 'zod';
import { inAudience } from '../../shared/audience.js';
import { todayJalali, toPersianDigits } from '../../shared/jalali.js';
import { audienceIncludes, audienceOfRow, checkAudience } from '../audience.js';
import { audit, fromTo } from '../audit.js';
import { can, requirePermission, type SessionUser } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { calendarEvents, calendarRsvps, customHolidays, employees } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { hiddenFeatures } from '../features.js';
import { HttpError, currentUser, newId, parse, route, viewerOf } from '../http.js';
import { eventToIcs } from '../ics.js';
import { audienceIdsFor, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { jalaliDate, optionalText, requiredText, timeOfDay } from '../validation.js';

export const calendarRouter = Router();

type EventRow = typeof calendarEvents.$inferSelect;

const audienceColumns = {
  departments: calendarEvents.targetDepartments,
  locations: calendarEvents.targetLocations,
  roles: calendarEvents.targetRoles,
  userIds: calendarEvents.targetUserIds,
};

/** Events this viewer may see: their audience's and their own, or all of them for calendar managers. */
function visibleTo(viewer: SessionUser | null) {
  if (viewer && can(viewer, 'calendar.manage')) return undefined;
  return viewer ? or(audienceIncludes(audienceColumns, viewer), eq(calendarEvents.createdById, viewer.id)) : audienceIncludes(audienceColumns, null);
}

async function loadVisible(id: string, viewer: SessionUser | null) {
  const [event] = await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), visibleTo(viewer)));
  if (!event) throw new HttpError(404, 'رویداد یافت نشد.');
  return event;
}

async function serializeEvents(rows: EventRow[], viewer: SessionUser | null) {
  const manager = Boolean(viewer && can(viewer, 'calendar.manage'));
  const asking = rows.filter((e) => e.rsvp).map((e) => e.id);
  const [answers, people] = await Promise.all([
    asking.length > 0 ? db.select().from(calendarRsvps).where(inArray(calendarRsvps.eventId, asking)) : [],
    manager && asking.length > 0
      ? db
          .select({ id: employees.id, department: employees.department, location: employees.location, role: employees.role })
          .from(employees)
          .where(and(eq(employees.isActive, true), eq(employees.hasAccount, true)))
      : [],
  ]);
  return rows.map((e) => {
    const audience = audienceOfRow(e);
    const replies = answers.filter((a) => a.eventId === e.id);
    const mine = viewer ? replies.find((a) => a.userId === viewer.id) : undefined;
    return {
      id: e.id,
      title: e.title,
      date: e.date,
      type: e.type,
      description: e.description,
      time: e.time ?? undefined,
      endTime: e.endTime ?? undefined,
      location: e.location ?? undefined,
      badgeColor: e.badgeColor ?? undefined,
      trainingId: e.trainingId,
      createdAt: e.createdAt.toISOString(),
      targetDepartments: e.targetDepartments,
      targetLocations: e.targetLocations,
      targetRoles: e.targetRoles,
      // Who was invited by name is for the calendar managers.
      targetUserIds: manager ? e.targetUserIds : [],
      targetUserCount: e.targetUserIds.length,
      notify: e.notify,
      rsvp: e.rsvp,
      forMe: Boolean(viewer && inAudience(viewer, audience)),
      myRsvp: mine ? mine.attending : null,
      going: e.rsvp ? replies.filter((a) => a.attending).length : undefined,
      notGoing: e.rsvp ? replies.filter((a) => !a.attending).length : undefined,
      audienceCount: manager && e.rsvp ? people.filter((p) => inAudience(p, audience)).length : undefined,
    };
  });
}

calendarRouter.get(
  '/calendar_events',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const rows = await db.select().from(calendarEvents).where(visibleTo(viewer)).orderBy(calendarEvents.date);
    // A course's sessions stay off the calendar while the training part is hidden from this person.
    const trainingHidden = (await hiddenFeatures(viewer)).has('training');
    res.json(await serializeEvents(trainingHidden ? rows.filter((e) => !e.trainingId) : rows, viewer));
  }),
);

const optionalTime = z.union([z.literal(''), timeOfDay]).optional().default('');

const eventSchema = z.object({
  title: requiredText(200),
  date: jalaliDate,
  type: z.enum(['holiday', 'training', 'birthday', 'meeting', 'event']),
  description: optionalText(2000),
  time: optionalTime,
  endTime: optionalTime,
  location: optionalText(200),
  badgeColor: optionalText(50),
  targetDepartments: z.array(requiredText(100)).max(50).default([]),
  targetLocations: z.array(requiredText(100)).max(50).default([]),
  targetRoles: z.array(requiredText(100)).max(50).default([]),
  targetUserIds: z.array(requiredText(100)).max(300).default([]),
  notify: z.boolean().default(true),
  rsvp: z.boolean().default(false),
});
type EventInput = z.infer<typeof eventSchema>;

async function checkEvent(body: EventInput) {
  if (body.endTime && !body.time) throw new HttpError(400, 'برای ساعت پایان، ساعت شروع را هم وارد کنید.');
  if (body.endTime && body.endTime <= body.time) throw new HttpError(400, 'ساعت پایان باید بعد از ساعت شروع باشد.');
  return checkAudience(body);
}

const TYPE_NAMES: Record<string, string> = { meeting: 'جلسه', event: 'رویداد', holiday: 'تعطیلی', training: 'دورهٔ آموزشی', birthday: 'تولد' };

/** "جلسهٔ ماهانه، ۱۴۰۵/۰۸/۲۰ ساعت ۱۰:۰۰ تا ۱۱:۳۰، اتاق جلسات" */
function describe(e: { title: string; date: string; time?: string | null; endTime?: string | null; location?: string | null }) {
  const when = `${e.date}${e.time ? ` ساعت ${e.time}${e.endTime ? ` تا ${e.endTime}` : ''}` : ''}`;
  return toPersianDigits(`${e.title}، ${when}${e.location ? `، ${e.location}` : ''}`);
}

const columnsOf = (body: EventInput) => ({
  title: body.title,
  date: body.date,
  type: body.type,
  description: body.description,
  time: body.time || null,
  endTime: body.endTime || null,
  location: body.location || null,
  badgeColor: body.badgeColor || null,
  notify: body.notify,
  rsvp: body.rsvp,
});

calendarRouter.post(
  '/calendar_events',
  requirePermission('calendar.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(eventSchema, req.body);
    const audience = await checkEvent(body);
    const [event] = await db
      .insert(calendarEvents)
      .values({
        id: newId('evt'),
        ...columnsOf(body),
        targetDepartments: audience.departments,
        targetLocations: audience.locations,
        targetRoles: audience.roles,
        targetUserIds: audience.userIds,
        createdById: viewer.id,
      })
      .returning();
    await audit(viewer, { action: 'create', entity: 'calendar_event', id: event.id, title: event.title, detail: `تاریخ ${toPersianDigits(event.date)}` });
    if (event.notify && event.date >= todayJalali()) {
      await createNotifications(await audienceIdsFor(audience, viewer.id), {
        title: `${TYPE_NAMES[event.type] ?? 'رویداد'} در تقویم 📅`,
        message: describe(event) + (event.rsvp ? ' — شرکت می‌کنید؟' : ''),
        type: 'calendar',
        linkTab: 'calendar',
        linkId: event.id,
      });
    }
    broadcastChange('calendar');
    const [serialized] = await serializeEvents([event], viewer);
    res.status(201).json(serialized);
  }),
);

calendarRouter.put(
  '/calendar_events/:id',
  requirePermission('calendar.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(eventSchema, req.body);
    const [existing] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, req.params.id));
    if (!existing) throw new HttpError(404, 'رویداد یافت نشد.');
    if (existing.trainingId) throw new HttpError(400, 'این رویداد از یک دورهٔ آموزشی ساخته شده است؛ خود دوره را در صفحهٔ آموزش ویرایش کنید.');
    const audience = await checkEvent(body);
    const moved = existing.date !== body.date || (existing.time ?? '') !== body.time || (existing.endTime ?? '') !== body.endTime;
    const [event] = await db
      .update(calendarEvents)
      .set({
        ...columnsOf(body),
        targetDepartments: audience.departments,
        targetLocations: audience.locations,
        targetRoles: audience.roles,
        targetUserIds: audience.userIds,
        // A new day gets its own reminder.
        ...(moved ? { remindedAt: null } : {}),
      })
      .where(eq(calendarEvents.id, existing.id))
      .returning();
    await audit(viewer, {
      action: 'update',
      entity: 'calendar_event',
      id: event.id,
      title: event.title,
      detail: [
        existing.title !== event.title ? `عنوان قبلی: ${existing.title}` : '',
        existing.date !== event.date ? `تاریخ: ${toPersianDigits(fromTo(existing.date, event.date))}` : '',
      ].filter(Boolean).join('، '),
    });
    // Announced when notifications are turned on, and again when the day or hour changes.
    const announce = event.notify && event.date >= todayJalali() && (!existing.notify || moved);
    if (announce) {
      await createNotifications(await audienceIdsFor(audience, viewer.id), {
        title: existing.notify ? `تغییر زمان ${TYPE_NAMES[event.type] ?? 'رویداد'} 📅` : `${TYPE_NAMES[event.type] ?? 'رویداد'} در تقویم 📅`,
        message: describe(event),
        type: 'calendar',
        linkTab: 'calendar',
        linkId: event.id,
      });
    }
    broadcastChange('calendar');
    const [serialized] = await serializeEvents([event], viewer);
    res.json(serialized);
  }),
);

calendarRouter.delete(
  '/calendar_events/:id',
  requirePermission('calendar.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [deleted] = await db.delete(calendarEvents).where(eq(calendarEvents.id, req.params.id)).returning();
    if (!deleted) throw new HttpError(404, 'رویداد یافت نشد.');
    await audit(viewer, { action: 'delete', entity: 'calendar_event', id: deleted.id, title: deleted.title, detail: `تاریخ ${toPersianDigits(deleted.date)}` });
    if (deleted.notify && !deleted.trainingId && deleted.date >= todayJalali()) {
      await createNotifications(await audienceIdsFor(audienceOfRow(deleted), viewer.id), {
        title: `${TYPE_NAMES[deleted.type] ?? 'رویداد'} لغو شد`,
        message: describe(deleted),
        type: 'calendar',
        linkTab: 'calendar',
      });
    }
    broadcastChange('calendar');
    res.json({ success: true });
  }),
);

/** "Attending or not", changeable until the day of the event. */
calendarRouter.post(
  '/calendar_events/:id/rsvp',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { attending } = parse(z.object({ attending: z.boolean() }), req.body);
    const event = await loadVisible(req.params.id, viewer);
    if (!event.rsvp) throw new HttpError(400, 'برای این رویداد اعلام حضور گرفته نمی‌شود.');
    if (!inAudience(viewer, audienceOfRow(event))) throw new HttpError(403, 'این رویداد برای شما نیست.');
    if (event.date < todayJalali()) throw new HttpError(400, 'این رویداد برگزار شده است.');
    await db
      .insert(calendarRsvps)
      .values({ eventId: event.id, userId: viewer.id, attending })
      .onConflictDoUpdate({ target: [calendarRsvps.eventId, calendarRsvps.userId], set: { attending, respondedAt: new Date() } });
    broadcastChange('calendar');
    const [serialized] = await serializeEvents([event], viewer);
    res.json(serialized);
  }),
);

/** Who is coming, who is not and who has not said, for the calendar managers. */
calendarRouter.get(
  '/calendar_events/:id/rsvps',
  requirePermission('calendar.manage'),
  route(async (req, res) => {
    const event = await loadVisible(req.params.id, currentUser(req));
    const audience = audienceOfRow(event);
    const [people, answers] = await Promise.all([
      db.select().from(employees).where(and(eq(employees.isActive, true), eq(employees.hasAccount, true))),
      db.select().from(calendarRsvps).where(eq(calendarRsvps.eventId, event.id)),
    ]);
    const answerOf = new Map(answers.map((a) => [a.userId, a]));
    const rows = people
      .filter((p) => inAudience(p, audience) || answerOf.has(p.id))
      .map((p) => {
        const answer = answerOf.get(p.id);
        return {
          id: p.id,
          name: fullName(p),
          department: p.department,
          location: p.location,
          attending: answer ? answer.attending : null,
          respondedAt: answer?.respondedAt.toISOString() ?? null,
        };
      })
      .sort((a, b) => a.department.localeCompare(b.department, 'fa') || a.name.localeCompare(b.name, 'fa'));
    res.json(rows);
  }),
);

/** The event as an .ics file, to add it to Outlook or a phone calendar without any outside service. */
calendarRouter.get(
  '/calendar_events/:id/ics',
  route(async (req, res) => {
    const event = await loadVisible(req.params.id, viewerOf(req));
    const ics = eventToIcs({ ...event, url: `${config.appUrl.replace(/\/$/, '')}/#calendar/${event.id}` });
    res.type('text/calendar; charset=utf-8');
    res.attachment(`${event.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'event'}.ics`);
    res.send(ics);
  }),
);

/**
 * Run by the scheduler: the day before an event, one reminder to its audience
 * (without those who said they will not come), from 8 in the morning like birthday greetings.
 * Events added that day were just announced.
 */
export async function processEventReminders(now = new Date(), fromHour = 8) {
  if (now.getHours() < fromHour) return 0;
  const tomorrow = moment(now).add(1, 'day').format('jYYYY/jMM/jDD');
  const startOfToday = moment(now).startOf('day').toDate();
  const due = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.date, tomorrow), eq(calendarEvents.notify, true), isNull(calendarEvents.remindedAt), isNull(calendarEvents.trainingId)));
  let sent = 0;
  for (const event of due) {
    const claimed = await db
      .update(calendarEvents)
      .set({ remindedAt: now })
      .where(and(eq(calendarEvents.id, event.id), isNull(calendarEvents.remindedAt)))
      .returning({ id: calendarEvents.id });
    if (claimed.length === 0 || event.createdAt >= startOfToday) continue;
    const declined = await db
      .select({ userId: calendarRsvps.userId })
      .from(calendarRsvps)
      .where(and(eq(calendarRsvps.eventId, event.id), eq(calendarRsvps.attending, false)));
    const skip = new Set(declined.map((d) => d.userId));
    await createNotifications((await audienceIdsFor(audienceOfRow(event))).filter((id) => !skip.has(id)), {
      title: event.type === 'holiday' ? 'یادآوری: فردا تعطیل است' : `یادآوری: ${TYPE_NAMES[event.type] ?? 'رویداد'} فردا 📅`,
      message: describe(event),
      type: 'calendar',
      linkTab: 'calendar',
      linkId: event.id,
    });
    sent++;
  }
  return sent;
}

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
  requirePermission('calendar.manage'),
  route(async (req, res) => {
    const date = parse(holidayKey, req.params.date);
    const body = parse(holidaySchema, req.body);
    await db
      .insert(customHolidays)
      .values({ date, ...body })
      .onConflictDoUpdate({ target: customHolidays.date, set: body });
    await audit(currentUser(req), {
      action: 'update',
      entity: 'holiday',
      id: date,
      title: toPersianDigits(date.replace(/-/g, '/')),
      detail: [body.isHoliday ? 'تعطیل' : 'غیرتعطیل', body.title].filter(Boolean).join('، '),
    });
    broadcastChange('holidays');
    res.json({ success: true });
  }),
);

calendarRouter.delete(
  '/holidays/:date',
  requirePermission('calendar.manage'),
  route(async (req, res) => {
    const date = parse(holidayKey, req.params.date);
    const deleted = await db.delete(customHolidays).where(eq(customHolidays.date, date)).returning();
    if (deleted.length > 0) {
      await audit(currentUser(req), { action: 'delete', entity: 'holiday', id: date, title: toPersianDigits(date.replace(/-/g, '/')), detail: deleted[0].title });
    }
    broadcastChange('holidays');
    res.json({ success: true });
  }),
);
