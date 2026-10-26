import { z } from 'zod';
import { isValidJalaliDate, TIME_RE, toLatinDigits } from '../shared/jalali.js';

const trimmed = (max: number) => z.string().trim().max(max);
export const requiredText = (max: number) => trimmed(max).min(1, 'این فیلد الزامی است');
// The *Value schemas carry no default, for partial updates where a missing field must stay untouched.
export const textValue = (max: number) => trimmed(max);
export const optionalText = (max: number) => textValue(max).optional().default('');

export const jalaliDate = z
  .string()
  .trim()
  .transform(toLatinDigits)
  .refine(isValidJalaliDate, 'تاریخ باید به شکل ۱۴۰۵/۰۸/۱۵ باشد');

export const jalaliDateValue = z
  .string()
  .trim()
  .transform(toLatinDigits)
  .refine((v) => v === '' || isValidJalaliDate(v), 'تاریخ باید به شکل ۱۴۰۵/۰۸/۱۵ باشد');
export const optionalJalaliDate = jalaliDateValue.optional().default('');

export const timeOfDay = z.string().trim().transform(toLatinDigits).refine((v) => TIME_RE.test(v), 'ساعت باید به شکل ۰۹:۳۰ باشد');

// Images and attachments are either uploaded to this server (/uploads/...) or plain http(s) links.
export const assetUrlValue = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || v.startsWith('/uploads/') || /^https?:\/\//.test(v), 'آدرس فایل نامعتبر است');
export const assetUrl = assetUrlValue.optional().default('');

export const password = z.string().min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد').max(128);
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'نام کاربری فقط حروف انگلیسی، عدد و . _ - (۳ تا ۴۰ کاراکتر)');

export const attachment = z.object({
  name: requiredText(255),
  url: z.string().startsWith('/uploads/'),
  size: z.number().int().nonnegative(),
  mimeType: requiredText(100),
});
