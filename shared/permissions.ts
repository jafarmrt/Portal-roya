// Permissions are granted to roles; every user has exactly one role. The admin
// role always holds every permission and cannot be edited, so the portal can
// never be locked out of its own settings.

export const PERMISSIONS = [
  { key: 'news.manage', label: 'انتشار و مدیریت اخبار و اطلاعیه‌ها', hint: 'ثبت، ویرایش و حذف اطلاعیه‌ها، دیدن اطلاعیه‌های زمان‌بندی‌شده و آمار خوانده‌شدن' },
  { key: 'polls.manage', label: 'مدیریت نظرسنجی‌ها', hint: 'ایجاد، بستن و حذف نظرسنجی‌ها و دیدن نظرسنجی همهٔ واحدها' },
  { key: 'trainings.manage', label: 'مدیریت دوره‌های آموزشی', hint: 'ثبت و حذف دوره‌ها' },
  { key: 'calendar.manage', label: 'مدیریت تقویم', hint: 'ثبت رویداد و تعیین تعطیلات سازمانی' },
  { key: 'documents.manage', label: 'مدیریت اسناد، فرم‌ها و راهنماها', hint: 'بارگذاری، نسخهٔ جدید و حذف اسناد؛ نوشتن و ویرایش راهنماها' },
  { key: 'systems.manage', label: 'مدیریت لینک سامانه‌ها', hint: 'افزودن و ویرایش لینک سامانه‌های سازمانی' },
  { key: 'comments.moderate', label: 'مدیریت پیام‌های همکاران', hint: 'حذف پیام‌های تبریک تولد و خوش‌آمدگویی' },
  { key: 'reports.view', label: 'مشاهدهٔ گزارش‌ها', hint: 'گزارش مشارکت و حال‌وهوای کلی سازمان' },
  { key: 'users.manage', label: 'مدیریت کارکنان و کاربران', hint: 'صفحهٔ مدیریت کارکنان: ثبت همکار، ویرایش مشخصات، دادن یا برداشتن دسترسی پورتال، تعیین نقش، غیرفعال‌سازی و بازنشانی رمز' },
  { key: 'suggestions.management', label: 'خواندن صندوق انتقادات و پیشنهادات مدیریت', hint: 'دیدن و پاسخ دادن به پیام‌هایی که همکاران برای مدیریت می‌فرستند' },
  { key: 'suggestions.hr', label: 'خواندن صندوق انتقادات و پیشنهادات منابع انسانی', hint: 'دیدن و پاسخ دادن به پیام‌هایی که همکاران برای واحد منابع انسانی می‌فرستند' },
  { key: 'settings.manage', label: 'تنظیمات پرتال', hint: 'لوگوی شرکت، واحدهای سازمانی و دسته‌بندی‌ها' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export const ADMIN_ROLE_ID = 'admin';
export const MANAGER_ROLE_ID = 'manager';
export const DEFAULT_ROLE_ID = 'employee';

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

/** Effective permissions of a role: admin always has everything, unknown keys are dropped. */
export function effectivePermissions(roleId: string, stored: readonly string[]): Permission[] {
  if (roleId === ADMIN_ROLE_ID) return [...ALL_PERMISSIONS];
  return ALL_PERMISSIONS.filter((p) => stored.includes(p));
}

/**
 * Whether someone may give a role, or change the account of someone holding it: an admin always,
 * anyone else only when they hold every permission of the role themselves. So managing staff cannot
 * be used to gain more access, or to borrow it through someone else's account.
 */
export function coversRole(
  holder: { role: string; permissions: readonly string[] },
  role: { id: string; permissions: readonly string[] },
) {
  if (holder.role === ADMIN_ROLE_ID) return true;
  if (role.id === ADMIN_ROLE_ID) return false;
  return effectivePermissions(role.id, role.permissions).every((p) => holder.permissions.includes(p));
}
