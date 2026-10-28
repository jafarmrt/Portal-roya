import moment from 'moment-jalaali';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../lib/jalali';
import type { PersonalTodo } from '../../types';
import type { TodoGroup } from '../../../shared/todos';

// Shared by the dashboard card and the «یادداشت‌های من» page.

export const GROUP_STYLE: Record<TodoGroup, string> = {
  overdue: 'text-red-700',
  today: 'text-amber-800',
  week: 'text-sky-800',
  later: 'text-[#6E6A60]',
  none: 'text-[#6E6A60]',
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

