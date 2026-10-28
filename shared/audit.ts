// Words for the admin's change history, shared by the server (which writes the entries) and the
// page that lists them.

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'publish', 'import'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'ساخت',
  update: 'ویرایش',
  delete: 'حذف',
  publish: 'انتشار',
  import: 'ورود از فایل',
};

export const AUDIT_ENTITIES = [
  'news',
  'news_template',
  'document',
  'guide',
  'department_page',
  'poll',
  'training',
  'calendar_event',
  'holiday',
  'role',
  'employee',
  'settings',
  'message',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  news: 'اطلاعیه',
  news_template: 'قالب اطلاعیه',
  document: 'سند',
  guide: 'راهنما',
  department_page: 'صفحهٔ واحد',
  poll: 'نظرسنجی',
  training: 'دورهٔ آموزشی',
  calendar_event: 'رویداد تقویم',
  holiday: 'تعطیلی سازمانی',
  role: 'سطح دسترسی',
  employee: 'همکار و حساب کاربری',
  settings: 'تنظیمات',
  message: 'پیام همکاران',
};

/** How a changed field of an announcement is named; the audience lists and text format share a name. */
export const NEWS_FIELD_LABELS: Record<string, string> = {
  title: 'عنوان',
  summary: 'خلاصه',
  content: 'متن',
  contentFormat: 'متن',
  category: 'دسته‌بندی',
  image: 'تصویر',
  isPinned: 'سنجاق',
  isUrgent: 'فوری',
  requiresAck: 'بخشنامه',
  tags: 'برچسب‌ها',
  targetDepartments: 'مخاطبان',
  targetLocations: 'مخاطبان',
  targetRoles: 'مخاطبان',
  targetUserIds: 'مخاطبان',
  attachments: 'پیوست‌ها',
  publishAt: 'زمان انتشار',
  expiresAt: 'تاریخ انقضا',
  ackDeadline: 'مهلت تأیید',
};
