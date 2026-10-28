import { ADMIN_ROLE_ID } from './permissions.js';

// Parts of the portal an administrator can keep hidden until they are introduced, then switch on.
// "preview" shows a part only to the administrator and the pilot group, so it can be tried on the
// real server first. Hidden parts keep their data; switching them on again brings it all back.

export type FeatureState = 'off' | 'preview' | 'on';

export const FEATURE_STATES: { id: FeatureState; label: string }[] = [
  { id: 'off', label: 'خاموش' },
  { id: 'preview', label: 'پیش‌نمایش' },
  { id: 'on', label: 'روشن برای همه' },
];

export interface FeatureInfo {
  key: string;
  label: string;
  hint: string;
  /** Pages (tabs) that belong to it. */
  tabs: string[];
  /** Dashboard cards that belong to it. */
  cards: string[];
  /** Notification types that belong to it; they are not shown while it is hidden. */
  notificationTypes: string[];
  /** The state before an administrator changes it. New parts ship switched on; the administrator switches them off if needed. */
  defaultState: FeatureState;
  /** The opening lines of the news draft that introduces it. */
  intro: string;
  /** The section this part is one switch of (each suggestion box has its own); the section has no switch itself. */
  group?: string;
}

export const FEATURES = [
  {
    // The section itself has no switch of its own: it is shown while either box below is.
    key: 'suggestions',
    label: 'صندوق انتقادات و پیشنهادات',
    hint: 'فرستادن انتقاد و پیشنهاد به مدیریت و منابع انسانی، با امکان ناشناس.',
    tabs: ['suggestions'],
    cards: [],
    notificationTypes: ['suggestion'],
    defaultState: 'on',
    intro:
      'از امروز در منوی پرتال بخش «انتقادات و پیشنهادات» را می‌بینید. در آن می‌توانید انتقاد یا پیشنهاد خود را برای مدیریت یا منابع انسانی بفرستید؛ اگر بخواهید، به‌صورت کاملاً ناشناس و با یک کد پیگیری برای دیدن پاسخ.',
  },
  {
    key: 'suggestionsManagement',
    label: 'صندوق مدیریت',
    hint: 'پیام به مدیریت شرکت در بخش «انتقادات و پیشنهادات».',
    tabs: [],
    cards: [],
    notificationTypes: [],
    defaultState: 'on',
    group: 'suggestions',
    intro:
      'از امروز در بخش «انتقادات و پیشنهادات» می‌توانید انتقاد یا پیشنهاد خود را مستقیم برای مدیریت شرکت بفرستید؛ اگر بخواهید، به‌صورت کاملاً ناشناس و با یک کد پیگیری برای دیدن پاسخ.',
  },
  {
    key: 'suggestionsHr',
    label: 'صندوق منابع انسانی',
    hint: 'پیام به واحد منابع انسانی در بخش «انتقادات و پیشنهادات».',
    tabs: [],
    cards: [],
    notificationTypes: [],
    defaultState: 'on',
    group: 'suggestions',
    intro:
      'از امروز در بخش «انتقادات و پیشنهادات» می‌توانید انتقاد یا پیشنهاد خود را برای واحد منابع انسانی بفرستید؛ اگر بخواهید، به‌صورت کاملاً ناشناس و با یک کد پیگیری برای دیدن پاسخ.',
  },
  {
    key: 'polls',
    label: 'نظرسنجی‌ها',
    hint: 'نظرسنجی‌های چندسؤالی، کارت نظرسنجی ویژهٔ داشبورد و اعلان‌های آن.',
    tabs: ['polls'],
    cards: ['poll'],
    notificationTypes: ['poll'],
    defaultState: 'on',
    intro: 'از امروز در بخش «نظرسنجی‌ها» می‌توانید در نظرسنجی‌های سازمان شرکت کنید و نتیجه را ببینید.',
  },
  {
    key: 'training',
    label: 'آموزش',
    hint: 'دوره‌های آموزشی، ثبت‌نام، یادآوری‌ها، دوره‌های من و جلسه‌های دوره در تقویم.',
    tabs: ['training'],
    cards: ['training'],
    notificationTypes: ['training'],
    defaultState: 'on',
    intro: 'از امروز در بخش «آموزش» دوره‌های آموزشی سازمان را می‌بینید و می‌توانید در آن‌ها ثبت‌نام کنید.',
  },
  {
    key: 'guides',
    label: 'راهنماها و پرسش‌های رایج',
    hint: 'راهنماهای گام‌به‌گام و پاسخ پرسش‌های پرتکرار.',
    tabs: ['guides'],
    cards: [],
    notificationTypes: [],
    defaultState: 'on',
    intro: 'از امروز در بخش «راهنماها و پرسش‌های رایج» پاسخ پرسش‌های پرتکرار و راهنمای کارهای روزمره را پیدا می‌کنید.',
  },
  {
    key: 'departmentPages',
    label: 'صفحهٔ واحدها',
    hint: 'معرفی هر واحد، همکاران آن، اسناد و سامانه‌هایش.',
    tabs: ['departments'],
    cards: [],
    notificationTypes: [],
    defaultState: 'on',
    intro: 'از امروز در بخش «واحدها» صفحهٔ معرفی هر واحد سازمان را با همکاران، اسناد و سامانه‌هایش می‌بینید.',
  },
  {
    key: 'mood',
    label: 'حال‌وهوای روزانه',
    hint: 'کارت ثبت ناشناس حال‌وهوای روز و گزارش کلی آن.',
    tabs: [],
    cards: ['mood'],
    notificationTypes: [],
    defaultState: 'on',
    intro: 'از امروز روی داشبورد می‌توانید حال‌وهوای روزتان را به‌صورت ناشناس ثبت کنید.',
  },
  {
    key: 'todos',
    label: 'یادداشت کارهای من',
    hint: 'فهرست کارهای شخصی هر نفر روی داشبورد و در صفحهٔ «یادداشت‌های من»، با تاریخ سررسید و یادآوری؛ افزودن از خبر، رویداد، دوره و سند. فقط خود فرد آن را می‌بیند.',
    tabs: ['todos'],
    cards: ['todos'],
    notificationTypes: ['todo'],
    defaultState: 'on',
    intro:
      'از امروز روی داشبورد کارت «یادداشت کارهای من» را می‌بینید. کارهای خودتان را با تاریخ سررسید در آن بنویسید تا صبح همان روز یادآوری شود؛ از هر خبر، رویداد، دوره یا سند هم با دکمهٔ «افزودن به یادداشت کارهای من» می‌توانید کاری بسازید. این یادداشت‌ها فقط برای خودتان است و کسی دیگر آن‌ها را نمی‌بیند.',
  },
  {
    key: 'occasionThemes',
    label: 'افکت مناسبت‌ها و فصل‌ها',
    hint: 'بنر ویژهٔ داشبورد در نوروز، آغاز هر فصل، یلدا، اعیاد رسمی و سالگرد تأسیس، با افکتی یک‌دقیقه‌ای فقط روی رایانه؛ روزهای سوگواری فقط بنر ساده.',
    tabs: [],
    cards: [],
    notificationTypes: [],
    defaultState: 'on',
    intro:
      'از امروز در نوروز، آغاز هر فصل، شب یلدا، اعیاد رسمی و سالگرد تأسیس، داشبورد پرتال حال‌وهوای همان روز را دارد و روی رایانه، اولین بار در روز، افکتی کوتاه پخش می‌شود. هر کس بخواهد می‌تواند افکت را از روی همان بنر برای خودش خاموش کند.',
  },
  {
    key: 'dashboardLayout',
    label: 'چیدمان داشبورد من',
    hint: 'هر نفر ترتیب کارت‌های داشبورد خودش را با دکمه‌های بالا و پایین عوض می‌کند؛ کارتی پنهان نمی‌شود.',
    tabs: [],
    cards: [],
    notificationTypes: [],
    defaultState: 'on',
    intro:
      'از امروز می‌توانید ترتیب کارت‌های داشبورد خودتان را عوض کنید: روی دکمهٔ «چیدمان داشبورد» بالای داشبورد بزنید و کارت‌ها را با دکمه‌های بالا و پایین جابه‌جا کنید. این ترتیب فقط برای خودتان است و هر وقت بخواهید با «بازگشت به چیدمان پیش‌فرض» به حالت اول برمی‌گردد.',
  },
] as const satisfies readonly FeatureInfo[];

export type FeatureKey = (typeof FEATURES)[number]['key'];

export const isFeatureKey = (value: string): value is FeatureKey => FEATURES.some((f) => f.key === value);

export const featureInfo = (key: FeatureKey): FeatureInfo => FEATURES.find((f) => f.key === key)!;

/** The switches a section is made of, e.g. the two suggestion boxes; empty for a part with a switch of its own. */
export const groupMembers = (key: FeatureKey): FeatureKey[] =>
  FEATURES.filter((f) => (f as FeatureInfo).group === key).map((f) => f.key);

/** Whether an administrator switches the part itself (a section made of boxes is switched box by box). */
export const switchable = (key: FeatureKey) => groupMembers(key).length === 0;

/** The page a part belongs to: its own, or its section's. */
export function featureTab(key: FeatureKey): string | undefined {
  const info = featureInfo(key);
  return info.tabs[0] ?? (info.group && isFeatureKey(info.group) ? featureInfo(info.group).tabs[0] : undefined);
}

/** The parts a page (tab), dashboard card or notification type belongs to. */
export const featureOfTab = (tab: string) => FEATURES.find((f) => (f.tabs as readonly string[]).includes(tab))?.key;
export const featureOfCard = (card: string) => FEATURES.find((f) => (f.cards as readonly string[]).includes(card))?.key;
export const featureOfNotification = (type: string) =>
  FEATURES.find((f) => (f.notificationTypes as readonly string[]).includes(type))?.key;

/** How long the «جدید» badge and the introduction card stay after a part is switched on. */
export const LAUNCH_NEWS_DAYS = 14;

/**
 * No introduction cards on the dashboard before the portal's full launch (10 Aban 1405); a part
 * switched on before then never gets one, even if the box was ticked.
 */
export const INTRO_CARDS_FROM = '2026-11-01T00:00:00+03:30';
export const introCardsAllowed = (at: Date | string = new Date()) => new Date(at).getTime() >= new Date(INTRO_CARDS_FROM).getTime();

export interface FeatureLaunch {
  /** When it was switched on for everyone (ISO). */
  at: string;
  /** «جدید» next to its name in the menu. */
  badge: boolean;
  /** A one-time introduction card on everyone's dashboard. */
  card: boolean;
}

export interface FeatureConfig {
  states: Partial<Record<string, FeatureState>>;
  pilotRoles: string[];
  pilotUserIds: string[];
}

const STATE_RANK: Record<FeatureState, number> = { off: 0, preview: 1, on: 2 };

export function featureState(config: Pick<FeatureConfig, 'states'>, key: FeatureKey): FeatureState {
  // A section is as open as its most open box.
  const members = groupMembers(key);
  if (members.length > 0) {
    return members.map((m) => featureState(config, m)).reduce((a, b) => (STATE_RANK[b] > STATE_RANK[a] ? b : a), 'off');
  }
  // Before the boxes had switches of their own, the whole section had one; both boxes start from it.
  const { group, defaultState } = featureInfo(key);
  return config.states[key] ?? (group ? config.states[group] : undefined) ?? defaultState;
}

/** The administrator and the pilot group (by role or by name) see parts that are in preview. */
export function inPilotGroup(config: FeatureConfig, viewer: { id: string; role: string } | null) {
  if (!viewer) return false;
  return viewer.role === ADMIN_ROLE_ID || config.pilotRoles.includes(viewer.role) || config.pilotUserIds.includes(viewer.id);
}

/** Whether this viewer (null for a guest) sees the part at all. A section is seen while any of its boxes is. */
export function featureVisible(config: FeatureConfig, key: FeatureKey, viewer: { id: string; role: string } | null): boolean {
  const state = featureState(config, key);
  return state === 'on' || (state === 'preview' && inPilotGroup(config, viewer));
}
