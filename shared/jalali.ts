import moment from 'moment-jalaali';

// Jalali calendar dates are written as 'YYYY/MM/DD' with Latin digits throughout the app.
export const JALALI_DATE_RE = /^1[34]\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export function isValidJalaliDate(value: string): boolean {
  if (!JALALI_DATE_RE.test(value)) return false;
  return moment(value, 'jYYYY/jMM/jDD', true).isValid();
}

/** Converts a Jalali date (and optional HH:mm time, server local time) to a Date. */
export function jalaliToDate(value: string, time = '00:00'): Date | null {
  if (!isValidJalaliDate(value) || !TIME_RE.test(time)) return null;
  const m = moment(`${value} ${time}`, 'jYYYY/jMM/jDD HH:mm', true);
  return m.isValid() ? m.toDate() : null;
}

/** End of the given Jalali day, used for "valid until" style deadlines. */
export function jalaliEndOfDay(value: string): Date | null {
  return jalaliToDate(value, '23:59');
}

export function toJalali(date: Date | string | number, format = 'jYYYY/jMM/jDD'): string {
  return moment(date).format(format);
}

export function todayJalali(): string {
  return moment().format('jYYYY/jMM/jDD');
}

export function currentJalaliYear(): number {
  return moment().jYear();
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Normalizes Persian/Arabic digits to Latin digits. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** "آبان ۱۴۰۵" for a Jalali 'YYYY/MM' month. */
export function jalaliMonthLabel(month: string): string {
  const [year, m] = month.split('/').map(Number);
  return `${JALALI_MONTH_NAMES[m - 1] ?? ''} ${toPersianDigits(year)}`;
}
