import type { AppSettings } from '../../types';
import { cardFeatureOn } from '../../lib/features';

/** Dashboard cards an administrator can switch off in settings; all are on until switched off. */
export const DASHBOARD_CARDS = [
  { id: 'myTasks', label: 'کارهای من', hint: 'بخشنامه‌های منتظر تأیید، نظرسنجی‌های باز و دوره‌ها و رویدادهای هفتهٔ هر نفر.' },
  { id: 'systems', label: 'سامانه‌ها', hint: 'میان‌بر سامانه‌های سازمان زیر خوش‌آمدگویی.' },
  { id: 'calendar', label: 'تقویم', hint: 'تقویم ماه با تعطیلات و رویدادها.' },
  { id: 'birthdays', label: 'تولد همکاران', hint: 'تولدهای امروز و پیش‌رو و ثبت تبریک.' },
  { id: 'welcome', label: 'خوش‌آمد همکاران جدید', hint: 'معرفی همکاران تازه‌وارد و پیام‌های خوش‌آمد.' },
  { id: 'anniversary', label: 'تبریک تولد و سالگرد همکاری', hint: 'تبریک پرتال و کارت‌های همکاران به خود همکار، در هفتهٔ تولد یا سالگرد استخدامش.' },
  { id: 'poll', label: 'نظرسنجی ویژه', hint: 'نظرسنجی بازی که هنوز در آن شرکت نکرده‌اید.' },
  { id: 'training', label: 'دورهٔ آموزشی پیش‌رو', hint: 'نزدیک‌ترین دورهٔ آموزشی برای ثبت‌نام.' },
  { id: 'mood', label: 'حال‌وهوای روزانه', hint: 'ثبت ناشناس حال‌وهوای روز؛ در گزارش‌ها فقط آمار کلی دیده می‌شود.' },
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARDS)[number]['id'];

/** Off when an admin switched the card off, or its part of the portal is hidden from this person. */
export const isCardOn = (settings: AppSettings | null, id: DashboardCardId) =>
  settings?.dashboardCards?.[id] !== false && cardFeatureOn(settings, id);
