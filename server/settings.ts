import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { settings } from './db/schema.js';

export const DEFAULT_LOCATIONS = ['شعبه شیراز', 'شعبه مشهد', 'شعبه قم', 'انبار', 'دفتر تهران طبقه اول', 'دفتر تهران طبقه دوم'];

export const DEFAULT_SETTINGS = {
  id: 'global',
  departments: ['طراحی و توسعه محصول', 'فروش و امور مشتریان', 'منابع انسانی', 'فناوری اطلاعات (IT)', 'بازرگانی و تامین', 'انبار و زنجیره تامین'],
  locations: DEFAULT_LOCATIONS,
  newsCategories: ['اخبار سازمان', 'اطلاعیه مهم', 'بخشنامه', 'رویداد و جشن'],
  trainingCategories: ['نرم‌افزار', 'مهارت‌های نرم', 'استانداردها', 'مدیریت و فروش'],
  documentCategories: ['آیین‌نامه و دستورالعمل', 'فرم‌ها', 'بخشنامه‌ها', 'راهنماها'],
  systems: [
    { id: 'crm', name: 'سیستم CRM', description: 'مدیریت ارتباط با مشتریان', iconName: 'Database', url: '#', bgColor: 'bg-red-50', textColor: 'text-red-700' },
    { id: 'automation', name: 'اتوماسیون اداری', description: 'مدیریت مکاتبات', iconName: 'Globe', url: '#', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
    { id: 'attendance', name: 'سیستم حضور و غیاب', description: 'ثبت تردد و درخواست مرخصی', iconName: 'CalendarClock', url: '#', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  ],
};

export async function ensureSettings() {
  await db.insert(settings).values(DEFAULT_SETTINGS).onConflictDoNothing();
  const [row] = await db.select().from(settings).where(eq(settings.id, 'global'));
  return row;
}

/** The guest-access switches; a fresh install allows guests to read but hides the directory. */
export async function guestSettings() {
  const [row] = await db
    .select({ guestAccess: settings.guestAccess, guestDirectory: settings.guestDirectory })
    .from(settings)
    .where(eq(settings.id, 'global'));
  return row ?? { guestAccess: true, guestDirectory: false };
}

/** The uploaded company logo's file name under /uploads/, or null when the built-in wordmark is used. */
export async function logoFile() {
  const [row] = await db.select({ logoUrl: settings.logoUrl }).from(settings).where(eq(settings.id, 'global'));
  return row?.logoUrl ? row.logoUrl.replace(/^\/uploads\//, '') : null;
}
