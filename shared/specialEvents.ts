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

// ─── Competition formats: knockout, points table, ranking ────────────────────

/**
 * «حذفی»: the loser is out. «جدول امتیازی»: everyone plays everyone once, a win is worth 3 points and a
 * draw 1. «رتبه‌بندی»: each entry performs on its own (a quiz, a race, the fastest to peel a pomegranate)
 * and the best score or time wins.
 */
export const FORMATS = [
  { id: 'knockout', label: 'حذفی' },
  { id: 'league', label: 'جدول امتیازی' },
  { id: 'ranking', label: 'رتبه‌بندی' },
] as const;
export type Format = (typeof FORMATS)[number]['id'];

/** What wins a ranking: the highest score, or the shortest time. */
export const RANK_BY = [
  { id: 'high', label: 'امتیاز بیشتر' },
  { id: 'time', label: 'زمان کمتر' },
] as const;
export type RankBy = (typeof RANK_BY)[number]['id'];

/** Everyone plays everyone: 10 entries are already 45 matches. */
export const LEAGUE_MAX = 10;
export const LEAGUE_POINTS = { win: 3, draw: 1 } as const;
/** A ranking's value: a score, or a time in tenths of a second (up to about 2:46:40). */
export const RANK_VALUE_MAX = 99_999;

/** Which stage policies make sense for a format: a points table or a ranking has no final. */
export const stagePoliciesFor = (format: Format) => (format === 'knockout' ? STAGE_POLICIES : STAGE_POLICIES.filter((p) => p.id !== 'final'));

/**
 * The rounds of a points table by the circle method: in each round everyone plays once (one sits out
 * when the number is odd), and over all rounds everyone meets everyone exactly once.
 */
export function roundRobin<T>(entries: T[]): [T, T][][] {
  const list: (T | null)[] = [...entries];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === null || b === null) continue;
      // Alternate sides so nobody is always «first».
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Keep the first in place and turn the rest one step.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export interface LeagueResult {
  entryA: string | null;
  entryB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  /** A result was recorded (a draw has no winner). */
  done: boolean;
}

export interface StandingRow {
  entryId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  points: number;
  /** Equal rows share a rank (۱، ۲، ۲، ۴). */
  rank: number;
}

/**
 * The points table: points, then goal difference and goals scored (when there are scores), then the
 * matches between those still level. Rows still level after that share their rank.
 */
export function leagueTable(entryIds: string[], matches: LeagueResult[], headToHead = true): StandingRow[] {
  const rows = new Map<string, StandingRow>(entryIds.map((id) => [id, { entryId: id, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, points: 0, rank: 0 }]));
  const played = matches.filter((m) => m.done && m.entryA && m.entryB && rows.has(m.entryA) && rows.has(m.entryB));
  for (const m of played) {
    const a = rows.get(m.entryA!)!;
    const b = rows.get(m.entryB!)!;
    a.played++;
    b.played++;
    a.scored += m.scoreA ?? 0;
    a.conceded += m.scoreB ?? 0;
    b.scored += m.scoreB ?? 0;
    b.conceded += m.scoreA ?? 0;
    if (!m.winnerId) {
      a.drawn++;
      b.drawn++;
      a.points += LEAGUE_POINTS.draw;
      b.points += LEAGUE_POINTS.draw;
    } else {
      const [w, l] = m.winnerId === m.entryA ? [a, b] : [b, a];
      w.won++;
      l.lost++;
      w.points += LEAGUE_POINTS.win;
    }
  }
  const key = (r: StandingRow) => [r.points, r.scored - r.conceded, r.scored];
  const compare = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  };
  const sorted = [...rows.values()].sort((x, y) => compare(key(x), key(y)));
  // Rows level on all of that: the matches among them decide, else they share the rank.
  const result: StandingRow[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && compare(key(sorted[i]), key(sorted[j])) === 0) j++;
    const group = sorted.slice(i, j);
    if (group.length === 1 || !headToHead) {
      for (const row of group) result.push({ ...row, rank: i + 1 });
    } else {
      const ids = new Set(group.map((g) => g.entryId));
      const mini = leagueTable(
        [...ids],
        played.filter((m) => ids.has(m.entryA!) && ids.has(m.entryB!)),
        false,
      );
      const separates = mini.some((r) => r.rank !== 1);
      const order = separates ? mini : group.map((g) => ({ entryId: g.entryId, rank: 1 }));
      for (const r of order) {
        const row = group.find((g) => g.entryId === r.entryId)!;
        result.push({ ...row, rank: i + r.rank });
      }
    }
    i = j;
  }
  return result;
}

export interface Performance {
  entryId: string;
  value: number | null;
  done: boolean;
}

export interface RankRow {
  entryId: string;
  value: number | null;
  /** null: not performed yet, or did not come. */
  rank: number | null;
  absent: boolean;
}

/** The ranking: the best value first, equal values share a rank; the absent and those yet to perform after. */
export function rankingTable(performances: Performance[], rankBy: RankBy): RankRow[] {
  const valued = performances.filter((p) => p.done && p.value !== null);
  valued.sort((a, b) => (rankBy === 'time' ? a.value! - b.value! : b.value! - a.value!));
  const rows: RankRow[] = valued.map((p, i) => ({ entryId: p.entryId, value: p.value, rank: i + 1, absent: false }));
  for (let i = 1; i < rows.length; i++) if (rows[i].value === rows[i - 1].value) rows[i].rank = rows[i - 1].rank;
  for (const p of performances) {
    if (p.done && p.value === null) rows.push({ entryId: p.entryId, value: null, rank: null, absent: true });
  }
  for (const p of performances) if (!p.done) rows.push({ entryId: p.entryId, value: null, rank: null, absent: false });
  return rows;
}

/**
 * The champion of a points table or a ranking, once everything is played: the one ranked first, or,
 * when several share first place, the one the organizers or jury picked among them (`pick`).
 */
export function tableChampion(rows: { entryId: string; rank: number | null }[], allDone: boolean, pick: string | null) {
  if (!allDone) return { champion: null as string | null, tie: [] as string[] };
  const first = rows.filter((r) => r.rank === 1).map((r) => r.entryId);
  if (first.length === 1) return { champion: first[0], tie: [] };
  if (first.length === 0) return { champion: null, tie: [] };
  if (pick && first.includes(pick)) return { champion: pick, tie: [] };
  return { champion: null, tie: first };
}

/** «۱:۰۵٫۳» for a time in tenths of a second; a plain number for a score. */
export function formatRankValue(value: number | null, rankBy: RankBy) {
  if (value === null) return '';
  if (rankBy !== 'time') return toPersianNumber(String(value));
  const tenths = value % 10;
  const seconds = Math.floor(value / 10);
  const minutes = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(minutes > 0 ? 2 : 1, '0');
  return toPersianNumber(`${minutes > 0 ? `${minutes}:` : ''}${ss}.${tenths}`).replace('.', '٫');
}

const toPersianNumber = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** «۱:۰۵.۳»، «65.3» or «65» (Persian or Latin digits) → tenths of a second; null if it is not a time. */
export function parseRankTime(text: string): number | null {
  const latin = text
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫,/]/g, '.');
  const m = /^(?:(\d{1,3}):)?(\d{1,4})(?:\.(\d))?$/.exec(latin);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0);
  const seconds = Number(m[2]);
  if (m[1] !== undefined && seconds >= 60) return null;
  const value = (minutes * 60 + seconds) * 10 + Number(m[3] ?? 0);
  return value <= RANK_VALUE_MAX ? value : null;
}

/** The words of a pantomime (or another guessing game), one per line, without repeats. */
export const WORDS_MAX = 300;
export const WORD_MAX = 60;
export function cleanWords(text: string | string[]) {
  const lines = (Array.isArray(text) ? text : text.split(/\r?\n/)).map((w) => w.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return [...new Set(lines)].slice(0, WORDS_MAX).map((w) => w.slice(0, WORD_MAX));
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
  { id: 'schedule', label: 'برنامهٔ امشب' },
  { id: 'envelope', label: 'پاکت انتخاب‌ها' },
  { id: 'fal', label: 'فال حافظ' },
  { id: 'quiz', label: 'سؤال مسابقهٔ همه' },
  { id: 'quizboard', label: 'جدول مسابقهٔ همه' },
  { id: 'predictors', label: 'بهترین پیش‌بین‌ها' },
  { id: 'wishes', label: 'آرزوهای یلدا' },
  { id: 'wheel', label: 'گردونهٔ شانس' },
  { id: 'guess', label: 'چند دانه؟' },
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
  /** The song playing now, shown in a strip at the bottom of every scene (absent in older saved states). */
  songId?: string | null;
  /** The award whose envelope is on the screen (scene «envelope»). */
  awardId?: string | null;
  /** The verse of «فال حافظ» on the screen (an index in HAFEZ_FAL). */
  falIndex?: number | null;
  /** Changes with every switch, so a screen knows to play the switch sound. */
  version: number;
}

export const DEFAULT_SCREEN: ScreenState = {
  scene: 'welcome',
  competitionId: null,
  matchId: null,
  caption: '',
  timer: { durationSec: 120, endsAt: null, remainingSec: 120 },
  songId: null,
  awardId: null,
  falIndex: null,
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

// ─── «انتخاب‌های یلدا»: nominations and the jury's choice ─────────────────────
//
// Each category (خوش‌تیپ‌ترین، همیشه پایه…) is nominated by colleagues during signup; the three most
// nominated make its shortlist the morning after signup closes, and each of them may step down that day.
// The shortlist is shown to everyone the next day, the jury votes in secret until noon of the program
// day, and nobody (the portal's administrator included) sees a winner until it is opened on stage.

export const AWARDS_MAX = 12;
export const AWARD_TITLE_MAX = 60;
export const NOMINATION_REASON_MAX = 200;
export const AWARD_NOTE_MAX = 200;
/** Colleagues on each category's shortlist (the most nominated). */
export const SHORTLIST_SIZE = 3;
export const AWARD_ICONS = ['🏅', '😎', '😄', '🤝', '🌅', '☕', '💡', '🎨', '🧹', '📚', '🎤', '🌟'] as const;

export interface AwardTimes {
  /** The shortlist is made and its colleagues are told (they may step down until it is published). */
  shortlistAt: Date;
  /** Everyone sees the shortlist; the jury votes from now. */
  publishAt: Date;
  /** The jury's votes close and the winners are worked out. */
  voteDeadline: Date;
}

/** When each step of the nominations happens, from the event's dates. */
export function awardTimes(dates: Pick<EventDates, 'signupEnd' | 'programDate' | 'programTime'>): AwardTimes {
  const day1 = addJalaliDays(dates.signupEnd, 1);
  const shortlistAt = jalaliToDate(day1, '08:00') ?? new Date(NaN);
  const publishAt =
    day1 >= dates.programDate ? new Date(shortlistAt.getTime() + 2 * 3600_000) : (jalaliToDate(addJalaliDays(day1, 1), '00:00') ?? new Date(NaN));
  const noon = jalaliToDate(dates.programDate, '12:00') ?? new Date(NaN);
  const start = programStart(dates);
  const voteDeadline = noon.getTime() > publishAt.getTime() ? noon : start.getTime() > publishAt.getTime() ? start : new Date(publishAt.getTime() + 2 * 3600_000);
  return { shortlistAt, publishAt, voteDeadline };
}

export type AwardStage = 'nominating' | 'shortlisting' | 'voting' | 'counting' | 'decided' | 'revealed';

export const AWARD_STAGE_LABEL: Record<AwardStage, string> = {
  nominating: 'معرفی نامزد',
  shortlisting: 'فهرست نامزدها آماده می‌شود',
  voting: 'رأی داوران',
  counting: 'منتظر تصمیم رئیس هیئت',
  decided: 'برنده معلوم شده؛ روی صحنه اعلام می‌شود',
  revealed: 'اعلام شد',
};

/**
 * Picks the winners of the categories in order. Each colleague wins at most one title: one who already
 * won an earlier category is passed over. The most votes win; a tie goes to the head of the jury's vote
 * when it is one of the tied, else the head decides (`tie`). A category waiting for that decision holds
 * back the ones after it, since its winner may be on their shortlists too.
 */
export interface AwardCount {
  id: string;
  /** Colleagues still on the shortlist, in its order. */
  nominees: string[];
  /** The vote of each juror: juror → nominee. */
  votes: Record<string, string>;
  /** Already picked by the head after a tie. */
  picked: string | null;
}

/** `waiting`: held back by a tie in an earlier category; `tie`: the head of the jury picks among these. */
export type AwardOutcome = { id: string; winner: string | null; tie: string[]; waiting: boolean };

export function countAwards(awards: AwardCount[], headId: string | null): AwardOutcome[] {
  const won = new Set<string>();
  const outcomes: AwardOutcome[] = [];
  for (const award of awards) {
    const candidates = award.nominees.filter((n) => !won.has(n));
    if (candidates.length === 0) {
      outcomes.push({ id: award.id, winner: null, tie: [], waiting: false });
      continue;
    }
    if (award.picked && candidates.includes(award.picked)) {
      won.add(award.picked);
      outcomes.push({ id: award.id, winner: award.picked, tie: [], waiting: false });
      continue;
    }
    const counts = new Map(candidates.map((c) => [c, 0]));
    for (const nominee of Object.values(award.votes)) if (counts.has(nominee)) counts.set(nominee, counts.get(nominee)! + 1);
    const top = Math.max(...counts.values());
    const tied = candidates.filter((c) => counts.get(c) === top);
    const headVote = headId ? award.votes[headId] : undefined;
    const winner = tied.length === 1 ? tied[0] : headVote && tied.includes(headVote) ? headVote : null;
    if (!winner) {
      outcomes.push({ id: award.id, winner: null, tie: tied, waiting: false });
      // The ones after it wait: its winner might be on their shortlists.
      for (const rest of awards.slice(awards.indexOf(award) + 1)) outcomes.push({ id: rest.id, winner: null, tie: [], waiting: true });
      return outcomes;
    }
    won.add(winner);
    outcomes.push({ id: award.id, winner, tie: [], waiting: false });
  }
  return outcomes;
}

// ─── Songs and ideas: everyone takes part ────────────────────────────────────

/** Songs each colleague may suggest for the night; the others say «من هم». */
export const SONGS_PER_PERSON = 3;
export const SONG_TITLE_MAX = 80;
export const SONG_ARTIST_MAX = 60;
export const SONG_NOTE_MAX = 100;

/** «امسال چه کنیم؟»: ideas for the program, liked by the others and answered by the organizers. */
export const IDEAS_PER_PERSON = 5;
export const IDEA_MAX = 300;
export const IDEA_REPLY_MAX = 200;
export const IDEA_KINDS = [
  { id: 'game', label: 'بازی', icon: '🎲' },
  { id: 'food', label: 'خوراکی', icon: '🍉' },
  { id: 'decor', label: 'دکور', icon: '🕯️' },
  { id: 'show', label: 'اجرا', icon: '🎤' },
  { id: 'other', label: 'دیگر', icon: '💡' },
] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number]['id'];

/** Songs may be suggested from signup until the program ends; ideas only before the program. */
export const songsOpen = (phase: EventPhase) => phase === 'signup' || phase === 'brackets' || phase === 'matchday' || phase === 'live';
export const ideasOpen = (phase: EventPhase) => phase === 'signup' || phase === 'brackets';

/**
 * The same song written another way: Arabic and Persian letters, half-spaces, punctuation and spaces
 * do not count, nor upper and lower case («Gole Sangam»، «گل سنگم»، «گل‌ سنگم!»).
 */
export function songKey(title: string, artist: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[يى]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[ۀة]/g, 'ه')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ً-ْٰ]/g, '')
      .replace(/[\s‌‏\p{P}\p{S}]+/gu, '');
  return `${norm(title)}|${norm(artist)}`;
}

// ─── «پیش‌بینی برنده» and «چند دانه؟» ─────────────────────────────────────────────

/** The pick of one who thinks a match of a points table ends level. */
export const PREDICT_DRAW = 'draw';

/** Whether a prediction came true: the winner, or a draw of a points table (a walkover is no draw). */
export const predictionRight = (pick: string, m: { done: boolean; winnerId: string | null; walkover: boolean }) =>
  m.done && (m.winnerId ? pick === m.winnerId : pick === PREDICT_DRAW && !m.walkover);

export const GUESS_QUESTION_MAX = 120;
export const GUESS_MAX = 1_000_000;
export const DEFAULT_GUESS_QUESTION = 'انار روی میز چند دانه دارد؟';

export interface Guess {
  employeeId: string;
  value: number;
  /** When it was last changed (ISO): of two equally close guesses, the earlier wins. */
  at: string;
}

/** The guesses by how close they came to the answer, the earlier first when two are as close. */
export function guessOrder(guesses: Guess[], answer: number) {
  return guesses
    .map((g) => ({ ...g, diff: Math.abs(g.value - answer) }))
    .sort((a, b) => a.diff - b.diff || a.at.localeCompare(b.at) || a.employeeId.localeCompare(b.employeeId));
}

// ─── «برنامهٔ امشب» ────────────────────────────────────────────────────────────

export const SCHEDULE_MAX = 30;
export const SCHEDULE_TITLE_MAX = 80;

export interface ScheduleItem {
  id: string;
  /** «۱۵:۳۰», on the day of the program. */
  time: string;
  title: string;
}

/** The items in time order, and which one is on now (the last that has started) and which comes next. */
export function scheduleNow(items: ScheduleItem[], programDate: string, now: Date, toJalaliDay: (d: Date) => string, toClock: (d: Date) => string) {
  const ordered = [...items].sort((a, b) => a.time.localeCompare(b.time));
  if (toJalaliDay(now) !== programDate) return { ordered, current: null as ScheduleItem | null, next: null as ScheduleItem | null };
  const clock = toClock(now);
  const started = ordered.filter((i) => i.time <= clock);
  const current = started.at(-1) ?? null;
  const next = ordered.find((i) => i.time > clock) ?? null;
  return { ordered, current, next };
}

// ─── «فال حافظ» ───────────────────────────────────────────────────────────────

/** Opening couplets of Hafez's ghazals, each with a short, light reading for the night. */
export const HAFEZ_FAL: { verse: [string, string]; reading: string }[] = [
  { verse: ['یوسف گم‌گشته بازآید به کنعان غم مخور', 'کلبهٔ احزان شود روزی گلستان غم مخور'], reading: 'چیزی که از دست رفته به نظر می‌رسد برمی‌گردد. صبور باشید؛ روزهای روشن نزدیک است.' },
  { verse: ['مژده ای دل که مسیحانفسی می‌آید', 'که ز انفاس خوشش بوی کسی می‌آید'], reading: 'خبر خوش در راه است. کسی یا چیزی می‌آید که حال و هوایتان را تازه می‌کند.' },
  { verse: ['روز هجران و شب فرقت یار آخر شد', 'زدم این فال و گذشت اختر و کار آخر شد'], reading: 'دوری و انتظار به پایان رسیده است. کاری که مدت‌ها طول کشیده به سرانجام می‌رسد.' },
  { verse: ['ستاره‌ای بدرخشید و ماه مجلس شد', 'دل رمیدهٔ ما را انیس و مونس شد'], reading: 'آشنایی تازه یا همراهی خوب، جمع شما را گرم می‌کند. قدرش را بدانید.' },
  { verse: ['نفس باد صبا مشک‌فشان خواهد شد', 'عالم پیر دگرباره جوان خواهد شد'], reading: 'فصل تازه‌ای در راه است. انرژی و امید دوباره برمی‌گردد؛ برای شروع‌های نو آماده باشید.' },
  { verse: ['رونق عهد شباب است دگر بستان را', 'می‌رسد مژدهٔ گل بلبل خوش‌الحان را'], reading: 'دوران شکوفایی است. تلاش‌هایتان دارد ثمر می‌دهد و خبر خوبش به‌زودی می‌رسد.' },
  { verse: ['هر آن کو خاطر مجموع و یار نازنین دارد', 'سعادت همدم او گشت و دولت همنشین دارد'], reading: 'آرامش خاطر و دوستان خوب بزرگ‌ترین سرمایهٔ شماست. خوشبختی از همین‌جا شروع می‌شود.' },
  { verse: ['دلا بسوز که سوز تو کارها بکند', 'نیاز نیم‌شبی دفع صد بلا بکند'], reading: 'دل‌سوزی و پشتکارتان بی‌اثر نمی‌ماند. یک خواستهٔ صادقانه گره‌های زیادی را باز می‌کند.' },
  { verse: ['سال‌ها دل طلب جام جم از ما می‌کرد', 'وان چه خود داشت ز بیگانه تمنا می‌کرد'], reading: 'آنچه دنبالش می‌گردید همین نزدیکی است. به توانایی‌های خودتان بیشتر اعتماد کنید.' },
  { verse: ['صبا به لطف بگو آن غزال رعنا را', 'که سر به کوه و بیابان تو داده‌ای ما را'], reading: 'با مهربانی، حرف دلتان را بزنید. پیامی که با لطف گفته شود، به مقصد می‌رسد.' },
  { verse: ['سحر بلبل حکایت با صبا کرد', 'که عشق روی گل با ما چه‌ها کرد'], reading: 'دلبستگی‌ها شما را به حرکت درمی‌آورند. از چیزی که دوستش دارید انرژی بگیرید.' },
  { verse: ['گفتم غم تو دارم گفتا غمت سرآید', 'گفتم که ماه من شو گفتا اگر برآید'], reading: 'غصه‌ها رفتنی‌اند. آرزویتان دور نیست؛ اگر زمانش برسد، خودش از راه می‌رسد.' },
  { verse: ['مرا عهدیست با جانان که تا جان در بدن دارم', 'هواداران کویش را چو جان خویشتن دارم'], reading: 'وفاداری‌تان به آدم‌ها و آرمان‌هایتان دیده می‌شود. کسانی که دوستشان دارید کنارتان می‌مانند.' },
  { verse: ['در ازل پرتو حسنت ز تجلی دم زد', 'عشق پیدا شد و آتش به همه عالم زد'], reading: 'شوقی که در دل دارید بزرگ است. آن را دنبال کنید؛ اطرافیانتان را هم گرم می‌کند.' },
  { verse: ['دیدی ای دل که غم عشق دگربار چه کرد', 'چون بشد دلبر و با یار وفادار چه کرد'], reading: 'از تجربه‌های گذشته درس گرفته‌اید. این بار با دلی پخته‌تر تصمیم می‌گیرید.' },
  { verse: ['حسب حالی ننوشتی و شد ایامی چند', 'محرمی کو که فرستم به تو پیغامی چند'], reading: 'وقت آن است که از کسی که مدتی بی‌خبرید حالی بپرسید. یک پیام کوتاه، دلی را شاد می‌کند.' },
  { verse: ['ای پادشه خوبان داد از غم تنهایی', 'دل بی تو به جان آمد وقت است که بازآیی'], reading: 'دلتنگی به پایان نزدیک است. دیداری که منتظرش هستید به‌زودی پیش می‌آید.' },
  { verse: ['دل می‌رود ز دستم صاحب‌دلان خدا را', 'دردا که راز پنهان خواهد شد آشکارا'], reading: 'چیزی که در دل نگه داشته‌اید دیگر پنهان نمی‌ماند. شاید وقت گفتنش رسیده باشد.' },
  { verse: ['سینه مالامال درد است ای دریغا مرهمی', 'دل ز تنهایی به جان آمد خدا را همدمی'], reading: 'تنها نمانید؛ همکاران و دوستانتان آماده‌اند کمک کنند. کافی است بخواهید.' },
  { verse: ['خوشا شیراز و وضع بی‌مثالش', 'خداوندا نگه دار از زوالش'], reading: 'قدر جایی که هستید و آدم‌های دوروبرتان را بدانید. خوشی‌های امروز را جشن بگیرید.' },
];

/** A verse for one colleague's fal (a random one of the list). */
export const randomFal = (random = Math.random) => Math.floor(random() * HAFEZ_FAL.length);

// ─── «مسابقهٔ همه‌با‌هم»: a quiz everyone in the hall answers on their phone ────────────

export const QUIZ_MAX = 30;
export const QUIZ_TEXT_MAX = 200;
export const QUIZ_OPTION_MAX = 80;
export const QUIZ_SECONDS = { min: 5, max: 90, default: 20 };
/** A right answer earns 500, and up to 500 more the faster it came. */
export const QUIZ_POINTS = { base: 500, speed: 500 };
/** Answers a moment after the clock ran out still count (a phone's tap on the way). */
export const QUIZ_GRACE_MS = 1500;
/** The colors and letters of the (up to four) options, the same on the phones and the big screen. */
export const QUIZ_COLORS = [
  { letter: 'الف', bg: '#dc2626' },
  { letter: 'ب', bg: '#2563eb' },
  { letter: 'ج', bg: '#d97706' },
  { letter: 'د', bg: '#059669' },
] as const;

export interface QuizState {
  questionId: string;
  openedAt: string;
  closesAt: string;
  /** Once the answer is shown (answering is over too). */
  revealedAt: string | null;
}

/** Points for one answer: none when wrong, more the faster when right. */
export function quizPoints(right: boolean, ms: number, seconds: number) {
  if (!right) return 0;
  const left = Math.min(1, Math.max(0, 1 - ms / (seconds * 1000)));
  return Math.round(QUIZ_POINTS.base + QUIZ_POINTS.speed * left);
}

// ─── «آرزوهای یلدا» and «گردونهٔ شانس» ──────────────────────────────────────────

/** A wish is short, like a line on a card; each colleague may write a few. */
export const WISH_MAX = 140;
export const WISHES_PER_PERSON = 3;
export type WishStatus = 'pending' | 'approved' | 'hidden';

/** How long the names run on the big screen before the wheel stops on one. */
export const WHEEL_SPIN_MS = 7000;
/** Names that pass on the screen before the winner (the reel). */
export const WHEEL_REEL = 36;
export const WHEEL_PRIZE_MAX = 80;

/**
 * Where the reel is after `elapsed` ms: a position from 0 to `length - 1`, fast at first and slowing
 * down to stop on the last name (the winner) at WHEEL_SPIN_MS.
 */
export function wheelPosition(elapsed: number, length: number) {
  if (length <= 1) return 0;
  const t = Math.min(1, Math.max(0, elapsed / WHEEL_SPIN_MS));
  const eased = 1 - (1 - t) ** 3;
  return Math.floor(eased * (length - 1));
}
