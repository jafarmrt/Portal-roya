import moment from 'moment-jalaali';

export * from '../../shared/jalali';
import { toPersianDigits } from '../../shared/jalali';

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

/** "۵ آبان" for a Jalali 'MM/DD' (or full 'YYYY/MM/DD') birthday, without the year. */
export function formatBirthDay(value: string): string {
  const match = /(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return '';
  const month = JALALI_MONTH_NAMES[Number(match[1]) - 1];
  return month ? `${toPersianDigits(Number(match[2]))} ${month}` : '';
}

/** Days until the next occurrence of a Jalali birthday ('MM/DD' or 'YYYY/MM/DD'; 0 = today), or null if unknown. */
export function daysUntilBirthday(birthDay: string): number | null {
  const match = /^(?:\d{4}\/)?(\d{2})\/(\d{2})$/.exec(birthDay);
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

/** "۲۴۰ کیلوبایت", "۳٫۵ مگابایت", "۲۹٫۴ گیگابایت". */
export function formatFileSize(bytes: number): string {
  const decimal = (value: number, unit: string) => `${toPersianDigits(value.toFixed(1).replace(/\.0$/, '')).replace('.', '٫')} ${unit}`;
  if (bytes < 1024 * 1024) return `${toPersianDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  if (bytes < 1024 ** 3) return decimal(bytes / 1024 ** 2, 'مگابایت');
  return decimal(bytes / 1024 ** 3, 'گیگابایت');
}
