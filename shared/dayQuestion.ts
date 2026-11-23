import moment from 'moment-jalaali';
import { MOOD_MIN_ANSWERS } from './mood.js';

// «پرسش روز»: after the day's mood, one short question that is new every day. The mood itself never
// changes (so months stay comparable); the variety comes from here. Everyone gets the same question
// on the same day, and what colleagues answered comes back to whoever answers.

/** What a question is about. A working day has its own subject; «سبک» comes once a week; «مناسبتی» only on its day. */
export const DAY_QUESTION_THEMES = [
  { id: 'start', label: 'شروع هفته' },
  { id: 'load', label: 'حجم کار' },
  { id: 'together', label: 'همکاری' },
  { id: 'clarity', label: 'ابزار و روشنی کار' },
  { id: 'wrap', label: 'جمع‌بندی هفته' },
  { id: 'light', label: 'سبک' },
  { id: 'occasion', label: 'مناسبتی' },
] as const;
export type DayQuestionTheme = (typeof DAY_QUESTION_THEMES)[number]['id'];
export const DAY_QUESTION_THEME_IDS = DAY_QUESTION_THEMES.map((t) => t.id) as [DayQuestionTheme, ...DayQuestionTheme[]];
export const themeLabel = (theme: string) => DAY_QUESTION_THEMES.find((t) => t.id === theme)?.label ?? theme;

/** Saturday to Wednesday, in order. */
export const WEEKDAY_THEMES: readonly DayQuestionTheme[] = ['start', 'load', 'together', 'clarity', 'wrap'];

export const DAY_QUESTION_TEXT_MAX = 120;
export const DAY_QUESTION_OPTION_MAX = 40;
export const DAY_QUESTION_OPTIONS_MIN = 2;
export const DAY_QUESTION_OPTIONS_MAX = 5;
export const DAY_QUESTIONS_MAX = 300;

/** No question comes back sooner than this many days. */
export const DAY_QUESTION_REST_DAYS = 30;
/** With fewer questions than this left to ask, whoever looks after the bank is told. */
export const DAY_QUESTIONS_LOW = 10;

export interface DayQuestion {
  id: string;
  text: string;
  options: string[];
  theme: DayQuestionTheme;
  /** Switched off: kept with its answers, but not asked. */
  active: boolean;
  /** Asked on this day (Jalali) whatever the day's subject; '' for none. */
  pinnedDate: string;
}

/** A question as the bank's page shows it. */
export interface DayQuestionRow extends DayQuestion {
  /** The last day it was asked, and how often; null and 0 for a question not asked yet. */
  lastAsked: string | null;
  timesAsked: number;
}

/** What the card gets: today's question (null for none), the colleague's answer, and what everyone said. */
export interface DayQuestionToday {
  date: string;
  question: Pick<DayQuestion, 'id' | 'text' | 'options' | 'theme'> | null;
  /** The option this colleague chose today. */
  mine: number | null;
  /** Shown only to someone who answered, and only with enough answers behind it. */
  results: DayQuestionResults | null;
}

export interface DayQuestionResults {
  answers: number;
  /** Share of each option in percent, in the options' order. */
  shares: number[];
}

const FORMAT = 'jYYYY/jMM/jDD';
const parse = (date: string) => moment(date, FORMAT);

/** Saturday is 0, Friday 6. */
export const weekdayOf = (date: string) => (parse(date).day() + 1) % 7;

/** Whole days from `from` to `to` (Jalali dates). */
export const daysBetween = (from: string, to: string) => parse(to).startOf('day').diff(parse(from).startOf('day'), 'days');

/** A Saturday (27 March 2021) to count weeks from. */
const WEEK_EPOCH = '1400/01/07';

/** A count of weeks that starts on a Saturday, so every day of one week gets the same number. */
const weekNumber = (date: string) => Math.floor(daysBetween(WEEK_EPOCH, date) / 7);

/**
 * The subject of a day. Saturday to Wednesday each have their own; Thursday and Friday are «سبک». So
 * that a light question also reaches an organisation that is closed on Thursdays, each week one of the
 * five working days gives its turn to «سبک», a different one every week.
 */
export function themeOfDay(date: string): DayQuestionTheme {
  const weekday = weekdayOf(date);
  if (weekday >= WEEKDAY_THEMES.length) return 'light';
  const lightDay = ((weekNumber(date) % WEEKDAY_THEMES.length) + WEEKDAY_THEMES.length) % WEEKDAY_THEMES.length;
  return weekday === lightDay ? 'light' : WEEKDAY_THEMES[weekday];
}

/** May this question be asked on `date` in its turn (not because it was picked for the day)? */
export function restedBy(question: Pick<DayQuestion, 'active' | 'theme' | 'pinnedDate'>, lastAsked: string | null | undefined, date: string): boolean {
  if (!question.active || question.theme === 'occasion') return false;
  // Kept for the day it was picked for.
  if (question.pinnedDate && question.pinnedDate >= date) return false;
  return !lastAsked || daysBetween(lastAsked, date) >= DAY_QUESTION_REST_DAYS;
}

/**
 * The question for a day, from the bank in its own order and the last day each question was asked.
 * A question picked for this very day comes first. Otherwise the one of the day's subject that has
 * waited longest (never asked before anything asked); when that subject has none rested, the same from
 * the other subjects. Null when nothing may be asked.
 */
export function pickQuestion<Q extends Pick<DayQuestion, 'id' | 'active' | 'theme' | 'pinnedDate'>>(
  date: string,
  bank: readonly Q[],
  lastAsked: ReadonlyMap<string, string>,
): Q | null {
  const pinned = bank.find((q) => q.active && q.pinnedDate === date);
  if (pinned) return pinned;
  const rested = bank.filter((q) => restedBy(q, lastAsked.get(q.id), date));
  const longestWaiting = (list: Q[]) =>
    list.reduce<Q | null>((best, q) => {
      if (!best) return q;
      // '' sorts before every date, so a question never asked goes first; ties keep the bank's order.
      return (lastAsked.get(q.id) ?? '') < (lastAsked.get(best.id) ?? '') ? q : best;
    }, null);
  const theme = themeOfDay(date);
  return longestWaiting(rested.filter((q) => q.theme === theme)) ?? longestWaiting(rested);
}

/** How many questions are left to ask in their turn on `date`. */
export const restedCount = (bank: readonly Pick<DayQuestion, 'id' | 'active' | 'theme' | 'pinnedDate'>[], lastAsked: ReadonlyMap<string, string>, date: string) =>
  bank.filter((q) => restedBy(q, lastAsked.get(q.id), date)).length;

/** Shares in percent that add up to 100 (largest remainder), or null with too few answers to show. */
export function questionResults(counts: readonly number[]): DayQuestionResults | null {
  const answers = counts.reduce((sum, n) => sum + n, 0);
  if (answers < MOOD_MIN_ANSWERS) return null;
  const exact = counts.map((n) => (n / answers) * 100);
  const shares = exact.map(Math.floor);
  let left = 100 - shares.reduce((sum, n) => sum + n, 0);
  const byRemainder = exact.map((value, i) => ({ i, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return { answers, shares };
}

/** What is wrong with a question as written, or null. */
export function questionProblem(q: Pick<DayQuestion, 'text' | 'options' | 'theme' | 'pinnedDate'>): string | null {
  if (!q.text.trim()) return 'متن پرسش را بنویسید.';
  const options = q.options.map((o) => o.trim());
  if (options.some((o) => !o)) return 'گزینهٔ خالی را پر یا حذف کنید.';
  if (options.length < DAY_QUESTION_OPTIONS_MIN) return 'پرسش دست‌کم دو گزینه می‌خواهد.';
  if (options.length > DAY_QUESTION_OPTIONS_MAX) return 'پرسش حداکثر پنج گزینه دارد.';
  if (new Set(options).size !== options.length) return 'دو گزینه نمی‌توانند یکی باشند.';
  if (q.theme === 'occasion' && !q.pinnedDate) return 'پرسش مناسبتی فقط در روز خودش پرسیده می‌شود؛ روز آن را انتخاب کنید.';
  return null;
}

type Sample = Pick<DayQuestion, 'text' | 'options' | 'theme'> & { key: string };

const s = (key: string, theme: DayQuestionTheme, text: string, ...options: string[]): Sample => ({ key, theme, text, options });

/**
 * The forty questions the bank starts with. They are a draft: whoever looks after «شروع روز» edits,
 * switches off or adds to them. The two «مناسبتی» ones wait until a day is picked for them.
 */
export const SAMPLE_DAY_QUESTIONS: readonly Sample[] = [
  s('start-1', 'start', 'این هفته را با چه انرژی‌ای شروع می‌کنید؟', 'پرانرژی', 'خوب', 'معمولی', 'خسته'),
  s('start-2', 'start', 'مهم‌ترین کار این هفته‌تان روشن است؟', 'کاملاً', 'تقریباً', 'هنوز نه'),
  s('start-3', 'start', 'آخر هفته توانستید استراحت کنید؟', 'بله، خوب', 'کمی', 'نه چندان'),
  s('start-4', 'start', 'این هفته بیشتر به چه چیزی نیاز دارید؟', 'زمان بی‌وقفه', 'کمک یک همکار', 'اطلاعات بیشتر', 'همه‌چیز مهیاست'),
  s('start-5', 'start', 'برنامهٔ این هفته‌تان چقدر فشرده است؟', 'سبک', 'متعادل', 'فشرده', 'خیلی فشرده'),
  s('start-6', 'start', 'این هفته منتظر چه چیزی هستید؟', 'تمام شدن یک کار', 'شروع یک کار تازه', 'یک جلسهٔ مهم', 'آخر هفته'),

  s('load-1', 'load', 'حجم کارتان این روزها چطور است؟', 'کم', 'مناسب', 'زیاد', 'خیلی زیاد'),
  s('load-2', 'load', 'این روزها برای کار با تمرکز وقت دارید؟', 'بیشتر روزها', 'گاهی', 'به‌ندرت'),
  s('load-3', 'load', 'چه چیزی بیشتر وقت شما را می‌گیرد؟', 'کار اصلی خودم', 'جلسه‌ها', 'کارهای فوری و پیش‌بینی‌نشده', 'پیگیری از دیگران'),
  s('load-4', 'load', 'این روزها کارتان در ساعت کاری تمام می‌شود؟', 'بله', 'بیشتر روزها', 'کمتر پیش می‌آید'),
  s('load-5', 'load', 'تعداد جلسه‌های این هفته‌تان چطور است؟', 'کم', 'به‌اندازه', 'زیاد'),
  s('load-6', 'load', 'اگر کاری زیاد شود، می‌توانید آن را به کسی بسپارید؟', 'بله', 'گاهی', 'نه'),

  s('together-1', 'together', 'این هفته از همکاری کمک گرفتید؟', 'بله', 'لازم نشد', 'لازم بود ولی نشد'),
  s('together-2', 'together', 'وقتی به کمک نیاز دارید، می‌دانید سراغ چه کسی بروید؟', 'همیشه', 'بیشتر وقت‌ها', 'نه همیشه'),
  s('together-3', 'together', 'هماهنگی با واحدهای دیگر این روزها چطور است؟', 'روان', 'معمولی', 'کند'),
  s('together-4', 'together', 'این هفته به همکاری کمک کردید؟', 'بله', 'فرصتش پیش نیامد'),
  s('together-5', 'together', 'در تیم خودتان نظرتان شنیده می‌شود؟', 'بله', 'بیشتر وقت‌ها', 'کمتر'),
  s('together-6', 'together', 'این روزها از کار کسی تشکر کرده‌اید؟', 'بله، همین هفته', 'هنوز نه', 'موردی پیش نیامده'),

  s('clarity-1', 'clarity', 'می‌دانید این هفته چه چیزی از شما انتظار می‌رود؟', 'کاملاً', 'تقریباً', 'نه چندان'),
  s('clarity-2', 'clarity', 'ابزارها و سامانه‌هایی که با آن‌ها کار می‌کنید این روزها چطورند؟', 'خوب کار می‌کنند', 'گاهی کند یا قطع‌اند', 'مانع کارم هستند'),
  s('clarity-3', 'clarity', 'اطلاعاتی را که برای کارتان لازم دارید راحت پیدا می‌کنید؟', 'بله', 'با کمی جست‌وجو', 'سخت'),
  s('clarity-4', 'clarity', 'از اولویت‌های واحدتان باخبرید؟', 'بله', 'تا حدی', 'نه'),
  s('clarity-5', 'clarity', 'این روزها دربارهٔ کارتان بازخورد گرفته‌اید؟', 'بله', 'کم', 'نه'),
  s('clarity-6', 'clarity', 'خبرهای سازمان به‌موقع به شما می‌رسد؟', 'بله', 'بیشتر وقت‌ها', 'دیر می‌رسد'),

  s('wrap-1', 'wrap', 'این هفته چطور گذشت؟', 'عالی', 'خوب', 'معمولی', 'سخت'),
  s('wrap-2', 'wrap', 'به مهم‌ترین کار این هفته رسیدید؟', 'بله', 'تا حدی', 'نه'),
  s('wrap-3', 'wrap', 'این هفته چیز تازه‌ای یاد گرفتید؟', 'بله', 'شاید', 'نه'),
  s('wrap-4', 'wrap', 'این هفته از کدام بخش کارتان راضی‌ترید؟', 'نتیجهٔ کار', 'همکاری با دیگران', 'نظم و برنامه', 'هیچ‌کدام'),
  s('wrap-5', 'wrap', 'با چه حالی به آخر هفته می‌روید؟', 'راضی', 'خسته ولی راضی', 'فقط خسته'),
  s('wrap-6', 'wrap', 'هفتهٔ بعد را چطور می‌بینید؟', 'سبک‌تر', 'مثل همین هفته', 'شلوغ‌تر'),

  s('light-1', 'light', 'چای یا قهوه؟', 'چای', 'قهوه', 'هر دو', 'هیچ‌کدام'),
  s('light-2', 'light', 'صبح‌ها سرحال‌ترید یا عصرها؟', 'صبح', 'عصر', 'شب'),
  s('light-3', 'light', 'ناهار امروز؟', 'از خانه آورده‌ام', 'از بیرون می‌گیرم', 'غذای شرکت', 'هنوز نمی‌دانم'),
  s('light-4', 'light', 'کدام فصل را بیشتر دوست دارید؟', 'بهار', 'تابستان', 'پاییز', 'زمستان'),
  s('light-5', 'light', 'آخر هفتهٔ خوب یعنی؟', 'طبیعت', 'خانه و استراحت', 'دورهمی', 'فیلم و کتاب'),
  s('light-6', 'light', 'موقع کار موسیقی گوش می‌دهید؟', 'همیشه', 'گاهی', 'سکوت بهتر است'),
  s('light-7', 'light', 'با چه وسیله‌ای سر کار می‌آیید؟', 'خودرو', 'مترو یا اتوبوس', 'تاکسی', 'پیاده یا دوچرخه'),
  s('light-8', 'light', 'میزتان الان چقدر مرتب است؟', 'مرتب', 'قابل‌قبول', 'بهتر است نپرسید'),

  s('occasion-yalda', 'occasion', 'خوراکی شب یلدای شما؟', 'انار', 'هندوانه', 'آجیل', 'همه با هم'),
  s('occasion-nowruz', 'occasion', 'برای سال نو آماده‌اید؟', 'همه‌چیز آماده است', 'در راهم', 'هنوز شروع نکرده‌ام'),
];
