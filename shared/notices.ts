import moment from 'moment-jalaali';
import { jalaliToDate } from './jalali.js';

// «تابلوی اعلانات»: short notices that are not news (e.g. "please wear a mask if you have a cold"),
// shown in full on the dashboard from their first day to the end of their last day.

export const NOTICE_TEXT_MAX = 600;
export const NOTICE_SENDER_MAX = 60;
/** The longest a notice stays on the board; anything lasting longer is a news item. */
export const NOTICE_MAX_DAYS = 30;
/** How far ahead a notice may be scheduled. */
export const NOTICE_MAX_LEAD_DAYS = 60;
/** Ended notices are kept this long for the publishers' list, then removed by the nightly clean-up. */
export const NOTICE_KEEP_DAYS = 90;

/** Ready-made lengths offered in the form, counted from the first day (inclusive). */
export const NOTICE_LENGTHS = [
  { days: 1, label: 'فقط همان روز' },
  { days: 3, label: 'سه روز' },
  { days: 7, label: 'یک هفته' },
  { days: 14, label: 'دو هفته' },
  { days: 30, label: 'یک ماه' },
] as const;
export const NOTICE_DEFAULT_DAYS = 7;

/** The Jalali day `days - 1` after `start`, i.e. the last day of a notice that lasts `days` days. */
export function noticeLastDay(start: string, days: number) {
  return moment(start, 'jYYYY/jMM/jDD').add(days - 1, 'day').format('jYYYY/jMM/jDD');
}

/** How many days a notice from `first` to `last` (both Jalali, inclusive) lasts. */
export function noticeDays(first: string, last: string) {
  return moment(last, 'jYYYY/jMM/jDD').diff(moment(first, 'jYYYY/jMM/jDD'), 'day') + 1;
}

/**
 * The moments a notice starts and ends: the start of its first day (or now, when that is today or
 * earlier) and the end of its last day. Returns an error message when the days do not make sense.
 */
export function noticeWindow(
  first: string,
  last: string,
  now = new Date(),
): { startsAt: Date; endsAt: Date } | { error: string } {
  const start = jalaliToDate(first);
  const end = jalaliToDate(last, '23:59');
  if (!start || !end) return { error: 'روز شروع و پایان را درست انتخاب کنید.' };
  if (end <= now) return { error: 'روز پایان گذشته است.' };
  const days = noticeDays(first, last);
  if (days < 1) return { error: 'روز پایان نباید پیش از روز شروع باشد.' };
  if (days > NOTICE_MAX_DAYS) return { error: `اطلاعیه حداکثر ${NOTICE_MAX_DAYS} روز روی تابلو می‌ماند؛ برای مطلب ماندگار خبر منتشر کنید.` };
  if (start.getTime() - now.getTime() > NOTICE_MAX_LEAD_DAYS * 24 * 60 * 60 * 1000) {
    return { error: `اطلاعیه را حداکثر ${NOTICE_MAX_LEAD_DAYS} روز زودتر می‌شود زمان‌بندی کرد.` };
  }
  return { startsAt: start, endsAt: end };
}

export type NoticeStatus = 'scheduled' | 'live' | 'ended';

export function noticeStatus(n: { startsAt: string | Date; endsAt: string | Date }, now: number = Date.now()): NoticeStatus {
  if (new Date(n.endsAt).getTime() <= now) return 'ended';
  if (new Date(n.startsAt).getTime() > now) return 'scheduled';
  return 'live';
}

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  scheduled: 'زمان‌بندی‌شده',
  live: 'روی تابلو',
  ended: 'پایان‌یافته',
};
