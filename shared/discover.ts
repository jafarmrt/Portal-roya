import moment from 'moment-jalaali';
import { MOOD_SCORE, type Mood } from './mood.js';

// «کشف پرتال»: once a week, in place of the day's step, «می‌دانستید؟» introduces a part of the portal the
// colleague has not used yet, with a short tour on the part's own page. Whether a part was used is read
// from what really happened (work handed over, the guides opened, a device that gets notifications…),
// never ticked by hand, and nothing is rewarded. «پرتال من» lists the same parts with a tick.

export const DISCOVER_PARTS = ['tasks', 'guides', 'push', 'layout', 'unit'] as const;
export type DiscoverPart = (typeof DISCOVER_PARTS)[number];

/** Parts the portal notes as tried when they are opened (the others are read from their own data). */
export const TRIED_PARTS = ['guides', 'unit'] as const satisfies readonly DiscoverPart[];
export type TriedPart = (typeof TRIED_PARTS)[number];

export interface DiscoverInfo {
  /** The part's name, as in the menu. */
  label: string;
  /** «می‌دانستید؟» in one line. */
  pitch: string;
  /** Where «همین حالا امتحان کنید» goes. */
  tab: 'tasks' | 'guides' | 'notifications' | 'dashboard' | 'departments';
}

export const DISCOVER_INFO: Record<DiscoverPart, DiscoverInfo> = {
  tasks: {
    label: 'کارهای ارجاعی',
    pitch: 'می‌توانید کاری را با موعد و توضیح به یک همکار بسپارید و ببینید به کجا رسیده؛ بدون پیام‌های پراکنده. فقط شما دو نفر آن را می‌بینید.',
    tab: 'tasks',
  },
  guides: {
    label: 'راهنماها و پرسش‌های رایج',
    pitch: 'پاسخ پرسش‌های پرتکرار، مثل مرخصی، تنخواه یا رمز ایمیل، و راهنمای کارهای روزمره یک جا جمع است. یک جستجو کافی است.',
    tab: 'guides',
  },
  push: {
    label: 'اعلان روی گوشی و کامپیوتر',
    pitch: 'اعلان‌های پرتال می‌توانند مثل پیام‌رسان‌ها روی همین دستگاه هم بیایند، حتی وقتی پرتال بسته است. هر نوعی را نخواستید خاموش کنید.',
    tab: 'notifications',
  },
  layout: {
    label: 'چیدمان داشبورد',
    pitch: 'ترتیب کارت‌های داشبورد دست خودتان است. آنچه هر روز به کارتان می‌آید را بالا بیاورید.',
    tab: 'dashboard',
  },
  unit: {
    label: 'صفحهٔ واحد شما',
    pitch: 'واحد شما یک صفحهٔ معرفی دارد: همکاران، اسناد و فرم‌ها و سامانه‌های واحد. ببینید همکاران دیگر واحدتان را چطور می‌بینند.',
    tab: 'departments',
  },
};

/** A part the colleague can use, and whether they have. Parts hidden from them are not listed at all. */
export interface DiscoverStatus {
  part: DiscoverPart;
  used: boolean;
}

/** What the browser remembers: parts the colleague said they know, and the last «می‌دانستید؟» shown. */
export interface DiscoverMemory {
  known: DiscoverPart[];
  last: { week: string; date: string; part: DiscoverPart; state: 'open' | 'done' | 'closed' } | null;
}

export const NO_DISCOVER_MEMORY: DiscoverMemory = { known: [], last: null };

const FORMAT = 'jYYYY/jMM/jDD';

/** The Saturday of the week `today` is in: the week «می‌دانستید؟» counts once in. */
export function weekOf(today: string): string {
  const day = moment(today, FORMAT);
  return day.subtract((day.day() + 1) % 7, 'days').format(FORMAT);
}

export interface DiscoverFacts {
  mood: Mood;
  today: string;
  parts: readonly DiscoverStatus[];
  /**
   * The day already has a step of its own that must not give way: something the portal waits for
   * (a circular, work handed over), the quiet line of a hard day, or a step already shown today.
   */
  stepHolds: boolean;
}

/**
 * Today's «می‌دانستید؟», or null. Once a week, on a day that is not hard and whose step may give way;
 * the part shown in the morning stays the day's while it is still unused. Of the unused parts, not the
 * one introduced last time, so a part left aside is not offered again the next week.
 */
export function pickDiscover(f: DiscoverFacts, memory: DiscoverMemory): DiscoverPart | null {
  const unused = f.parts.filter((p) => !p.used && !memory.known.includes(p.part)).map((p) => p.part);
  const last = memory.last;
  if (last?.date === f.today) return last.state === 'open' && unused.includes(last.part) ? last.part : null;
  if (MOOD_SCORE[f.mood] < 3 || f.stepHolds) return null;
  if (last?.week === weekOf(f.today)) return null;
  return unused.find((part) => part !== last?.part) ?? null;
}

/** «می‌دانستید؟» was shown, taken or closed today: the day's step does not come as well. */
export const discoverTakesToday = (memory: DiscoverMemory, today: string) => memory.last?.date === today;

/** Cleans what was read from the browser's storage. */
export function readDiscoverMemory(value: unknown): DiscoverMemory {
  if (!value || typeof value !== 'object') return NO_DISCOVER_MEMORY;
  const { known, last } = value as { known?: unknown; last?: { week?: unknown; date?: unknown; part?: unknown; state?: unknown } | null };
  const isPart = (p: unknown): p is DiscoverPart => DISCOVER_PARTS.includes(p as DiscoverPart);
  const ok =
    last &&
    typeof last.week === 'string' &&
    typeof last.date === 'string' &&
    isPart(last.part) &&
    (last.state === 'open' || last.state === 'done' || last.state === 'closed');
  return {
    known: Array.isArray(known) ? known.filter(isPart) : [],
    last: ok ? { week: last.week as string, date: last.date as string, part: last.part as DiscoverPart, state: last.state as 'open' | 'done' | 'closed' } : null,
  };
}

/** The short tour on the part's own page: three steps, the first two pointing at something there. */
export interface DiscoverTourStep {
  /** `data-discover` of what is lit up; none: a box in the middle. */
  target?: string;
  title: string;
  text: string;
}

export const DISCOVER_TOURS: Record<DiscoverPart, DiscoverTourStep[]> = {
  tasks: [
    { target: 'tasks-assign', title: 'سپردن کار', text: 'با این دکمه کاری را به یک یا چند همکار می‌سپارید: عنوان، موعد و اگر لازم بود توضیح.' },
    { target: 'tasks-tabs', title: 'کارهای من و سپرده‌ها', text: 'کارهایی که به شما سپرده‌اند و کارهایی که خودتان سپرده‌اید جدا هستند. وضعیت هر کار همین‌جا دیده می‌شود.' },
    { title: 'فقط شما دو نفر', text: 'گیرنده کار را می‌پذیرد یا رد می‌کند و وضعیتش را می‌زند. هر کار را فقط سپارنده و گیرنده‌اش می‌بینند، نه مدیران.' },
  ],
  guides: [
    { target: 'guides-search', title: 'اول جستجو کنید', text: 'پرسشتان را همان‌طور که به همکار می‌گفتید بنویسید، مثلاً «مرخصی» یا «رمز ایمیل».' },
    { target: 'guides-categories', title: 'یا از دسته‌ها', text: 'راهنماها دسته‌بندی شده‌اند؛ با یک دسته فقط همان‌ها دیده می‌شوند.' },
    { title: 'پاسخ را پیدا نکردید؟', text: 'اگر پرسشی بی‌پاسخ ماند، در «انتقادات و پیشنهادات» بنویسید تا راهنمایش اضافه شود.' },
  ],
  push: [
    { target: 'push-panel', title: 'اعلان روی همین دستگاه', text: 'با روشن کردن این بخش، اعلان‌های پرتال روی همین گوشی یا کامپیوتر هم می‌آیند. مرورگر یک بار اجازه می‌خواهد.' },
    { target: 'push-panel', title: 'هر نوع را جدا', text: 'بعد از روشن کردن، هر نوع اعلانی را که نخواستید همین‌جا خاموش کنید. زنگولهٔ پرتال مثل قبل همه را نگه می‌دارد.' },
    { title: 'روی دستگاه‌های دیگر', text: 'هر دستگاه جدا روشن می‌شود. اگر پرتال را روی گوشی هم باز می‌کنید، آنجا هم همین را بزنید.' },
  ],
  layout: [
    { target: 'layout-button', title: 'چیدمان داشبورد', text: 'با این دکمه فهرست کارت‌های داشبورد باز می‌شود.' },
    { title: 'بالا و پایین', text: 'با دکمه‌های بالا و پایین ترتیب کارت‌ها را عوض کنید. کارتی پنهان نمی‌شود و همیشه می‌توانید به ترتیب اول برگردید.' },
    { title: 'روی گوشی هم', text: 'روی گوشی کارت‌ها به همین ترتیب زیر هم می‌آیند؛ پس آنچه بیشتر لازم دارید را بالا بیاورید.' },
  ],
  unit: [
    { target: 'unit-about', title: 'معرفی واحد', text: 'همکاران دیگر اینجا می‌خوانند برای چه کارهایی سراغ واحد شما بیایند.' },
    { target: 'unit-people', title: 'همکاران واحد', text: 'همکاران واحد با شمارهٔ داخلی‌شان. با زدن روی هر نفر کارت همکاری او باز می‌شود.' },
    { title: 'اسناد و سامانه‌ها', text: 'اسناد، فرم‌ها و سامانه‌هایی که به واحد شما مربوط‌اند هم در همین صفحه است. اگر چیزی کم است، به رئیس واحد بگویید.' },
  ],
};
