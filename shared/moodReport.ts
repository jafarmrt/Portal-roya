import moment from 'moment-jalaali';
import { DAY_STEP_LABELS, DAY_STEPS, type DayStepKind, type DayStepOutcome } from './dayStep.js';
import { MOOD_MIN_ANSWERS, MOOD_REASONS, MOOD_SCORE, type Mood, type MoodReason } from './mood.js';

// «حال‌وهوای سازمان» for managers: the trend, how many take part, the units, what affected the days
// and what became of the day's steps. Everything here is a total. A day with fewer than
// MOOD_MIN_ANSWERS answers is not counted anywhere, and a unit is named only when at least that many
// different colleagues of it answered: one colleague answering every day must not become "a unit".

export const MOOD_REPORT_RANGES = [
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
  { days: 365, label: '۱۲ ماه' },
] as const;
export type MoodReportDays = (typeof MOOD_REPORT_RANGES)[number]['days'];
export const isMoodReportDays = (value: number): value is MoodReportDays => MOOD_REPORT_RANGES.some((r) => r.days === value);

/** The name of the row that gathers the units too small to be named. */
export const OTHER_UNITS = 'سایر واحدها';

/** How many drops in a row raise the flag. */
export const MOOD_FALLING_DAYS = 3;
/** The flag is about now: the last counted day must be this recent. */
const FALLING_WITHIN_DAYS = 7;

/** A colleague's answer as the server reads it; the name never leaves buildMoodReport. */
export interface MoodAnswerRow {
  userId: string;
  date: string;
  mood: Mood;
  reasons: readonly string[];
  unit: string;
}

export interface MoodReportDay {
  date: string;
  answers: number;
  /** 1 («خیلی بد») to 5 («عالی»), one decimal. */
  average: number;
  /** Share of «خوب» and «عالی» in percent. */
  good: number;
  /** Answers against the colleagues who were active that day, in percent. */
  participation: number | null;
}

export interface MoodReportWeek {
  /** The Saturday the week starts on. */
  from: string;
  answers: number;
  average: number;
  good: number;
}

export interface MoodReportUnit {
  name: string;
  /** Different colleagues who answered. */
  people: number;
  answers: number;
  average: number;
  good: number;
}

export interface MoodReportReason {
  id: MoodReason;
  label: string;
  /** Times it was chosen with «خوب» or «عالی», with «بد» or «خیلی بد», and in all. */
  good: number;
  hard: number;
  total: number;
}

export interface MoodReportStep {
  kind: DayStepKind;
  label: string;
  shown: number;
  done: number;
  closed: number;
  muted: number;
  /** Share of the times it was shown that it was taken, in percent. */
  taken: number;
}

export interface MoodReport {
  from: string;
  to: string;
  days: number;
  totals: {
    /** Answers on the counted days. */
    answers: number;
    /** Days with enough answers to be counted. */
    countedDays: number;
    average: number | null;
    good: number | null;
    /** The mean of the counted days' participation. */
    participation: number | null;
    /** Active colleagues now. */
    active: number;
  };
  daily: MoodReportDay[];
  weekly: MoodReportWeek[];
  units: MoodReportUnit[];
  reasons: MoodReportReason[];
  /** The last days when the average fell three times in a row, oldest first; null otherwise. */
  falling: MoodReportDay[] | null;
  /** Of the colleagues who answered in the week four weeks ago, how many still answer this week. */
  stillAnswering: { then: number; now: number; share: number } | null;
  steps: MoodReportStep[];
}

const FORMAT = 'jYYYY/jMM/jDD';
const parse = (date: string) => moment(date, FORMAT);
const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

interface Tally {
  answers: number;
  score: number;
  good: number;
}
const tally = (): Tally => ({ answers: 0, score: 0, good: 0 });
const add = (t: Tally, mood: Mood) => {
  t.answers += 1;
  t.score += MOOD_SCORE[mood];
  if (MOOD_SCORE[mood] >= 4) t.good += 1;
};
const numbers = (t: Tally) => ({ answers: t.answers, average: round1(t.score / t.answers), good: percent(t.good, t.answers) });

/** The Saturday of the week a day is in. */
export function weekStart(date: string): string {
  const day = parse(date);
  return day.subtract((day.day() + 1) % 7, 'days').format(FORMAT);
}

/**
 * The units worth naming and one row for the rest. A unit is named when at least `min` different
 * colleagues of it answered. The rest are gathered as «سایر واحدها»; while that row itself has fewer
 * than `min` colleagues, the smallest named unit joins it, so that the small units cannot be worked
 * out by taking the named ones away from the total. With nothing left to name there is no table.
 */
export function unitRows(groups: ReadonlyMap<string, { people: ReadonlySet<string>; tally: Tally }>, min = MOOD_MIN_ANSWERS): MoodReportUnit[] {
  const named = [...groups.entries()].map(([name, g]) => ({ name, people: new Set(g.people), tally: { ...g.tally } })).sort((a, b) => b.people.size - a.people.size || a.name.localeCompare(b.name, 'fa'));
  const rest = { people: new Set<string>(), tally: tally(), any: false };
  const join = (unit: (typeof named)[number]) => {
    for (const id of unit.people) rest.people.add(id);
    rest.tally.answers += unit.tally.answers;
    rest.tally.score += unit.tally.score;
    rest.tally.good += unit.tally.good;
    rest.any = true;
  };
  while (named.length > 0 && named[named.length - 1].people.size < min) join(named.pop()!);
  while (rest.any && rest.people.size < min && named.length > 0) join(named.pop()!);
  if (named.length === 0) return [];
  const rows = named.map((u) => ({ name: u.name, people: u.people.size, ...numbers(u.tally) }));
  if (rest.any) rows.push({ name: OTHER_UNITS, people: rest.people.size, ...numbers(rest.tally) });
  return rows;
}

export interface MoodReportInput {
  from: string;
  to: string;
  days: number;
  answers: readonly MoodAnswerRow[];
  /** How many colleagues were active on a day. */
  activeOn: (date: string) => number;
  active: number;
  steps: readonly { kind: string; outcome: string; count: number }[];
}

/** The whole report from the answers of a range. Nothing in what it returns leads back to a colleague. */
export function buildMoodReport({ from, to, days, answers, activeOn, active, steps }: MoodReportInput): MoodReport {
  const perDay = new Map<string, MoodAnswerRow[]>();
  for (const row of answers) {
    if (row.date < from || row.date > to) continue;
    perDay.set(row.date, [...(perDay.get(row.date) ?? []), row]);
  }
  // Only days with enough answers are counted, here and in everything below.
  const counted = [...perDay.entries()].filter(([, rows]) => rows.length >= MOOD_MIN_ANSWERS).sort(([a], [b]) => a.localeCompare(b));

  const all = tally();
  const weeks = new Map<string, Tally>();
  const units = new Map<string, { people: Set<string>; tally: Tally }>();
  const reasons = new Map<string, { good: number; hard: number; total: number }>();
  const reasoners = new Set<string>();
  const daily: MoodReportDay[] = [];

  for (const [date, rows] of counted) {
    const day = tally();
    const week = weeks.get(weekStart(date)) ?? tally();
    weeks.set(weekStart(date), week);
    for (const row of rows) {
      add(day, row.mood);
      add(all, row.mood);
      add(week, row.mood);
      const unit = units.get(row.unit) ?? { people: new Set<string>(), tally: tally() };
      units.set(row.unit, unit);
      unit.people.add(row.userId);
      add(unit.tally, row.mood);
      const score = MOOD_SCORE[row.mood];
      for (const id of new Set(row.reasons)) {
        const r = reasons.get(id) ?? { good: 0, hard: 0, total: 0 };
        reasons.set(id, r);
        r.total += 1;
        if (score >= 4) r.good += 1;
        if (score <= 2) r.hard += 1;
        reasoners.add(row.userId);
      }
    }
    const staff = activeOn(date);
    daily.push({ date, ...numbers(day), participation: staff > 0 ? Math.min(100, percent(day.answers, staff)) : null });
  }

  const shares = daily.flatMap((d) => (d.participation === null ? [] : [d.participation]));

  // Three drops in a row over the last counted days, while they are still recent.
  let falling: MoodReportDay[] | null = null;
  const last = daily.slice(-(MOOD_FALLING_DAYS + 1));
  if (last.length === MOOD_FALLING_DAYS + 1 && last.every((d, i) => i === 0 || d.average < last[i - 1].average) && parse(to).diff(parse(last[last.length - 1].date), 'days') <= FALLING_WITHIN_DAYS) {
    falling = last;
  }

  // Of those who answered in the week that ended four weeks ago, who still answers in the last week.
  const lastWeekFrom = parse(to).subtract(6, 'days').format(FORMAT);
  const thenTo = parse(to).subtract(28, 'days').format(FORMAT);
  const thenFrom = parse(to).subtract(34, 'days').format(FORMAT);
  const then = new Set(answers.filter((a) => a.date >= thenFrom && a.date <= thenTo).map((a) => a.userId));
  const now = new Set(answers.filter((a) => a.date >= lastWeekFrom && a.date <= to && then.has(a.userId)).map((a) => a.userId));

  const stepRows = DAY_STEPS.map((kind) => {
    const of = (outcome: DayStepOutcome) => steps.filter((s) => s.kind === kind && s.outcome === outcome).reduce((sum, s) => sum + s.count, 0);
    const shown = of('shown');
    const done = of('done');
    return { kind, label: DAY_STEP_LABELS[kind], shown, done, closed: of('closed'), muted: of('muted'), taken: Math.min(100, percent(done, shown)) };
    // A kind shown only a few times says too much about too few people.
  }).filter((s) => s.shown >= MOOD_MIN_ANSWERS);

  return {
    from,
    to,
    days,
    totals: {
      answers: all.answers,
      countedDays: daily.length,
      average: all.answers ? round1(all.score / all.answers) : null,
      good: all.answers ? percent(all.good, all.answers) : null,
      participation: shares.length ? Math.round(shares.reduce((sum, n) => sum + n, 0) / shares.length) : null,
      active,
    },
    daily,
    weekly: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, t]) => ({ from: week, ...numbers(t) })),
    units: unitRows(units),
    // What affected the days is shown once enough different colleagues have said so.
    reasons:
      reasoners.size >= MOOD_MIN_ANSWERS
        ? MOOD_REASONS.map((r) => ({ id: r.id, label: r.label, ...(reasons.get(r.id) ?? { good: 0, hard: 0, total: 0 }) })).sort((a, b) => b.total - a.total)
        : [],
    falling,
    stillAnswering: then.size >= MOOD_MIN_ANSWERS ? { then: then.size, now: now.size, share: percent(now.size, then.size) } : null,
    steps: stepRows,
  };
}

const faDigits = (value: string | number) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const rating = (value: number) => faDigits(String(value).replace('.', '٫'));

/**
 * «شنیدیم»: the draft of a news item that tells colleagues what their answers added up to, with room
 * for what was done about it. Whoever publishes news edits it before it goes out.
 */
export function heardDraft(report: MoodReport, question?: { text: string; option: string; share: number } | null): { title: string; summary: string; content: string } {
  const { totals } = report;
  const range = MOOD_REPORT_RANGES.find((r) => r.days === report.days)?.label ?? `${faDigits(report.days)} روز`;
  const lines: string[] = [];
  if (totals.average !== null && totals.good !== null) lines.push(`• ${faDigits(totals.good)}٪ پاسخ‌ها «خوب» یا «عالی» بود و میانگین حال ${rating(totals.average)} از ۵.`);
  if (totals.participation !== null) lines.push(`• به‌طور میانگین هر روز ${faDigits(totals.participation)}٪ همکاران پاسخ دادند.`);
  const hard = [...report.reasons].sort((a, b) => b.hard - a.hard)[0];
  const good = [...report.reasons].sort((a, b) => b.good - a.good)[0];
  if (hard && hard.hard > 0) lines.push(`• در روزهای سخت، بیشتر از همه «${hard.label}» اثر داشت.`);
  if (good && good.good > 0) lines.push(`• در روزهای خوب، بیشتر از همه «${good.label}» اثر داشت.`);
  if (question) lines.push(`• به پرسش «${question.text}» بیشتر گفتید «${question.option}» (${faDigits(question.share)}٪).`);
  return {
    title: 'شنیدیم: حال‌وهوای این روزهای ما',
    summary: `جمع پاسخ‌های شما در «شروع روز» در ${range} گذشته، و کاری که برایش کردیم.`,
    content: [
      `در ${range} گذشته ${faDigits(totals.answers)} بار حال روزتان را در «شروع روز» گفتید. ممنون که وقت گذاشتید.`,
      '',
      'آنچه گفتید:',
      ...lines,
      '',
      'آنچه انجام دادیم:',
      '• [اینجا بنویسید چه کاری انجام شد یا در برنامه است.]',
      '',
      'پاسخ‌های شما محرمانه است. این عددها فقط جمع پاسخ‌هاست و پاسخ هیچ همکاری جداگانه دیده نمی‌شود.',
    ].join('\n'),
  };
}
