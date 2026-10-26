import moment from 'moment-jalaali';

export * from '../../shared/jalali';

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** "۴ آبان ۱۴۰۵" from an ISO timestamp or a Jalali 'YYYY/MM/DD' string. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^\d{4}\/\d{2}\/\d{2}$/.test(value) ? moment(value, 'jYYYY/jMM/jDD') : moment(value);
  if (!m.isValid()) return value;
  return `${m.jDate()} ${JALALI_MONTH_NAMES[m.jMonth()]} ${m.jYear()}`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const m = moment(value);
  return `${formatDate(value)}، ساعت ${m.format('HH:mm').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}`;
}

/** Relative label for recent timestamps ("۵ دقیقه پیش"), falling back to the date. */
export function timeAgo(value: string): string {
  const diffMin = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  if (diffMin < 1) return 'هم‌اکنون';
  if (diffMin < 60) return `${fa(diffMin)} دقیقه پیش`;
  if (diffMin < 24 * 60) return `${fa(Math.floor(diffMin / 60))} ساعت پیش`;
  if (diffMin < 7 * 24 * 60) return `${fa(Math.floor(diffMin / 1440))} روز پیش`;
  return formatDate(value);
}

/** Days until the next occurrence of a Jalali birthday (0 = today), or null if unknown. */
export function daysUntilBirthday(birthDate: string): number | null {
  const match = /^\d{4}\/(\d{2})\/(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const today = moment().startOf('day');
  const month = Number(match[1]);
  const day = Number(match[2]);
  for (const year of [today.jYear(), today.jYear() + 1]) {
    // Esfand 30 only exists in leap years; fall back to the 29th.
    const safeDay = Math.min(day, moment.jDaysInMonth(year, month - 1));
    const next = moment(`${year}/${month}/${safeDay}`, 'jYYYY/jM/jD');
    const diff = next.diff(today, 'days');
    if (diff >= 0) return diff;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`;
}
