// «شروع روز»: the daily mood answer and what comes back to the colleague after it. The five answers
// never change, so months stay comparable; what varies is around them.

export const MOOD_VALUES = ['عالی', 'خوب', 'معمولی', 'بد', 'خیلی بد'] as const;
export type Mood = (typeof MOOD_VALUES)[number];

/** 5 for «عالی» down to 1 for «خیلی بد». */
export const MOOD_SCORE: Record<Mood, number> = { عالی: 5, خوب: 4, معمولی: 3, بد: 2, 'خیلی بد': 1 };

export const isGoodMood = (mood: Mood) => MOOD_SCORE[mood] >= 4;

/**
 * No number about colleagues' moods is shown to anyone (a colleague or a manager) with fewer answers
 * behind it than this: with two or three answers one could guess who said what.
 */
export const MOOD_MIN_ANSWERS = 5;

/** What the card says about who sees an answer. It is kept with the colleague's name (for «ماه من»), so it is not called anonymous. */
export const MOOD_PRIVACY_LINE = 'محرمانه است؛ مدیران فقط آمار کلی را می‌بینند.';

/** How many days «حال‌وهوای ما» looks back, today included. */
export const MOOD_TEAM_DAYS = 7;

export interface MoodTeamDay {
  date: string;
  /** Share of «خوب» and «عالی» in percent; null with too few answers. */
  good: number | null;
}

/** «حال‌وهوای ما»: how the organisation is today and over the last week, in shares only. */
export interface MoodTeam {
  date: string;
  /** Answers today; null while there are fewer than MOOD_MIN_ANSWERS. */
  answers: number | null;
  /** Share of «خوب» and «عالی» today in percent; null with too few answers. */
  good: number | null;
  days: MoodTeamDay[];
}

/** The share of good answers in percent, or null when the answers are too few to show. */
export function goodShare(counts: Partial<Record<Mood, number>>): { answers: number; good: number | null } {
  const answers = MOOD_VALUES.reduce((sum, m) => sum + (counts[m] ?? 0), 0);
  if (answers < MOOD_MIN_ANSWERS) return { answers, good: null };
  const good = (counts['عالی'] ?? 0) + (counts['خوب'] ?? 0);
  return { answers, good: Math.round((good / answers) * 100) };
}

/** The sentence under «حال‌وهوای ما». */
export function teamLine(team: Pick<MoodTeam, 'good'>): string {
  if (team.good === null) return 'هنوز پاسخ کافی نرسیده؛ بعداً سر بزنید.';
  if (team.good === 100) return 'امروز همهٔ همکارانی که پاسخ داده‌اند حالشان خوب یا عالی است.';
  if (team.good === 0) return 'امروز روز سختی برای خیلی از همکاران است؛ هوای هم را داشته باشیم.';
  return `امروز ${team.good}٪ همکاران حالشان خوب یا عالی است.`;
}

// What the card answers after a mood is chosen. Ten for each mood, taken in turn by the day, so a
// sentence comes back after two working weeks at the earliest. Addressed with «شما», like the rest of the portal.
export const MOOD_REPLIES: Record<Mood, readonly string[]> = {
  عالی: [
    'چه خوب! این انرژی را به یک همکار هم برسانید.',
    'عالی است. روزی که خوب شروع شود، خوب هم پیش می‌رود.',
    'خوشحالیم که امروز سرحالید. کار مهم امروز را با همین حال شروع کنید.',
    'حال خوب مسری است؛ امروز اطرافیانتان هم از آن سهم می‌برند.',
    'چه شروع خوبی! امیدواریم تا عصر همین‌طور بماند.',
    'عالی! امروز روز خوبی برای آن کاری است که عقب افتاده بود.',
    'با این حال، امروز کارها زودتر از همیشه جلو می‌رود.',
    'خوب است که خوبید. قدر این روزها را بدانید.',
    'انرژی امروزتان به چشم می‌آید. روز پرباری داشته باشید.',
    'چه خبر خوبی برای اول روز! موفق باشید.',
  ],
  خوب: [
    'خوب است. روز آرام و پرباری داشته باشید.',
    'شروع خوبی است. قدم‌به‌قدم پیش بروید.',
    'خوشحالیم که روزتان خوب شروع شده.',
    'روز خوب با یک کار کوچکِ تمام‌شده بهتر هم می‌شود.',
    'خوب بودن هم کم چیزی نیست. روزتان به‌خیر.',
    'با همین حال ادامه بدهید؛ امروز روز شماست.',
    'امیدواریم تا پایان روز از «خوب» به «عالی» برسد.',
    'چه خوب. اگر کاری از ما برمی‌آید، بگویید.',
    'روزتان خوب شروع شده؛ خوب هم تمام شود.',
    'خوب است که سرحالید. کارهای امروز را یکی‌یکی جلو ببرید.',
  ],
  معمولی: [
    'روزهای معمولی هم جای خودشان را دارند. امیدواریم بهتر شود.',
    'یک چای یا قهوهٔ خوب گاهی روز را عوض می‌کند.',
    'شاید یک کار کوچکِ تمام‌شده حال روز را بهتر کند.',
    'همهٔ روزها قرار نیست عالی باشند. آرام پیش بروید.',
    'امیدواریم ادامهٔ روز خبر خوبی برایتان داشته باشد.',
    'چند دقیقه قدم زدن یا گپ با یک همکار کمک می‌کند.',
    'معمولی هم خوب است. روزتان بی‌دردسر باشد.',
    'از یک کار ساده شروع کنید؛ بقیه راحت‌تر می‌شود.',
    'امروز را سبک بگیرید. فردا روز دیگری است.',
    'ممنون که گفتید. امیدواریم تا عصر بهتر شود.',
  ],
  بد: [
    'ممنون که صادقانه گفتید. امیدواریم روز بهتر شود.',
    'روزهای این‌طوری برای همه پیش می‌آید. به خودتان سخت نگیرید.',
    'یک نفس عمیق و یک استراحت کوتاه گاهی کمک می‌کند.',
    'اگر کاری سنگین است، کمک گرفتن از یک همکار اشکالی ندارد.',
    'امروز فقط کارهای ضروری را انجام بدهید؛ بقیه می‌ماند.',
    'متأسفیم که روز خوبی نیست. امیدواریم زود بگذرد.',
    'گاهی گفتنش به یک همکارِ نزدیک، بار را سبک‌تر می‌کند.',
    'لازم نیست امروز همه‌چیز کامل باشد.',
    'شنیدیم. امیدواریم ادامهٔ روز آرام‌تر باشد.',
    'هر روز بدی تمام می‌شود. مراقب خودتان باشید.',
  ],
  'خیلی بد': [
    'متأسفیم که امروز این‌قدر سخت است. مراقب خودتان باشید.',
    'ممنون که گفتید. شما در این روز تنها نیستید.',
    'روزهای سخت می‌گذرند. امروز به خودتان آسان بگیرید.',
    'اگر چیزی هست که باید شنیده شود، منابع انسانی کنار شماست.',
    'امروز لازم نیست قوی به نظر برسید. همین که هستید کافی است.',
    'شنیدیم. امیدواریم فردا روز بهتری باشد.',
    'اگر می‌شود، امروز با کسی که به او اعتماد دارید حرف بزنید.',
    'کار می‌تواند صبر کند؛ حال شما مهم‌تر است.',
    'متأسفیم. هر کمکی از همکارانتان برمی‌آید، دریغ نمی‌کنند.',
    'روز سختی است، ولی می‌گذرد. مراقب خودتان باشید.',
  ],
};

/** A number that grows with the Jalali date (not a count of days): only used to take turns. */
const dayNumber = (date: string) => {
  const [y, m, d] = date.split('/').map(Number);
  return y * 372 + m * 31 + d;
};

/** The sentence for this mood on this day: the same all day, another one the next day. */
export function moodReply(mood: Mood, date: string): string {
  const list = MOOD_REPLIES[mood];
  return list[dayNumber(date) % list.length];
}
