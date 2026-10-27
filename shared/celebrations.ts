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
