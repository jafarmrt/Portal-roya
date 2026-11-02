// Notifications on phones and computers (Web Push): the kinds a colleague can switch off one by one.
// Every kind is on until the colleague switches it off; the in-portal bell always gets everything.

export interface PushCategory {
  id: string;
  label: string;
  /** Notification types (server/notify.ts) of this kind. */
  types: string[];
}

export const PUSH_CATEGORIES: PushCategory[] = [
  { id: 'tasks', label: 'کارهای ارجاعی', types: ['task'] },
  { id: 'notices', label: 'تابلوی اعلانات', types: ['notice'] },
  { id: 'news', label: 'خبرها، بخشنامه‌ها و سندها', types: ['announcement', 'document'] },
  { id: 'calendar', label: 'رویدادها و دوره‌های آموزشی', types: ['calendar', 'training'] },
  { id: 'polls', label: 'نظرسنجی‌ها', types: ['poll'] },
  { id: 'todos', label: 'یادآوری کارهای من', types: ['todo'] },
  { id: 'people', label: 'تولد، همکار جدید و تبریک‌ها', types: ['birthday', 'welcome', 'kudos'] },
  { id: 'other', label: 'پیام‌های پرتال و انتقادات و پیشنهادات', types: ['system', 'profile', 'suggestion'] },
];

export const PUSH_CATEGORY_IDS = PUSH_CATEGORIES.map((c) => c.id);

/** The kind a notification type belongs to; types not listed go with «other». */
export const pushCategoryOf = (type: string) => PUSH_CATEGORIES.find((c) => c.types.includes(type))?.id ?? 'other';

/** The address a notification opens, as in the portal's own links (#tab/id). */
export const pushUrl = (linkTab?: string | null, linkId?: string | null) =>
  linkTab ? `/#${linkTab}${linkId ? `/${encodeURIComponent(linkId)}` : ''}` : '/#notifications';

/**
 * The tag of a device notification: that of the bell notification it shows, the same for the server's
 * Web Push and the open page's own layer, so one notification never shows twice and two never replace
 * each other.
 */
export const pushTag = (notificationId: number | string) => `portal-${notificationId}`;
