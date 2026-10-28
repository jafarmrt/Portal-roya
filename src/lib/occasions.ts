import { HIJRI_MONTHS, hijriDate, occasionsFor, occasionTone, type Occasion } from '../../shared/occasions';
import type { CustomHolidays } from '../types';
import { toPersianDigits } from './jalali';

export * from '../../shared/occasions';

export interface DayOccasions {
  items: Occasion[];
  /** Official holiday (or marked as one by an admin). */
  isHoliday: boolean;
  /** All titles of the day, joined. */
  title: string;
  /** Set by an admin on the calendar page instead of the built-in list. */
  custom: boolean;
}

/** Custom holidays are keyed by Jalali 'YYYY-MM-DD'. */
export const holidayKey = (jy: number, jm: number, jd: number) =>
  `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;

/**
 * Occasions of a Jalali day (month 1-12). An admin's override replaces the built-in occasions
 * of that day; an override with an empty title hides them.
 */
export function dayOccasions(custom: CustomHolidays | undefined, jy: number, jm: number, jd: number): DayOccasions | null {
  const override = custom?.[holidayKey(jy, jm, jd)];
  if (override) {
    if (!override.title) return null;
    return {
      items: [{ title: override.title, holiday: override.isHoliday, kind: 'solar', tone: occasionTone(override.title) }],
      isHoliday: override.isHoliday,
      title: override.title,
      custom: true,
    };
  }
  const items = occasionsFor(jy, jm, jd);
  if (items.length === 0) return null;
  return { items, isHoliday: items.some((o) => o.holiday), title: items.map((o) => o.title).join('، '), custom: false };
}

/** "۱۵ جمادی‌الاول ۱۴۴۸" for a Jalali day (month 1-12). */
export function formatHijri(jy: number, jm: number, jd: number): string {
  const h = hijriDate(jy, jm, jd);
  return toPersianDigits(`${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}`);
}
