import moment from 'moment-jalaali';

// «یادداشت‌های من»: each person's private to-do notes on the dashboard. They are never assigned
// to anyone else; a note may be added from a news item, event, course or document and links back to it.

export const TODO_SOURCES = [
  { type: 'news', tab: 'news', label: 'خبر' },
  { type: 'event', tab: 'calendar', label: 'رویداد' },
  { type: 'training', tab: 'training', label: 'دوره' },
  { type: 'document', tab: 'documents', label: 'سند' },
] as const;

export type TodoSourceType = (typeof TODO_SOURCES)[number]['type'];

export const todoSource = (type: string | null | undefined) => TODO_SOURCES.find((s) => s.type === type);

export const TODO_TITLE_MAX = 200;
export const TODO_NOTE_MAX = 1000;
/** Open notes one person may keep; enough for real use, small enough for a small server. */
export const TODO_OPEN_LIMIT = 200;
/** Done notes stay in «انجام‌شده‌ها» this long, then the nightly cleanup removes them. */
export const TODO_KEEP_DONE_DAYS = 30;
/** Reminders go out from this hour (server local time). */
export const TODO_REMIND_HOUR = 8;

/** Small steps inside one note, each ticked off on its own. */
export const TODO_STEPS_MAX = 10;
export const TODO_STEP_MAX = 200;

/** A note that comes back: once ticked off, the next one is written by itself. */
export const TODO_REPEATS = [
  { id: 'daily', label: 'هر روز' },
  { id: 'weekly', label: 'هر هفته' },
  { id: 'monthly', label: 'هر ماه' },
] as const;

export type TodoRepeat = (typeof TODO_REPEATS)[number]['id'];

/** When the person is reminded: the morning of the due date, the morning before as well, or not at all. */
export const TODO_REMINDERS = [
  { id: 'day', label: 'صبح همان روز' },
  { id: 'both', label: 'صبح روز قبل و صبح همان روز' },
  { id: 'none', label: 'بدون یادآوری' },
] as const;

export type TodoRemind = (typeof TODO_REMINDERS)[number]['id'];

export interface TodoStep {
  id: string;
  text: string;
  done: boolean;
}

const FORMAT = 'jYYYY/jMM/jDD';
const parse = (date: string) => moment(date, FORMAT);

export const addJalaliDays = (date: string, days: number) => parse(date).add(days, 'day').format(FORMAT);

/** Days from Saturday, the first day of the Iranian week (Friday is 6). */
const weekdayIndex = (date: string) => (parse(date).day() + 1) % 7;

/**
 * The buttons beside the date: today, tomorrow, the end of the working week (Wednesday; from Thursday
 * on, next week's) and a week from today.
 */
export function quickDueDates(today: string) {
  const day = weekdayIndex(today);
  return [
    { id: 'today', label: 'امروز', date: today },
    { id: 'tomorrow', label: 'فردا', date: addJalaliDays(today, 1) },
    { id: 'weekEnd', label: 'پایان هفته', date: addJalaliDays(today, day <= 4 ? 4 - day : 11 - day) },
    { id: 'nextWeek', label: 'هفتهٔ بعد', date: addJalaliDays(today, 7) },
  ];
}

/** The groups of the list, in the order they are shown. */
export const TODO_GROUPS = [
  { id: 'overdue', label: 'عقب‌افتاده' },
  { id: 'today', label: 'امروز' },
  { id: 'week', label: 'این هفته' },
  { id: 'later', label: 'بعداً' },
  { id: 'none', label: 'بدون تاریخ' },
] as const;

export type TodoGroup = (typeof TODO_GROUPS)[number]['id'];

/** «این هفته» runs to Friday. Notes from before the due date became required have none. */
export function todoGroup(due: string | null, today: string): TodoGroup {
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return due <= addJalaliDays(today, 6 - weekdayIndex(today)) ? 'week' : 'later';
}

/** The due date of the next note of a repeating one: one step on from its own date, and never today or earlier. */
export function nextDueDate(due: string, repeat: TodoRepeat, today: string) {
  // Counted from the note's own date each time, so a monthly note on the 31st comes back on the 31st.
  const step = (n: number) =>
    repeat === 'monthly' ? parse(due).add(n, 'jMonth') : parse(due).add(n * (repeat === 'weekly' ? 7 : 1), 'day');
  let n = 1;
  while (step(n).format(FORMAT) <= today) n++;
  return step(n).format(FORMAT);
}
