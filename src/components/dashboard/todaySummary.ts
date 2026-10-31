import { toPersianDigits } from '../../lib/jalali';

/** «صبح بخیر» in the morning, «ظهر بخیر» at midday, «عصر بخیر» in the afternoon, «شب بخیر» at night. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'صبح بخیر';
  if (hour >= 12 && hour < 16) return 'ظهر بخیر';
  if (hour >= 16 && hour < 20) return 'عصر بخیر';
  return 'شب بخیر';
}

export interface TodayFacts {
  /** Open notes due today or earlier. */
  dueNotes: number;
  /** Circulars waiting for the person's confirmation. */
  pendingAcks: number;
  /** Today's events for the person: title and time ('' when all day). */
  eventsToday: { title: string; time: string }[];
  /** Colleagues (not the person) whose birthday is today. */
  birthdaysToday: string[];
}

const first = (names: string[]) => (names.length === 1 ? names[0] : `${names[0]} و ${toPersianDigits(names.length - 1)} همکار دیگر`);

/**
 * One short line about the person's day, most pressing first, at most four parts. Open polls and
 * unread news are left out: the buttons beside the line already show them. Empty when there is
 * nothing to say.
 */
export function todaySummary(f: TodayFacts): string[] {
  const parts: string[] = [];
  if (f.pendingAcks) parts.push(`${toPersianDigits(f.pendingAcks)} بخشنامه منتظر تأیید شما`);
  if (f.eventsToday.length === 1) {
    const e = f.eventsToday[0];
    parts.push(`${e.title}${e.time ? ` ساعت ${toPersianDigits(e.time)}` : ''}`);
  } else if (f.eventsToday.length > 1) parts.push(`${toPersianDigits(f.eventsToday.length)} برنامه در تقویم امروز`);
  if (f.dueNotes) parts.push(`${toPersianDigits(f.dueNotes)} یادداشت برای امروز`);
  if (f.birthdaysToday.length) parts.push(`تولد ${first(f.birthdaysToday)} 🎂`);
  return parts.slice(0, 4);
}
