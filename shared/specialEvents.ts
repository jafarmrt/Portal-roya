import { jalaliToDate, toJalali } from './jalali.js';
import { addJalaliDays } from './todos.js';

// «رویداد ویژه»: a page for a company occasion such as Yalda night, with competitions (individual or
// team, knockout), a jury, a big screen in the hall and a phone remote for the organizers. It is built
// to be used again (Nowruz, the company's anniversary) by changing the title and the look.

/** Who sees the event: while it is a draft, only those who manage events and its organizers (the rehearsal). */
export const EVENT_STATUSES = ['draft', 'active'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_THEMES = [
  { id: 'yalda', label: 'شب یلدا' },
  { id: 'plain', label: 'ساده' },
] as const;
export type EventTheme = (typeof EVENT_THEMES)[number]['id'];

/**
 * The page moves through these on its own, from the dates the administrator set:
 * signup (competitions, teams) → brackets (the draw is public) → the program day (daytime matches,
 * then «زنده» from the program's start) → memories (champions) → ended (off the menu).
 */
export const EVENT_PHASES = [
  { id: 'signup', label: 'ثبت‌نام' },
  { id: 'brackets', label: 'قرعه و جدول' },
  { id: 'matchday', label: 'روز مسابقات' },
  { id: 'live', label: 'برنامه زنده' },
  { id: 'memories', label: 'یادگاری' },
  { id: 'ended', label: 'پایان‌یافته' },
] as const;
export type EventPhase = (typeof EVENT_PHASES)[number]['id'];

export const phaseLabel = (phase: EventPhase) => EVENT_PHASES.find((p) => p.id === phase)?.label ?? '';

export interface EventDates {
  /** Jalali day of the program. */
  programDate: string;
  /** «HH:MM» the program starts. */
  programTime: string;
  /** The last Jalali day of signup (inclusive). */
  signupEnd: string;
  /** The last Jalali day the page stays in the menu (inclusive). */
  showUntil: string;
}

/** Days before the program that signup closes, and days after it the page stays, unless changed. */
export const SIGNUP_CLOSES_DAYS_BEFORE = 3;
export const SHOW_DAYS_AFTER = 2;
/** Fewer working days than this for signup gets a warning before the event is switched on. */
export const MIN_SIGNUP_WORKDAYS = 4;

export const EVENT_TITLE_MAX = 80;
export const EVENT_TEXT_MAX = 1500;
export const COMPETITION_TITLE_MAX = 60;
export const TEAM_NAME_MAX = 40;
export const PLACE_MAX = 60;
export const OBJECTION_MAX = 500;
export const JURY_SIZES = [3, 5] as const;
export const COMPETITIONS_MAX = 20;
export const ENTRIES_MAX = 64;

/** The dates suggested for a program day: signup until three days before, two days of brackets, two days after. */
export function suggestedDates(programDate: string): Pick<EventDates, 'signupEnd' | 'showUntil'> {
  return {
    signupEnd: addJalaliDays(programDate, -SIGNUP_CLOSES_DAYS_BEFORE),
    showUntil: addJalaliDays(programDate, SHOW_DAYS_AFTER),
  };
}

/** Thursday and Friday are the weekend at the company. */
const isWorkday = (jalali: string) => {
  const date = jalaliToDate(jalali);
  if (!date) return false;
  const weekday = date.getDay(); // 4 = Thursday, 5 = Friday
  return weekday !== 4 && weekday !== 5;
};

/** Working days from `from` to `to`, both included. */
export function workdaysBetween(from: string, to: string) {
  let count = 0;
  for (let day = from, guard = 0; day <= to && guard < 400; day = addJalaliDays(day, 1), guard++) {
    if (isWorkday(day)) count++;
  }
  return count;
}

/** The moment the program starts. */
export const programStart = (dates: Pick<EventDates, 'programDate' | 'programTime'>) =>
  jalaliToDate(dates.programDate, dates.programTime) ?? new Date(NaN);

export function eventPhase(dates: EventDates, now = new Date()): EventPhase {
  const today = toJalali(now);
  if (today <= dates.signupEnd) return 'signup';
  if (today < dates.programDate) return 'brackets';
  if (today === dates.programDate) return now.getTime() < programStart(dates).getTime() ? 'matchday' : 'live';
  if (today <= dates.showUntil) return 'memories';
  return 'ended';
}

/** Whether the order of dates makes sense: signup closes before the program, the page stays until after it. */
export function datesProblem(dates: EventDates): string | null {
  if (dates.signupEnd >= dates.programDate) return 'پایان ثبت‌نام باید پیش از روز برنامه باشد.';
  if (dates.showUntil < dates.programDate) return 'صفحه باید دست‌کم تا روز برنامه بماند.';
  return null;
}

/** The jury of the whole event: an odd number of members so a vote never ties, one of them its head. */
export function juryProblem(ids: string[], headId: string | null): string | null {
  if (ids.length === 0) return null;
  if (!(JURY_SIZES as readonly number[]).includes(ids.length)) return 'هیئت داوران باید ۳ یا ۵ نفر باشد تا رأی‌گیری مساوی نشود.';
  if (new Set(ids).size !== ids.length) return 'یک نفر دو بار در هیئت داوران آمده است.';
  if (!headId || !ids.includes(headId)) return 'رئیس هیئت داوران را از میان داوران انتخاب کنید.';
  return null;
}

// ─── Competitions ────────────────────────────────────────────────────────────

export const ENTRY_KINDS = [
  { id: 'individual', label: 'فردی' },
  { id: 'team', label: 'تیمی' },
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number]['id'];

/** How a match is scored. «فقط برنده» has no numbers: the organizer picks the side that won. */
export const SCORINGS = [
  { id: 'points', label: 'امتیاز' },
  { id: 'goals', label: 'گل' },
  { id: 'winner', label: 'فقط برنده' },
] as const;
export type Scoring = (typeof SCORINGS)[number]['id'];

/** What decides a drawn match. */
export const TIE_RULES = [
  { id: 'penalties', label: 'پنالتی' },
  { id: 'extra', label: 'دور اضافه' },
  { id: 'organizer', label: 'برگزارکننده انتخاب می‌کند' },
] as const;
export type TieRule = (typeof TIE_RULES)[number]['id'];

/** Which matches are played on stage, in front of everyone, rather than during the day. */
export const STAGE_POLICIES = [
  { id: 'final', label: 'فقط فینال روی صحنه' },
  { id: 'all', label: 'همه روی صحنه' },
  { id: 'none', label: 'همه در طول روز' },
] as const;
export type StagePolicy = (typeof STAGE_POLICIES)[number]['id'];

/** Ready-made Yalda badges a team can pick instead of uploading a picture. */
export const TEAM_BADGES = ['🍉', '🍎', '🔥', '🌙', '🕯️', '⭐', '📜', '🌰', '🍇', '🦉', '☕', '🎯'] as const;
export const BADGE_PREFIX = 'emoji:';
export const isBadge = (image: string) => image.startsWith(BADGE_PREFIX);

export const scoreUnit = (scoring: Scoring) => (scoring === 'goals' ? 'گل' : scoring === 'points' ? 'امتیاز' : '');

// ─── Knockout brackets ───────────────────────────────────────────────────────

/** The smallest power of two that holds every entry (at least a final). */
export function bracketSize(entries: number) {
  let size = 2;
  while (size < entries) size *= 2;
  return size;
}

export const roundsFor = (entries: number) => Math.log2(bracketSize(entries));

/** «فینال»، «نیمه‌نهایی»، «یک‌چهارم»… counted back from the final. */
export function roundName(round: number, rounds: number, third = false) {
  if (third) return 'ردهٔ سوم';
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'فینال';
  if (fromEnd === 1) return 'نیمه‌نهایی';
  if (fromEnd === 2) return 'یک‌چهارم';
  if (fromEnd === 3) return 'یک‌هشتم';
  return `دور ${round}`;
}

/**
 * The usual seeding order of a bracket: seed 1 and 2 meet only in the final, and the empty places
 * (byes) fall on the strongest seeds, so no first-round match is empty on both sides.
 * For 8: [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((s) => [s, next - s]);
  }
  return order;
}

/** The first-round pairs of `entries` placed by draw order (entry 0 is seed 1); null is a bye. */
export function firstRoundPairs<T>(entries: T[]): [T | null, T | null][] {
  const size = bracketSize(entries.length);
  const order = seedOrder(size);
  const pairs: [T | null, T | null][] = [];
  for (let i = 0; i < size; i += 2) {
    const a = order[i] <= entries.length ? entries[order[i] - 1] : null;
    const b = order[i + 1] <= entries.length ? entries[order[i + 1] - 1] : null;
    pairs.push([a, b]);
  }
  return pairs;
}

export interface BracketMatch {
  id: string;
  round: number;
  slot: number;
  /** The match for third place, played by the two semi-final losers. */
  third: boolean;
  entryA: string | null;
  entryB: string | null;
  winnerId: string | null;
  /** True when one side had nobody (an empty place in the draw): the other goes through without playing. */
  bye: boolean;
}

export interface BracketChange {
  id: string;
  entryA: string | null;
  entryB: string | null;
  winnerId: string | null;
  bye: boolean;
  /** The result it had no longer fits (a side changed), so it is cleared. */
  cleared: boolean;
}

/**
 * Brings every later match in line with the results before it: who plays whom follows from the
 * winners of the round before, a match whose sides changed loses its result, and an empty first-round
 * place sends the other side through. Returns only the matches that change.
 */
export function settleBracket(matches: BracketMatch[]): BracketChange[] {
  const byPlace = new Map(matches.filter((m) => !m.third).map((m) => [`${m.round}:${m.slot}`, { ...m }]));
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  const changes = new Map<string, BracketChange>();
  const decided = (m: BracketMatch | undefined) =>
    m && m.winnerId && (m.winnerId === m.entryA || m.winnerId === m.entryB) ? m.winnerId : null;
  const loser = (m: BracketMatch | undefined) => {
    const w = decided(m);
    if (!m || !w || m.bye) return null;
    return w === m.entryA ? m.entryB : m.entryA;
  };

  const settle = (m: BracketMatch, entryA: string | null, entryB: string | null, firstRound: boolean) => {
    const original = matches.find((x) => x.id === m.id)!;
    let { winnerId, bye } = m;
    let cleared = false;
    if (entryA !== m.entryA || entryB !== m.entryB) {
      if (winnerId) cleared = true;
      winnerId = null;
      bye = false;
    }
    if (firstRound && (entryA === null) !== (entryB === null)) {
      // One empty place: the other side goes through.
      winnerId = entryA ?? entryB;
      bye = true;
      cleared = false;
    } else if (bye && entryA && entryB) {
      bye = false;
      winnerId = null;
    }
    if (winnerId && winnerId !== entryA && winnerId !== entryB) {
      winnerId = null;
      cleared = true;
    }
    Object.assign(m, { entryA, entryB, winnerId, bye });
    if (
      original.entryA !== entryA ||
      original.entryB !== entryB ||
      original.winnerId !== winnerId ||
      original.bye !== bye
    ) {
      changes.set(m.id, { id: m.id, entryA, entryB, winnerId, bye, cleared });
    }
  };

  for (let round = 1; round <= rounds; round++) {
    const inRound = [...byPlace.values()].filter((m) => m.round === round).sort((a, b) => a.slot - b.slot);
    for (const m of inRound) {
      if (round === 1) {
        settle(m, m.entryA, m.entryB, true);
        continue;
      }
      const left = byPlace.get(`${round - 1}:${m.slot * 2}`);
      const right = byPlace.get(`${round - 1}:${m.slot * 2 + 1}`);
      settle(m, decided(left) ?? null, decided(right) ?? null, false);
    }
  }
  const third = matches.find((m) => m.third);
  if (third && rounds >= 2) {
    const copy = { ...third };
    settle(copy, loser(byPlace.get(`${rounds - 1}:0`)), loser(byPlace.get(`${rounds - 1}:1`)), false);
  }
  return [...changes.values()];
}

/** The winner of the final, once it is played. */
export function championOf(matches: Pick<BracketMatch, 'round' | 'third' | 'winnerId'>[]) {
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  return matches.find((m) => m.round === rounds && !m.third)?.winnerId ?? null;
}

// ─── The big screen ──────────────────────────────────────────────────────────

/** What the big screen in the hall shows; the organizers switch it from their phones. */
export const SCREEN_SCENES = [
  { id: 'welcome', label: 'خوش‌آمد' },
  { id: 'jury', label: 'معرفی داوران' },
  { id: 'bracket', label: 'جدول' },
  { id: 'match', label: 'بازی روی صحنه' },
  { id: 'today', label: 'بازی‌های امروز' },
  { id: 'champion', label: 'قهرمان' },
  { id: 'break', label: 'استراحت' },
] as const;
export type ScreenScene = (typeof SCREEN_SCENES)[number]['id'];

export interface ScreenTimer {
  /** Seconds the timer runs for. */
  durationSec: number;
  /** While running: when it reaches zero (ISO), worked out from the server's clock. */
  endsAt: string | null;
  /** While stopped: seconds left. */
  remainingSec: number;
}

export interface ScreenState {
  scene: ScreenScene;
  competitionId: string | null;
  matchId: string | null;
  /** A short line under the scene, e.g. «۱۰ دقیقه استراحت». */
  caption: string;
  timer: ScreenTimer;
  /** Changes with every switch, so a screen knows to play the switch sound. */
  version: number;
}

export const DEFAULT_SCREEN: ScreenState = {
  scene: 'welcome',
  competitionId: null,
  matchId: null,
  caption: '',
  timer: { durationSec: 120, endsAt: null, remainingSec: 120 },
  version: 0,
};

/** Seconds left on a timer at `now`. */
export function timerLeft(timer: ScreenTimer, now = Date.now()) {
  if (!timer.endsAt) return Math.max(0, timer.remainingSec);
  return Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000));
}

/** A code that pairs a big screen lasts this long before a new one is shown. */
export const SCREEN_CODE_MINUTES = 15;
/** A paired screen keeps working this long without being opened again (the whole program day and more). */
export const SCREEN_SESSION_HOURS = 36;

/** Minutes before a daytime match its players are reminded, and after its slot that a missing result is chased. */
export const MATCH_REMIND_MINUTES = 30;
export const RESULT_OVERDUE_MINUTES = 10;
/** Minutes before the program everyone is reminded. */
export const PROGRAM_REMIND_MINUTES = 15;
/** A result just entered can be taken back this long by the one who entered it. */
export const RESULT_UNDO_MS = 10_000;
