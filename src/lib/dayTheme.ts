import moment from 'moment-jalaali';
import { daysSinceYearly, yearsSince } from '../../shared/celebrations';
import { dayTheme, type DayTheme } from '../../shared/dayThemes';
import { hijriDate } from '../../shared/occasions';
import type { CustomHolidays } from '../types';
import { dayOccasions } from './occasions';

export * from '../../shared/dayThemes';

/** Today's theme on the dashboard, from the same occasions the calendar shows. */
export function todayTheme(customHolidays: CustomHolidays | undefined, foundingDate: string, now: Date = new Date()): DayTheme | null {
  const m = moment(now);
  const [jy, jm, jd] = [m.jYear(), m.jMonth() + 1, m.jDate()];
  return dayTheme({
    month: jm,
    day: jd,
    occasions: dayOccasions(customHolidays, jy, jm, jd)?.items ?? [],
    officialLunar: !hijriDate(jy, jm, jd).estimated,
    foundingDay: yearsSince(foundingDate, now) >= 1 && daysSinceYearly(foundingDate, now) === 0,
  });
}

const query = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/**
 * Effects play only on a computer: a mouse, a wide screen and no request for less motion.
 * Phones and tablets get the banner alone.
 */
export const canPlayEffects = () =>
  query('(hover: hover) and (pointer: fine)') && query('(min-width: 1024px)') && !query('(prefers-reduced-motion: reduce)');

const PLAYED_KEY = 'roya.dayEffectPlayed';

const playedValue = (theme: DayTheme, now: Date) => `${moment(now).format('jYYYY/jMM/jDD')}|${theme.key}`;

/** The effect plays on the first dashboard visit of the day on this computer. */
export function effectPlayedToday(theme: DayTheme, now: Date = new Date()) {
  try {
    return window.localStorage.getItem(PLAYED_KEY) === playedValue(theme, now);
  } catch {
    return false;
  }
}

export function markEffectPlayed(theme: DayTheme, now: Date = new Date()) {
  try {
    window.localStorage.setItem(PLAYED_KEY, playedValue(theme, now));
  } catch {
    // Private windows may refuse storage; the effect then plays on every visit, which is harmless.
  }
}
