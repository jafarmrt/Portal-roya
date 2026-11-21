import moment from 'moment-jalaali';
import { isValidJalaliDate, toPersianDigits } from './jalali.js';

/** What a greeting card is for: a colleague's birthday or their work anniversary. */
export const WISH_OCCASIONS = ['birthday', 'anniversary'] as const;
export type WishOccasion = (typeof WISH_OCCASIONS)[number];

/** The looks a colleague can pick for a greeting card; the client draws each one. */
export const WISH_DESIGNS = ['confetti', 'balloons', 'flowers', 'cake', 'stars', 'coffee'] as const;
export type WishDesign = (typeof WISH_DESIGNS)[number];

/** The reactions the colleague can give a card they received. */
export const WISH_REACTIONS = ['❤️', '👍', '🙏', '😊', '🎉'] as const;

/** How long after the day the colleague still sees their own greeting and the cards they received. */
export const CELEBRATION_DAYS = 7;
/** How far ahead the dashboard lists colleagues' birthdays (with the cards already sent for them). */
export const UPCOMING_BIRTHDAY_DAYS = 14;
/** How far ahead the dashboard lists colleagues' work anniversaries. */
export const UPCOMING_ANNIVERSARY_DAYS = 7;

/**
 * Days since this year's occurrence of a yearly 'MM/DD' day (or a full 'YYYY/MM/DD' date):
 * 0 on the day itself, null when it is still ahead this year. Esfand 30 falls on the 29th in common years.
 */
export function daysSinceYearly(date: string, now: Date = new Date()): number | null {
  const match = /^(?:\d{4}\/)?(\d{2})\/(\d{2})$/.exec(date);
  if (!match) return null;
  const today = moment(now).startOf('day');
  const month = Number(match[1]);
  const day = Math.min(Number(match[2]), moment.jDaysInMonth(today.jYear(), month - 1));
  const occurrence = moment(`${today.jYear()}/${month}/${day}`, 'jYYYY/jM/jD');
  const diff = today.diff(occurrence, 'days');
  return diff >= 0 ? diff : null;
}

/**
 * Days until the next occurrence of a yearly 'MM/DD' day (or a full 'YYYY/MM/DD' date): 0 today, null for
 * an invalid date. Esfand 30 falls on the 29th in years without it.
 */
export function daysUntilYearly(date: string, now: Date = new Date()): number | null {
  const match = /^(?:\d{4}\/)?(\d{2})\/(\d{2})$/.exec(date);
  if (!match) return null;
  const today = moment(now).startOf('day');
  const month = Number(match[1]);
  for (const year of [today.jYear(), today.jYear() + 1]) {
    const day = Math.min(Number(match[2]), moment.jDaysInMonth(year, month - 1));
    const diff = moment(`${year}/${month}/${day}`, 'jYYYY/jM/jD').diff(today, 'days');
    if (diff >= 0) return diff;
  }
  return null;
}

/**
 * Whether the cards for this yearly day can be on anyone's dashboard now: from UPCOMING_BIRTHDAY_DAYS before
 * it (the colleagues' list) to CELEBRATION_DAYS after it (the colleague's own greeting). Cards outside this
 * window are never shown, so the server does not send them.
 */
export function cardsShownNow(date: string, now: Date = new Date()): boolean {
  const until = daysUntilYearly(date, now);
  if (until !== null && until <= UPCOMING_BIRTHDAY_DAYS) return true;
  const since = daysSinceYearly(date, now);
  return since !== null && since < CELEBRATION_DAYS;
}

/** Whole years from a Jalali date to this year's anniversary of it (0 for an invalid date). */
export function yearsSince(date: string, now: Date = new Date()): number {
  if (!isValidJalaliDate(date)) return 0;
  return moment(now).jYear() - Number(date.slice(0, 4));
}

/** "۵ سال" / "یک سال". */
export function yearsLabel(years: number): string {
  return years === 1 ? 'یک سال' : `${toPersianDigits(years)} سال`;
}

/** The built-in founding-day message, used when the admin left the message empty. */
export function defaultFoundingMessage(years: number): string {
  return `امروز ${yearsLabel(years)} از تأسیس رویا طرح داخلی می‌گذرد. این روز را به همهٔ همکارانی که در ساختن آن سهم داشته‌اند تبریک می‌گوییم.`;
}
