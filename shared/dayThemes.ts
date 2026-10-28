import type { Occasion, OccasionTone } from './occasions.js';

// The look of the dashboard on the days that matter to everyone: Nowruz, the first day of each
// season, Yalda, the company's founding day and the festive official holidays. On a day of mourning
// the dashboard gets a quiet banner and no festive effect, whatever else falls on that day.

/** The moving decoration played once a day on a desktop; the client draws each one. */
export const THEME_EFFECTS = ['blossoms', 'summer', 'leaves', 'yalda', 'snow', 'confetti', 'lights'] as const;
export type ThemeEffect = (typeof THEME_EFFECTS)[number];

export const DAY_THEMES = [
  { key: 'nowruz', label: 'نوروز', title: 'نوروزتان پیروز، بهارتان خوش', message: 'سال نو و آغاز بهار را به همهٔ همکاران شادباش می‌گوییم.', effect: 'blossoms' },
  { key: 'sizdah', label: 'روز طبیعت', title: 'روز طبیعت خوش', message: 'سیزده‌به‌در و روز طبیعت بر همهٔ همکاران خجسته باد.', effect: 'blossoms' },
  { key: 'summer', label: 'آغاز تابستان', title: 'تابستان از راه رسید', message: 'یکم تیر، آغاز تابستان؛ روزهای بلند و پرانرژی برای همه.', effect: 'summer' },
  { key: 'autumn', label: 'آغاز پاییز', title: 'پاییز آمد', message: 'یکم مهر، آغاز پاییز و فصل تازه‌ای از کار و تلاش.', effect: 'leaves' },
  { key: 'yalda', label: 'شب یلدا', title: 'یلدا مبارک', message: 'بلندترین شب سال را کنار عزیزانتان به شادی بگذرانید.', effect: 'yalda' },
  { key: 'winter', label: 'آغاز زمستان', title: 'زمستان آمد', message: 'یکم دی، آغاز زمستان؛ روزهایتان گرم و روشن.', effect: 'snow' },
  { key: 'founding', label: 'سالگرد تأسیس', title: 'سالگرد تأسیس رویا طرح داخلی', message: 'سالگرد تأسیس شرکت را به همهٔ همکاران تبریک می‌گوییم.', effect: 'confetti' },
  { key: 'feast', label: 'عید و جشن رسمی', title: '', message: 'این روز فرخنده را به همهٔ همکاران تبریک می‌گوییم.', effect: 'lights' },
  { key: 'mourning', label: 'سوگواری', title: '', message: '', effect: null },
] as const satisfies readonly { key: string; label: string; title: string; message: string; effect: ThemeEffect | null }[];

export type DayThemeKey = (typeof DAY_THEMES)[number]['key'];

export interface DayTheme {
  key: DayThemeKey;
  title: string;
  message: string;
  tone: OccasionTone;
  /** null on a day of mourning, and for themes without one. */
  effect: ThemeEffect | null;
}

export interface DayThemeInput {
  /** Jalali month 1-12 and day. */
  month: number;
  day: number;
  /** The occasions of the day, as the calendar shows them (an admin's override included). */
  occasions: Occasion[];
  /** The lunar occasions come from Iran's official calendar rather than the estimate. */
  officialLunar: boolean;
  /** Today is the company's founding day (a full year or more after it). */
  foundingDay: boolean;
}

const themeOf = (key: DayThemeKey) => DAY_THEMES.find((t) => t.key === key)!;

const theme = (key: DayThemeKey, overrides: Partial<DayTheme> = {}): DayTheme => {
  const t = themeOf(key);
  return { key, title: t.title, message: t.message, tone: key === 'mourning' ? 'mourning' : 'joy', effect: t.effect, ...overrides };
};

/** A theme as an administrator previews it, with a sample title where the real one comes from the day. */
export function previewTheme(key: DayThemeKey): DayTheme {
  if (key === 'feast') return theme(key, { title: 'عید سعید غدیر خم مبارک' });
  if (key === 'mourning') return theme(key, { title: 'تاسوعا و عاشورای حسینی', message: 'فرارسیدن این روز را به همهٔ همکاران تسلیت می‌گوییم.' });
  return theme(key);
}

/** The theme of a day, or null for an ordinary day. */
export function dayTheme({ month, day, occasions, officialLunar, foundingDay }: DayThemeInput): DayTheme | null {
  // Estimated lunar dates can be a day off, so they never bring a festive look of their own;
  // but a possible day of mourning still keeps every effect away.
  const trusted = occasions.filter((o) => o.kind !== 'lunar' || officialLunar);
  const mourningDay = occasions.some((o) => o.tone === 'mourning');

  const mourning = trusted.filter((o) => o.tone === 'mourning' && o.holiday);
  if (mourning.length > 0) {
    return theme('mourning', { title: mourning.map((o) => o.title).join('، '), message: 'فرارسیدن این روز را به همهٔ همکاران تسلیت می‌گوییم.' });
  }

  let found: DayTheme | null = null;
  if (month === 1 && day <= 4) found = theme('nowruz');
  else if (month === 1 && day === 13) found = theme('sizdah');
  else if (foundingDay) found = theme('founding');
  else if (month === 9 && day === 30) found = theme('yalda');
  else if (month === 10 && day === 1) found = theme('winter');
  else if (month === 4 && day === 1) found = theme('summer');
  else if (month === 7 && day === 1) found = theme('autumn');
  else {
    const feasts = trusted.filter((o) => o.tone === 'joy' && o.holiday);
    if (feasts.length > 0) found = theme('feast', { title: `${feasts.map((o) => o.title.replace(/^تعطیل به مناسبت /, '')).join('، ')} مبارک` });
  }
  if (found && mourningDay) found = { ...found, effect: null };
  return found;
}

/** How long the effect plays, fading out over its last seconds. */
export const THEME_EFFECT_MS = 60_000;
