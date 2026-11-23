import { isGoodMood, type Mood } from './mood.js';

// «یک قدم برای امروز»: after the day's mood, one practical step that leads into another part of the
// portal. Which one is decided from what really waits for the colleague, never at random, and it is
// decided in the browser: the server never learns which step went with which mood.

/** The steps, in the order they are tried. */
export const DAY_STEPS = ['care', 'acks', 'tasksWaiting', 'overdue', 'plan', 'thanks', 'poll', 'training', 'coins'] as const;
export type DayStepKind = (typeof DAY_STEPS)[number];

/** How each step is called where a colleague switches it off, and in the numbers of «شروع روز». */
export const DAY_STEP_LABELS: Record<DayStepKind, string> = {
  care: 'پیام ناشناس در روز سخت',
  acks: 'بخشنامهٔ تأییدنشده',
  tasksWaiting: 'کار ارجاعی منتظر پاسخ',
  overdue: 'یادداشت‌های مانده',
  plan: 'سه کار امروز',
  thanks: 'قدردانی از یک همکار',
  poll: 'نظرسنجی باز',
  training: 'دورهٔ این هفته',
  coins: 'سکه‌های مانده',
};

/**
 * The order the steps are tried in: what whoever looks after «شروع روز» saved, cleaned of unknown and
 * repeated kinds, with the kinds it does not mention after it in the built-in order. The quiet step
 * of a hard day is not part of the order: on such a day it is the only one.
 */
export function dayStepOrder(saved: readonly string[] = []): DayStepKind[] {
  const seen = new Set<string>();
  return [...saved, ...DAY_STEPS].filter((kind): kind is DayStepKind => DAY_STEPS.includes(kind as DayStepKind) && !seen.has(kind) && Boolean(seen.add(kind)));
}

/** What the portal itself asks of the colleague; these may come back day after day. */
export const DAY_STEPS_EVERY_DAY: readonly DayStepKind[] = ['acks', 'tasksWaiting'];

/** What is counted beside the steps, in the same anonymous way: the afternoon wrap-up of the day's notes. */
export const DAY_COUNT_KINDS = [...DAY_STEPS, 'wrap'] as const;
export type DayCountKind = (typeof DAY_COUNT_KINDS)[number];
export const DAY_COUNT_LABELS: Record<DayCountKind, string> = { ...DAY_STEP_LABELS, wrap: 'جمع‌بندی عصر' };

export const DAY_STEP_OUTCOMES = ['shown', 'done', 'closed', 'muted'] as const;
export type DayStepOutcome = (typeof DAY_STEP_OUTCOMES)[number];

/** How many notes «سه کار امروز» takes, and how many waiting things a step lists before «و … دیگر». */
export const DAY_PLAN_NOTES = 3;
export const DAY_STEP_LIST = 3;

/** «سه کار امروز» is a morning question: from 5 until noon. */
const PLANNING_FROM = 5;
export const isPlanningTime = (hour: number) => hour >= PLANNING_FROM && hour < 12;

/** The last working day of the week (Saturday is 0), when unspent coins are mentioned. */
export const WEEK_END_DAY = 4;

export interface DayStepFacts {
  mood: Mood;
  /** 0–23, on the colleague's clock. */
  hour: number;
  /** Saturday is 0, Friday 6. */
  weekday: number;
  /** Circulars waiting for the colleague's confirmation. */
  pendingAcks: number;
  /** «کارهای ارجاعی» handed to the colleague and not answered; 0 where the part is hidden. */
  tasksWaiting: number;
  /** «یادداشت‌های من» is open for the colleague. */
  notes: boolean;
  /** Open notes due before today. */
  overdueNotes: number;
  /** Open notes due today. */
  notesToday: number;
  /** A suggestion box is open for the colleague. */
  suggestions: boolean;
  /** Coins left to give this month; 0 where «سپاس» is hidden. */
  coinsLeft: number;
  /** Open surveys the colleague has not answered; 0 where the part is hidden. */
  openPolls: number;
  /** A course in the coming week the colleague has not signed up for; false where the part is hidden. */
  trainingSoon: boolean;
}

/** The steps whose condition holds today, in order. On a hard day only the gentle one, never work. */
export function eligibleSteps(f: DayStepFacts, order: readonly DayStepKind[] = DAY_STEPS): DayStepKind[] {
  if (!isGoodMood(f.mood) && f.mood !== 'معمولی') return f.suggestions ? ['care'] : [];
  const holds: Record<DayStepKind, boolean> = {
    care: false,
    acks: f.pendingAcks > 0,
    tasksWaiting: f.tasksWaiting > 0,
    overdue: f.notes && f.overdueNotes > 0,
    plan: f.notes && isPlanningTime(f.hour) && f.notesToday === 0,
    thanks: isGoodMood(f.mood) && f.coinsLeft > 0,
    poll: f.openPolls > 0,
    training: f.trainingSoon,
    coins: f.weekday === WEEK_END_DAY && f.coinsLeft > 0,
  };
  return order.filter((kind) => holds[kind]);
}

/** What the browser remembers for a colleague: the kinds they switched off, and the last step shown. */
export interface DayStepMemory {
  muted: DayStepKind[];
  last: { date: string; kind: DayStepKind; state: 'open' | 'done' | 'closed' } | null;
}

export const NO_STEP_MEMORY: DayStepMemory = { muted: [], last: null };

/**
 * Today's step, or null for none. One step a day: once it is taken or closed nothing else comes that
 * day, and the step chosen in the morning stays the day's step while its condition holds. A kind that
 * was shown on the last day and not taken does not come back the next time (so nobody is asked the
 * same thing day after day), except what the portal itself is waiting for.
 */
export function pickStep(f: DayStepFacts, memory: DayStepMemory, today: string, order: readonly DayStepKind[] = DAY_STEPS): DayStepKind | null {
  const last = memory.last;
  if (last?.date === today) {
    if (last.state !== 'open' || memory.muted.includes(last.kind)) return null;
    // «سه کار امروز» begun in the morning is not taken away from under the colleague's hands at noon.
    const still = eligibleSteps(last.kind === 'plan' ? { ...f, hour: PLANNING_FROM } : f, order);
    if (still.includes(last.kind)) return last.kind;
    // A day that turned hard after its step was chosen: the quiet line takes the step's place.
    return still[0] === 'care' && !memory.muted.includes('care') ? 'care' : null;
  }
  const eligible = eligibleSteps(f, order).filter((kind) => !memory.muted.includes(kind));
  const ignored = last && last.state !== 'done' && !DAY_STEPS_EVERY_DAY.includes(last.kind) ? last.kind : null;
  return eligible.find((kind) => kind !== ignored) ?? null;
}

/** Cleans what was read from the browser's storage. */
export function readStepMemory(value: unknown): DayStepMemory {
  if (!value || typeof value !== 'object') return NO_STEP_MEMORY;
  const { muted, last } = value as { muted?: unknown; last?: { date?: unknown; kind?: unknown; state?: unknown } | null };
  const isKind = (k: unknown): k is DayStepKind => DAY_STEPS.includes(k as DayStepKind);
  const ok = last && typeof last.date === 'string' && isKind(last.kind) && (last.state === 'open' || last.state === 'done' || last.state === 'closed');
  return {
    muted: Array.isArray(muted) ? muted.filter(isKind) : [],
    last: ok ? { date: last.date as string, kind: last.kind as DayStepKind, state: last.state as 'open' | 'done' | 'closed' } : null,
  };
}
