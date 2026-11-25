import { and, eq, gte, lte } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { db } from './db/index.js';
import { dayStepCounts, employees, moods } from './db/schema.js';
import { toJalali, todayJalali } from '../shared/jalali.js';
import { MOOD_VALUES, type Mood } from '../shared/mood.js';
import { buildMoodReport, type MoodReport, type MoodReportDays } from '../shared/moodReport.js';

// The managers' mood report, read from the answers of a range and worked out in shared/moodReport.ts.

const FORMAT = 'jYYYY/jMM/jDD';
const NO_UNIT = 'بدون واحد';

// The report reads a year of answers at most; it is the same for every manager, so it is kept for a minute.
const TTL_MS = 60_000;
const cache = new Map<number, { at: number; date: string; report: MoodReport }>();

export function clearMoodReportCache() {
  cache.clear();
}

export async function moodReport(days: MoodReportDays): Promise<MoodReport> {
  const to = todayJalali();
  const kept = cache.get(days);
  if (kept && kept.date === to && Date.now() - kept.at < TTL_MS) return kept.report;
  const from = moment().subtract(days - 1, 'days').format(FORMAT);
  // A few days before the range too, for «هنوز پاسخ می‌دهند» in the shortest range.
  const readFrom = moment().subtract(Math.max(days, 35) - 1, 'days').format(FORMAT);
  const [rows, people, steps] = await Promise.all([
    db
      .select({ userId: moods.userId, date: moods.date, mood: moods.mood, reasons: moods.reasons, unit: employees.department })
      .from(moods)
      .innerJoin(employees, eq(employees.id, moods.userId))
      .where(and(gte(moods.date, readFrom), lte(moods.date, to))),
    db.select({ createdAt: employees.createdAt }).from(employees).where(eq(employees.isActive, true)),
    db.select().from(dayStepCounts).where(and(gte(dayStepCounts.date, from), lte(dayStepCounts.date, to))),
  ]);
  const since = people.map((p) => toJalali(p.createdAt)).sort();
  const report = buildMoodReport({
    from,
    to,
    days,
    answers: rows.filter((r) => (MOOD_VALUES as readonly string[]).includes(r.mood)).map((r) => ({ ...r, mood: r.mood as Mood, unit: r.unit?.trim() || NO_UNIT })),
    // Colleagues who are active now and had already joined by that day.
    activeOn: (date) => since.filter((joined) => joined <= date).length,
    active: people.length,
    steps,
  });
  cache.set(days, { at: Date.now(), date: to, report });
  return report;
}
