import moment from 'moment-jalaali';
import { toPersianDigits } from './jalali.js';

// «سپاس»: every colleague gets an allowance of coins at the start of each Jalali month that can only be
// given away, together with a message of thanks. What is left at the end of the month is gone; coins
// received stay for good and cannot be given on. The message matters more than the number: the wall
// never shows amounts, and there is no ranking of who received most.
//
// It is a different thing from the ready-made emoji of «همکاران آنلاین» (shared/kudos.ts), which stays
// as the quick, light thank-you.

/** «من هم»: a colleague who saw the same work adds this much of their own allowance to a card on the wall. */
export const RECOGNITION_JOIN_AMOUNT = 2;

/** The message is required; spaces do not count towards its length. */
export const RECOGNITION_MESSAGE_MIN = 15;
export const RECOGNITION_MESSAGE_MAX = 500;

/** The sender can take a recognition back for this long; the receiver hears of it only afterwards. */
export const RECOGNITION_UNDO_MS = 5 * 60 * 1000;

/** The same coins and message to the same colleague again within this long are the same click twice, not a second recognition. */
export const RECOGNITION_REPEAT_MS = 15 * 1000;

/** What the receiver adds when they report a recognition to the programme's owner; it may be left empty. */
export const RECOGNITION_REPORT_NOTE_MAX = 300;

/** Why the programme's owner reversed a recognition; told to both people. */
export const RECOGNITION_REASON_MIN = 5;
export const RECOGNITION_REASON_MAX = 300;

/** The organisation's values are few on purpose. */
export const RECOGNITION_VALUES_MAX = 8;
export const RECOGNITION_VALUE_LABEL_MAX = 40;

/** Cards the wall and a person's own lists hand over at once. */
export const RECOGNITION_PAGE = 30;

export interface RecognitionRules {
  /** Coins each colleague may give away in a month. */
  allowance: number;
  /** What one recognition can be: the amounts the form offers, smallest first. */
  amounts: number[];
  /** The amount the form starts on. */
  defaultAmount: number;
  /** The most one colleague may give the same person in a month, «من هم» included. */
  perPersonMax: number;
  /** Recognitions one colleague may write in a day («من هم» is not counted: it carries no message). */
  dailyMax: number;
}

/**
 * Few coins, so each one weighs something: the amount says how big the thing was, from a small thanks
 * (1) to a month's work (20, as much as one colleague can be given in a month).
 */
export const DEFAULT_RECOGNITION_RULES: RecognitionRules = {
  allowance: 50,
  amounts: [1, 2, 3, 5, 10, 20],
  defaultAmount: 5,
  perPersonMax: 20,
  dailyMax: 10,
};

export const RECOGNITION_ALLOWANCE_MAX = 1000;
export const RECOGNITION_AMOUNTS_MAX = 8;
export const RECOGNITION_DAILY_LIMIT_MAX = 50;

const fa = (n: number) => toPersianDigits(n);
const coins = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** `۱، ۲، ۳، ۵، ۱۰ یا ۲۰`: the amounts as a sentence names them. */
export function amountsText(amounts: readonly number[]): string {
  const names = amounts.map(fa);
  return names.length > 1 ? `${names.slice(0, -1).join('، ')} یا ${names.at(-1)}` : (names[0] ?? '');
}

/** What is wrong with a set of rules, in words for whoever is editing them; null when they hold together. */
export function rulesProblem(rules: RecognitionRules): string | null {
  const { allowance, amounts, defaultAmount, perPersonMax, dailyMax } = rules;
  if (!coins(allowance) || allowance > RECOGNITION_ALLOWANCE_MAX) return `سهمیهٔ ماهانه باید بین ۱ و ${fa(RECOGNITION_ALLOWANCE_MAX)} سکه باشد.`;
  if (!Array.isArray(amounts) || amounts.length === 0 || amounts.length > RECOGNITION_AMOUNTS_MAX || !amounts.every(coins)) {
    return `مقدارهای قدردانی باید ۱ تا ${fa(RECOGNITION_AMOUNTS_MAX)} عدد درست باشند.`;
  }
  if (amounts.some((n, i) => i > 0 && n <= amounts[i - 1])) return 'مقدارهای قدردانی باید از کوچک به بزرگ و بدون تکرار باشند.';
  if (!amounts.includes(defaultAmount)) return 'مقدار پیش‌فرض باید یکی از مقدارهای قدردانی باشد.';
  if (!coins(perPersonMax) || perPersonMax < amounts.at(-1)! || perPersonMax < RECOGNITION_JOIN_AMOUNT) {
    return 'سقف یک نفر در ماه نمی‌تواند از بزرگ‌ترین مقدار قدردانی کمتر باشد.';
  }
  if (perPersonMax > allowance) return 'سقف یک نفر در ماه نمی‌تواند از سهمیهٔ ماهانه بیشتر باشد.';
  if (!coins(dailyMax) || dailyMax > RECOGNITION_DAILY_LIMIT_MAX) return `سقف روزانه باید بین ۱ و ${fa(RECOGNITION_DAILY_LIMIT_MAX)} قدردانی باشد.`;
  return null;
}

/** Rules that hold together, or the built-in ones for anything else (nothing saved yet, or an older shape). */
const sound = (rules: RecognitionRules | null | undefined): RecognitionRules =>
  rules && typeof rules === 'object' && rulesProblem(rules) === null ? rules : DEFAULT_RECOGNITION_RULES;

/**
 * The rules as they are kept: those in force, and a change that waits for the start of a month so nobody
 * is surprised halfway through one. `pending.from` is the first Jalali month ('YYYY/MM') it applies to.
 */
export interface StoredRecognitionRules {
  rules: RecognitionRules;
  pending: { rules: RecognitionRules; from: string } | null;
}

/** The rules of a Jalali month ('YYYY/MM'); the built-in ones until somebody sets their own. */
export function rulesFor(stored: StoredRecognitionRules | null | undefined, month: string): RecognitionRules {
  if (!stored) return DEFAULT_RECOGNITION_RULES;
  return sound(stored.pending && month >= stored.pending.from ? stored.pending.rules : stored.rules);
}

/**
 * The stored rules after a change made in `month`: at once while the part is still switched off (it is
 * being set up), otherwise from the first day of the month after. A change that was already waiting and
 * whose month has come is in force by now, so it is not lost.
 */
export function withRulesChange(
  stored: StoredRecognitionRules | null | undefined,
  rules: RecognitionRules,
  month: string,
  atOnce: boolean,
): StoredRecognitionRules {
  if (atOnce) return { rules, pending: null };
  return { rules: rulesFor(stored, month), pending: { rules, from: nextRecognitionMonth(month) } };
}

/** The look of a value's cards on the wall: a colour and a motif of its own, drawn by the client. */
export const RECOGNITION_TONES = ['sage', 'crimson', 'sky', 'terracotta', 'gold', 'plum', 'teal', 'slate'] as const;
export type RecognitionTone = (typeof RECOGNITION_TONES)[number];

export interface RecognitionValue {
  id: string;
  label: string;
  tone: RecognitionTone;
}

/** The five values everyone has until the programme's owner writes the company's own list. */
export const DEFAULT_RECOGNITION_VALUES: RecognitionValue[] = [
  { id: 'teamwork', label: 'همکاری', tone: 'sage' },
  { id: 'ownership', label: 'مسئولیت‌پذیری', tone: 'crimson' },
  { id: 'learning', label: 'یادگیری', tone: 'sky' },
  { id: 'customer', label: 'مشتری‌مداری', tone: 'terracotta' },
  { id: 'initiative', label: 'ابتکار', tone: 'gold' },
];

/** The list in use: the saved one, or the built-in five while none is saved. */
export const recognitionValues = (saved: readonly RecognitionValue[] | null | undefined): RecognitionValue[] =>
  saved && saved.length > 0 ? [...saved] : DEFAULT_RECOGNITION_VALUES;

/** The Jalali month ('YYYY/MM', server local time) whose allowance a recognition sent at this moment uses. */
export const recognitionMonth = (date: Date | string | number = new Date()) => moment(date).format('jYYYY/jMM');

export const nextRecognitionMonth = (month: string) =>
  moment(`${month}/01`, 'jYYYY/jMM/jDD').add(1, 'jMonth').format('jYYYY/jMM');

/** Where a moment falls in its Jalali month (29, 30 or 31 days): for «چقدر از ماه گذشته» next to the wallet. */
export function monthProgress(now: Date = new Date()) {
  const m = moment(now);
  const daysInMonth = m.clone().endOf('jMonth').jDate();
  const day = m.jDate();
  // Today is still a day to give on, so the last day of the month has one day left.
  return { day, daysInMonth, daysLeft: daysInMonth - day + 1 };
}

/**
 * The allowance of a month for one colleague. Someone who joined the portal during that month gets the
 * share of the days that were left (the day they joined included), in whole coins and never less than
 * one; everybody else gets all of it.
 */
export function monthAllowance(allowance: number, month: string, joinedAt: Date | string | null | undefined): number {
  if (!joinedAt || recognitionMonth(joinedAt) !== month) return allowance;
  const { daysInMonth, daysLeft } = monthProgress(new Date(joinedAt));
  return Math.min(allowance, Math.max(1, Math.round((allowance * daysLeft) / daysInMonth)));
}

/** How long a message is for the minimum: its letters, without spaces and line breaks. */
export const messageLength = (text: string) => text.replace(/\s+/g, '').length;
