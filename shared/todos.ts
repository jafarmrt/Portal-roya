// «یادداشت کارهای من»: each person's private to-do notes on the dashboard. They are never assigned
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
export const TODO_KEEP_DONE_DAYS = 90;
/** The reminder for notes due today goes out from this hour (server local time). */
export const TODO_REMIND_HOUR = 8;
