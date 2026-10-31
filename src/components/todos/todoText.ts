import moment from 'moment-jalaali';
import { JALALI_MONTH_NAMES, WEEKDAY_NAMES, toPersianDigits } from '../../lib/jalali';
import type { PersonalTodo } from '../../types';
import type { TodoGroup } from '../../../shared/todos';

// Shared by the dashboard card and the «یادداشت‌های من» page.

export const GROUP_STYLE: Record<TodoGroup, string> = {
  overdue: 'text-red-700',
  today: 'text-amber-800',
  week: 'text-sky-800',
  later: 'text-muted',
  none: 'text-muted',
};

/** Starred first, then by due date, then oldest first. */
export const byImportanceAndDue = (a: PersonalTodo, b: PersonalTodo) =>
  Number(b.important) - Number(a.important) ||
  (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') ||
  a.createdAt.localeCompare(b.createdAt);

/** "امروز", "فردا", "۳ روز گذشته" or "۱۲ آبان", short enough for one line. */
export function shortDue(due: string, today: string) {
  const days = moment(due, 'jYYYY/jMM/jDD').diff(moment(today, 'jYYYY/jMM/jDD'), 'days');
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  if (days < 0) return `${toPersianDigits(-days)} روز گذشته`;
  const m = moment(due, 'jYYYY/jMM/jDD');
  return toPersianDigits(`${m.jDate()} ${JALALI_MONTH_NAMES[m.jMonth()]}`);
}


/**
 * The heading of a day's card: "امروز", "فردا" or "دیروز" when it is one of those, and the day itself
 * ("شنبه ۱۰ آبان", with the year when it is not this year's).
 */
export function dayTitle(date: string, today: string) {
  const m = moment(date, 'jYYYY/jMM/jDD');
  const days = m.diff(moment(today, 'jYYYY/jMM/jDD'), 'days');
  const near = days === 0 ? 'امروز' : days === 1 ? 'فردا' : days === -1 ? 'دیروز' : null;
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${m.jYear()}`;
  return { near, day: toPersianDigits(`${WEEKDAY_NAMES[m.day()]} ${m.jDate()} ${JALALI_MONTH_NAMES[m.jMonth()]}${year}`) };
}

/** Open notes first (starred, then oldest), then the done ones in the order they were ticked off. */
export const byOpenThenDone = (a: PersonalTodo, b: PersonalTodo) =>
  Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) ||
  (a.doneAt && b.doneAt ? a.doneAt.localeCompare(b.doneAt) : byImportanceAndDue(a, b));

export interface TodoDay {
  /** Jalali YYYY/MM/DD, or null for old notes that have no date. */
  date: string | null;
  items: PersonalTodo[];
}

/** One entry per due date, with the notes of that day in it. */
export function byDay(items: PersonalTodo[]): TodoDay[] {
  const days = new Map<string, PersonalTodo[]>();
  for (const t of items) days.set(t.dueDate ?? '', [...(days.get(t.dueDate ?? '') ?? []), t]);
  return [...days].map(([date, list]) => ({ date: date || null, items: list.sort(byOpenThenDone) }));
}
