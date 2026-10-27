import { and, desc, eq, gte, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { inAudience } from '../shared/audience.js';
import { jalaliEndOfDay, jalaliMonthLabel, jalaliToDate, toPersianDigits } from '../shared/jalali.js';
import {
  departmentExtremes,
  IDLE_DAYS,
  type IdlePerson,
  type MonthlySummary,
  type NewsReport,
  type NewsReportGroup,
  type ParticipationGroup,
  type ParticipationReport,
  percentOf,
  rankItems,
} from '../shared/reports.js';
import { audienceOfRow } from './audience.js';
import { db } from './db/index.js';
import { employees, news, newsReads, pollResponses, polls, reportSummaries, trainingEnrollments, trainingFeedback, trainings } from './db/schema.js';
import { departmentList } from './departments.js';
import { HttpError } from './http.js';
import { createNotifications } from './notify.js';
import { idsWithPermission } from './roles.js';
import { audienceOf } from './routes/news.js';
import { fullName } from './serializers.js';

type Person = typeof employees.$inferSelect;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const roundedAverage = (values: number[]) => {
  const avg = average(values);
  return avg === null ? null : Math.round(avg);
};
/** One decimal, for the 1–5 course ratings. */
const ratingAverage = (values: number[]) => {
  const avg = average(values);
  return avg === null ? null : Math.round(avg * 10) / 10;
};
function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

/** The start and end of a Jalali date range, both days included. */
export function rangeOf(from: string, to: string) {
  const start = jalaliToDate(from);
  const end = jalaliEndOfDay(to);
  if (!start || !end || start > end) throw new HttpError(400, 'بازهٔ زمانی گزارش درست نیست.');
  return { start, end };
}

/** Department names in the order of the settings list, then any others people still have. */
async function orderedDepartments(names: Iterable<string>) {
  const listed = await departmentList();
  const extra = [...new Set(names)].filter((n) => n && !listed.includes(n)).sort((a, b) => a.localeCompare(b, 'fa'));
  return [...listed, ...extra];
}

interface GroupTally {
  items: Set<string>;
  audience: number;
  read: number;
  ackAudience: number;
  acknowledged: number;
  minutes: number[];
}
const emptyTally = (): GroupTally => ({ items: new Set(), audience: 0, read: 0, ackAudience: 0, acknowledged: 0, minutes: [] });
const groupOf = (name: string, t: GroupTally): NewsReportGroup => ({
  name,
  items: t.items.size,
  audience: t.audience,
  read: t.read,
  ackAudience: t.ackAudience,
  acknowledged: t.acknowledged,
  avgReadMinutes: roundedAverage(t.minutes),
  medianReadMinutes: median(t.minutes),
});

/**
 * How far the announcements published in the range reached: per item, per department of the
 * people they were meant for, per category and in total. Only reads by an item's audience count,
 * as in the item's own read list.
 */
export async function newsReport(from: string, to: string, now = new Date()): Promise<NewsReport> {
  const { start, end } = rangeOf(from, to);
  const items = await db
    .select()
    .from(news)
    .where(and(eq(news.isDraft, false), gte(news.publishAt, start), lte(news.publishAt, end < now ? end : now)))
    .orderBy(desc(news.publishAt));
  const people = await db.select().from(employees);
  const byId = new Map(people.map((p) => [p.id, p]));
  const reads = items.length > 0 ? await db.select().from(newsReads).where(inArray(newsReads.newsId, items.map((i) => i.id))) : [];
  const readsOf = new Map<string, (typeof reads)[number][]>();
  for (const r of reads) readsOf.set(r.newsId, [...(readsOf.get(r.newsId) ?? []), r]);

  const total = emptyTally();
  const departments = new Map<string, GroupTally>();
  const categories = new Map<string, GroupTally>();
  const tally = (map: Map<string, GroupTally>, key: string) => {
    if (!map.has(key)) map.set(key, emptyTally());
    return map.get(key)!;
  };

  const rows = items.map((item) => {
    const audience = audienceOf(item, people);
    const members = new Set(audience.map((p) => p.id));
    const mine = (readsOf.get(item.id) ?? []).filter((r) => members.has(r.userId));
    const minutesOf = (r: (typeof mine)[number]) => Math.max(0, Math.round((r.readAt.getTime() - item.publishAt.getTime()) / MINUTE_MS));
    const acknowledged = mine.filter((r) => r.acknowledgedAt).length;

    for (const t of [total, tally(categories, item.category)]) {
      t.items.add(item.id);
      t.audience += audience.length;
      t.read += mine.length;
      if (item.requiresAck) {
        t.ackAudience += audience.length;
        t.acknowledged += acknowledged;
      }
      t.minutes.push(...mine.map(minutesOf));
    }
    for (const person of audience) {
      const t = tally(departments, person.department);
      t.items.add(item.id);
      t.audience++;
      if (item.requiresAck) t.ackAudience++;
    }
    for (const r of mine) {
      const t = tally(departments, byId.get(r.userId)!.department);
      t.read++;
      if (item.requiresAck && r.acknowledgedAt) t.acknowledged++;
      t.minutes.push(minutesOf(r));
    }

    const author = byId.get(item.authorId);
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      author: author ? fullName(author) : '',
      publishAt: item.publishAt.toISOString(),
      requiresAck: item.requiresAck,
      audience: audience.length,
      read: mine.length,
      acknowledged,
      avgReadMinutes: roundedAverage(mine.map(minutesOf)),
    };
  });

  const departmentOrder = await orderedDepartments(departments.keys());
  return {
    items: rows,
    departments: departmentOrder.filter((d) => departments.has(d)).map((d) => groupOf(d, departments.get(d)!)),
    categories: [...categories.entries()].sort((a, b) => b[1].audience - a[1].audience).map(([name, t]) => groupOf(name, t)),
    totals: groupOf('همه', total),
  };
}

/**
 * Taking part in the polls started and the courses held in the range, per department. Only
 * colleagues in a poll's audience count towards it, as on the poll's own results.
 */
export async function participationReport(from: string, to: string, now = new Date()): Promise<ParticipationReport> {
  const { start, end } = rangeOf(from, to);
  const people = await db.select().from(employees);
  const byId = new Map(people.map((p) => [p.id, p]));
  const staff = people.filter((p) => p.isActive && p.hasAccount);

  const pollRows = await db.select().from(polls).where(and(gte(polls.createdAt, start), lte(polls.createdAt, end))).orderBy(desc(polls.createdAt));
  const responses = pollRows.length > 0
    ? await db.select({ pollId: pollResponses.pollId, userId: pollResponses.userId }).from(pollResponses).where(inArray(pollResponses.pollId, pollRows.map((p) => p.id)))
    : [];
  const courseRows = await db.select().from(trainings).where(and(gte(trainings.date, from), lte(trainings.date, to))).orderBy(desc(trainings.date));
  const courseIds = courseRows.map((t) => t.id);
  const enrollments = courseIds.length > 0 ? await db.select().from(trainingEnrollments).where(inArray(trainingEnrollments.trainingId, courseIds)) : [];
  const feedback = courseIds.length > 0 ? await db.select().from(trainingFeedback).where(inArray(trainingFeedback.trainingId, courseIds)) : [];

  const groups = new Map<string, ParticipationGroup & { people: Set<string> }>();
  const group = (name: string) => {
    if (!groups.has(name)) {
      groups.set(name, { name, staff: 0, pollAudience: 0, pollResponses: 0, trainingPeople: 0, enrollments: 0, attended: 0, absent: 0, people: new Set() });
    }
    return groups.get(name)!;
  };
  for (const p of staff) group(p.department).staff++;

  const pollList = pollRows.map((poll) => {
    const audience = staff.filter((p) => inAudience(p, audienceOfRow(poll)));
    const members = new Set(audience.map((p) => p.id));
    const answered = responses.filter((r) => r.pollId === poll.id && members.has(r.userId));
    for (const p of audience) group(p.department).pollAudience++;
    for (const r of answered) group(byId.get(r.userId)!.department).pollResponses++;
    return {
      id: poll.id,
      title: poll.title,
      createdAt: poll.createdAt.toISOString(),
      open: poll.isActive && (!poll.expiresAt || poll.expiresAt > now),
      audience: audience.length,
      responses: answered.length,
    };
  });

  const courseList = courseRows.map((course) => {
    const rows = enrollments.filter((e) => e.trainingId === course.id);
    const enrolled = rows.filter((e) => e.status === 'enrolled');
    for (const e of enrolled) {
      const person = byId.get(e.userId);
      if (!person) continue;
      const g = group(person.department);
      g.people.add(person.id);
      g.enrollments++;
      if (e.attended === true) g.attended++;
      if (e.attended === false) g.absent++;
    }
    const answers = feedback.filter((f) => f.trainingId === course.id);
    return {
      id: course.id,
      title: course.title,
      date: course.date,
      capacity: course.capacity,
      enrolled: enrolled.length,
      waitlist: rows.length - enrolled.length,
      attended: enrolled.filter((e) => e.attended === true).length,
      absent: enrolled.filter((e) => e.attended === false).length,
      feedback: answers.length,
      satisfaction: ratingAverage(answers.map((f) => f.satisfaction)),
      usefulness: ratingAverage(answers.map((f) => f.usefulness)),
    };
  });

  const order = await orderedDepartments(groups.keys());
  const departments = order
    .filter((d) => groups.has(d))
    .map((d) => {
      const { people: members, ...g } = groups.get(d)!;
      return { ...g, trainingPeople: members.size };
    })
    .filter((g) => g.staff > 0 || g.enrollments > 0 || g.pollAudience > 0);
  const sum = (key: keyof ParticipationGroup) => departments.reduce((n, g) => n + (g[key] as number), 0);
  return {
    polls: pollList,
    trainings: courseList,
    departments,
    totals: {
      name: 'همه',
      staff: sum('staff'),
      pollAudience: sum('pollAudience'),
      pollResponses: sum('pollResponses'),
      trainingPeople: sum('trainingPeople'),
      enrollments: sum('enrollments'),
      attended: sum('attended'),
      absent: sum('absent'),
      waitlist: courseList.reduce((n, c) => n + c.waitlist, 0),
      feedback: feedback.length,
      satisfaction: ratingAverage(feedback.map((f) => f.satisfaction)),
      usefulness: ratingAverage(feedback.map((f) => f.usefulness)),
    },
  };
}

/** Active colleagues with an account who have not used the portal for IDLE_DAYS, longest first. */
export async function idlePeople(now = new Date()): Promise<IdlePerson[]> {
  const cutoff = new Date(now.getTime() - IDLE_DAYS * DAY_MS);
  const rows: Person[] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.isActive, true), eq(employees.hasAccount, true), or(isNull(employees.lastSeenAt), lt(employees.lastSeenAt, cutoff))));
  return rows
    .sort((a, b) => (a.lastSeenAt?.getTime() ?? 0) - (b.lastSeenAt?.getTime() ?? 0) || a.department.localeCompare(b.department, 'fa'))
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      department: p.department,
      position: p.position,
      lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    }));
}

/** First and last day of a Jalali 'YYYY/MM' month. */
export function monthRange(month: string) {
  const first = moment(`${month}/01`, 'jYYYY/jMM/jDD');
  return { from: first.format('jYYYY/jMM/jDD'), to: first.clone().endOf('jMonth').format('jYYYY/jMM/jDD') };
}

export async function monthlySummary(month: string, now = new Date()): Promise<MonthlySummary> {
  const { from, to } = monthRange(month);
  const newsData = await newsReport(from, to, now);
  const participation = await participationReport(from, to, now);
  const { top, low } = rankItems(newsData.items, now, 1);
  const { best, worst } = departmentExtremes(newsData.departments);
  const t = newsData.totals;
  const p = participation.totals;
  const rate = (g: { read: number; audience: number }) => percentOf(g.read, g.audience) ?? 0;
  return {
    month,
    from,
    to,
    news: {
      items: t.items,
      readPercent: percentOf(t.read, t.audience),
      avgReadMinutes: t.avgReadMinutes,
      ackPercent: percentOf(t.acknowledged, t.ackAudience),
      bestDepartment: best ? { name: best.name, percent: rate(best) } : null,
      worstDepartment: worst ? { name: worst.name, percent: rate(worst) } : null,
      topItem: top[0] ? { id: top[0].id, title: top[0].title, percent: rate(top[0]) } : null,
      lowItem: low[0] ? { id: low[0].id, title: low[0].title, percent: rate(low[0]) } : null,
    },
    participation: {
      polls: participation.polls.length,
      responsePercent: percentOf(p.pollResponses, p.pollAudience),
      trainings: participation.trainings.length,
      participants: p.trainingPeople,
      attendancePercent: percentOf(p.attended, p.attended + p.absent),
      satisfaction: p.satisfaction,
    },
    idle: (await idlePeople(now)).length,
  };
}

/** Monthly summaries are made from this hour on the first of the month (server local time). */
export const SUMMARY_HOUR = 8;

/**
 * Run by the scheduler: once a month, keeps a summary of the month before and tells the people
 * who see reports. A month with nothing published is kept quietly.
 */
export async function processMonthlySummary(now = new Date()) {
  if (now.getHours() < SUMMARY_HOUR) return null;
  const month = moment(now).startOf('jMonth').subtract(1, 'day').format('jYYYY/jMM');
  const [done] = await db.select({ month: reportSummaries.month }).from(reportSummaries).where(eq(reportSummaries.month, month));
  if (done) return null;
  const data = await monthlySummary(month, now);
  const [stored] = await db.insert(reportSummaries).values({ month, data }).onConflictDoNothing().returning();
  if (!stored) return null;
  const { news: n, participation: p } = data;
  if (n.items + p.polls + p.trainings === 0) return stored;
  const parts = [
    n.items > 0 ? `${toPersianDigits(n.items)} اطلاعیه${n.readPercent !== null ? ` با ${toPersianDigits(n.readPercent)}٪ خوانده‌شدن` : ''}` : '',
    p.polls > 0 ? `${toPersianDigits(p.polls)} نظرسنجی${p.responsePercent !== null ? ` با ${toPersianDigits(p.responsePercent)}٪ مشارکت` : ''}` : '',
    p.trainings > 0 ? `${toPersianDigits(p.trainings)} دورهٔ آموزشی` : '',
  ].filter(Boolean);
  await createNotifications(await idsWithPermission('reports.view'), {
    title: `خلاصهٔ گزارش ${jalaliMonthLabel(month)} آماده است 📊`,
    message: `${parts.join('، ')}. جزئیات در صفحهٔ گزارش‌ها.`,
    type: 'system',
    linkTab: 'reports',
  });
  return stored;
}
