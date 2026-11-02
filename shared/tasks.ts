// «کارهای ارجاعی»: a colleague hands a piece of work to one or more colleagues. Only the person who
// handed it over and the person it was handed to see it; there is no view for managers. Each person
// it goes to has a copy of their own and answers it on their own.

export const TASK_TITLE_MAX = 200;
export const TASK_NOTE_MAX = 1000;
/** A short answer that goes with a status: why it was declined, or what was done. */
export const TASK_REPLY_MAX = 300;
/** Colleagues one task can go to at once. */
export const TASK_ASSIGNEES_MAX = 20;
/** Unfinished tasks one person may have handed out; enough for real use, small enough for a small server. */
export const TASK_OPEN_GIVEN_LIMIT = 300;
/** The morning reminder of the due date goes out from this hour (server local time). */
export const TASK_REMIND_HOUR = 8;
/**
 * «برگردان» after «انجام شد» or «رد می‌کنم»: within this time the answer is quietly taken back from the
 * bell of the one who handed the task over (if still unread), instead of a second «دوباره باز کرد».
 */
export const TASK_UNDO_MS = 2 * 60 * 1000;

export const TASK_STATUSES = [
  { id: 'new', label: 'منتظر پاسخ', tone: 'bg-amber-100 text-amber-900' },
  { id: 'accepted', label: 'پذیرفته شد', tone: 'bg-sky-100 text-sky-900' },
  { id: 'in_progress', label: 'در حال انجام', tone: 'bg-violet-100 text-violet-900' },
  { id: 'done', label: 'انجام شد', tone: 'bg-emerald-100 text-emerald-900' },
  { id: 'declined', label: 'رد شد', tone: 'bg-red-100 text-red-900' },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]['id'];

/** The statuses the person a task went to can set (a task never goes back to «منتظر پاسخ»). */
export const TASK_ANSWERS = ['accepted', 'in_progress', 'done', 'declined'] as const satisfies readonly TaskStatus[];
export type TaskAnswer = (typeof TASK_ANSWERS)[number];

export const taskStatus = (id: string) => TASK_STATUSES.find((s) => s.id === id) ?? TASK_STATUSES[0];

/** Still to be done: not finished and not declined. */
export const taskOpen = (status: string) => status === 'new' || status === 'accepted' || status === 'in_progress';
