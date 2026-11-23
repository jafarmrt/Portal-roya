import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import moment from 'moment-jalaali';
import type { SessionUser } from './auth.js';
import { db } from './db/index.js';
import { assignedTasks, customHolidays, employees, moods, personalTodos, recognitions } from './db/schema.js';
import { featureConfig } from './features.js';
import { createNotifications } from './notify.js';
import { DAY_REMINDER, DAY_REMINDER_HOURS, MY_WEEK_MOOD_DAYS, previousWeek, weekIsEmpty, type MyWeek } from '../shared/dayWeek.js';
import { featureVisible } from '../shared/features.js';
import { jalaliToDate, toJalali, todayJalali } from '../shared/jalali.js';
import type { Mood } from '../shared/mood.js';
import { occasionsFor } from '../shared/occasions.js';
import { addJalaliDays } from '../shared/todos.js';

// «هفتهٔ من» and the morning reminder of «شروع روز».

const count = sql<number>`count(*)::int`;

/**
 * The colleague's own last week (Saturday to Friday): notes ticked off, handed-over work finished,
 * recognitions given and received, and their mood on its working days. Parts hidden from them count
 * as nothing. Null for a week with nothing in it.
 */
export async function myWeek(viewer: Pick<SessionUser, 'id' | 'role'>, today = todayJalali()): Promise<MyWeek | null> {
  const { from, to } = previousWeek(today);
  const start = jalaliToDate(from)!;
  // Up to the first moment of the Saturday after.
  const end = jalaliToDate(addJalaliDays(to, 1))!;
  const config = await featureConfig();
  const sees = (key: Parameters<typeof featureVisible>[1]) => featureVisible(config, key, viewer);
  const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;

  const [notesDone, tasksDone, given, received, answers] = await Promise.all([
    sees('todos')
      ? one(db.select({ n: count }).from(personalTodos).where(and(eq(personalTodos.userId, viewer.id), gte(personalTodos.doneAt, start), lt(personalTodos.doneAt, end))))
      : 0,
    sees('tasks')
      ? one(db.select({ n: count }).from(assignedTasks).where(and(eq(assignedTasks.assigneeId, viewer.id), eq(assignedTasks.status, 'done'), gte(assignedTasks.statusAt, start), lt(assignedTasks.statusAt, end))))
      : 0,
    // Those that still stand: not taken back and not reversed. A «من هم» is a recognition too.
    sees('recognition')
      ? one(
          db
            .select({ n: count })
            .from(recognitions)
            .where(and(eq(recognitions.fromId, viewer.id), isNull(recognitions.withdrawnAt), isNull(recognitions.reversedAt), gte(recognitions.createdAt, start), lt(recognitions.createdAt, end))),
        )
      : 0,
    // Received counts once it was handed over (a recognition can still be taken back for a few minutes).
    sees('recognition')
      ? one(
          db
            .select({ n: count })
            .from(recognitions)
            .where(and(eq(recognitions.toId, viewer.id), isNull(recognitions.withdrawnAt), isNull(recognitions.reversedAt), isNotNull(recognitions.deliveredAt), gte(recognitions.deliveredAt, start), lt(recognitions.deliveredAt, end))),
        )
      : 0,
    db.select({ date: moods.date, mood: moods.mood }).from(moods).where(and(eq(moods.userId, viewer.id), gte(moods.date, from), lte(moods.date, to))),
  ]);

  const week: MyWeek = {
    from,
    to,
    notesDone,
    tasksDone,
    given,
    received,
    moods: Array.from({ length: MY_WEEK_MOOD_DAYS }, (_, i) => (answers.find((a) => a.date === addJalaliDays(from, i))?.mood as Mood | undefined) ?? null),
  };
  return weekIsEmpty(week) ? null : week;
}

/** A Friday, an official holiday, or a day the organisation marked as one. */
export async function isDayOff(now = new Date()): Promise<boolean> {
  const day = moment(now);
  if ((day.day() + 1) % 7 === 6) return true;
  const [jy, jm, jd] = [day.jYear(), day.jMonth() + 1, day.jDate()];
  const key = `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
  const [custom] = await db.select().from(customHolidays).where(eq(customHolidays.date, key));
  // The organisation's own word about a day replaces the built-in calendar.
  if (custom) return custom.isHoliday;
  return occasionsFor(jy, jm, jd).some((o) => o.holiday);
}

/**
 * The morning reminder of «شروع روز», for colleagues who switched it on for themselves: once on a
 * working morning, and only while today's mood is not in yet. Returns how many were reminded.
 */
export async function processDayStartReminders(now = new Date()) {
  const hour = now.getHours();
  if (hour < DAY_REMINDER_HOURS.from || hour >= DAY_REMINDER_HOURS.until) return 0;
  const today = toJalali(now);
  const wanting = await db
    .select({ id: employees.id, role: employees.role })
    .from(employees)
    .where(and(eq(employees.dayStartReminder, true), eq(employees.isActive, true), eq(employees.hasAccount, true), or(isNull(employees.dayStartRemindedOn), ne(employees.dayStartRemindedOn, today))));
  if (wanting.length === 0 || (await isDayOff(now))) return 0;
  const config = await featureConfig();
  const seeing = wanting.filter((p) => featureVisible(config, 'mood', p) && featureVisible(config, 'dayStart', p)).map((p) => p.id);
  if (seeing.length === 0) return 0;
  const answered = new Set((await db.select({ userId: moods.userId }).from(moods).where(and(eq(moods.date, today), inArray(moods.userId, seeing)))).map((m) => m.userId));
  const due = seeing.filter((id) => !answered.has(id));
  if (due.length === 0) return 0;
  // Claimed first, so a second tick or a restart does not remind twice.
  const claimed = await db
    .update(employees)
    .set({ dayStartRemindedOn: today })
    .where(and(inArray(employees.id, due), or(isNull(employees.dayStartRemindedOn), ne(employees.dayStartRemindedOn, today))))
    .returning({ id: employees.id });
  await createNotifications(claimed.map((c) => c.id), { ...DAY_REMINDER, type: 'dayStart', linkTab: 'dashboard' });
  return claimed.length;
}
