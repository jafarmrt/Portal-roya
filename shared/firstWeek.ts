/**
 * «هفتهٔ اول من»: a short list on a new colleague's dashboard of the things that help in the first
 * days (a complete card, the circulars, the apps, the people of their unit…), plus any steps the
 * administrator adds (e.g. «فرم‌های اداری را از منابع انسانی بگیرید»). It is shown to colleagues who
 * were introduced as new colleagues in the last 30 days, until they finish or close it.
 */
export const FIRST_WEEK_DAYS = 30;
/** Steps an administrator may add, and their length. */
export const FIRST_WEEK_EXTRA_MAX = 10;
export const FIRST_WEEK_EXTRA_LENGTH = 150;
/** Saved with the ticked steps when the colleague closes the list for good. */
export const FIRST_WEEK_CLOSED = 'closed';

/** True while the colleague's introduction as a new colleague is less than 30 days old. */
export function inFirstWeeks(introducedAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!introducedAt) return false;
  const age = now.getTime() - new Date(introducedAt).getTime();
  return age >= 0 && age < FIRST_WEEK_DAYS * 86_400_000;
}

/** A short, stable id for an administrator's step, from its text (a reworded step starts unticked). */
export function extraStepId(text: string): string {
  let hash = 5381;
  for (const char of text.trim()) hash = ((hash * 33) ^ char.codePointAt(0)!) >>> 0;
  return `extra-${hash.toString(36)}`;
}
