import moment from 'moment-jalaali';

// Built-in occasions of the Iranian calendar: fixed solar days, lunar (Hijri) days converted to
// each Jalali year, and a few world days fixed to the Gregorian calendar. Everything is computed
// offline; admins can still override any single day from the calendar page (custom_holidays).

export type OccasionKind = 'solar' | 'lunar' | 'world';

/** Festive days get a festive look on the dashboard; mourning days never do. */
export type OccasionTone = 'joy' | 'mourning' | 'normal';

export interface Occasion {
  title: string;
  /** Official public holiday in Iran. */
  holiday: boolean;
  kind: OccasionKind;
  tone: OccasionTone;
}

export interface HijriDate {
  year: number;
  /** 1 (Muharram) to 12 (Dhu al-Hijjah). */
  month: number;
  day: number;
  /** True when the date comes from the astronomical estimate rather than Iran's official calendar. */
  estimated: boolean;
}

export const HIJRI_MONTHS = [
  'محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه',
];

export const GREGORIAN_MONTHS = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
];

type Entry = [title: string, holiday?: boolean];
const H = true;

/** Fixed solar occasions, keyed by Jalali 'MM-DD'. */
const SOLAR: Record<string, Entry[]> = {
  '01-01': [['عید نوروز', H]],
  '01-02': [['عید نوروز', H]],
  '01-03': [['عید نوروز', H]],
  '01-04': [['عید نوروز', H]],
  '01-12': [['روز جمهوری اسلامی ایران', H]],
  '01-13': [['روز طبیعت (سیزده‌به‌در)', H]],
  '01-25': [['روز بزرگداشت عطار نیشابوری']],
  '01-29': [['روز ارتش جمهوری اسلامی ایران']],
  '02-01': [['روز بزرگداشت سعدی']],
  '02-03': [['روز بزرگداشت شیخ بهایی، روز ملی کارآفرینی و روز معماری']],
  '02-10': [['روز ملی خلیج فارس']],
  '02-11': [['روز جهانی کار و کارگر']],
  '02-12': [['روز معلم']],
  '02-25': [['روز بزرگداشت فردوسی و پاسداشت زبان فارسی']],
  '02-27': [['روز ارتباطات و روابط عمومی']],
  '02-28': [['روز بزرگداشت حکیم عمر خیام']],
  '03-01': [['روز بهره‌وری و بهینه‌سازی مصرف، روز بزرگداشت ملاصدرا']],
  '03-03': [['سالروز آزادسازی خرمشهر']],
  '03-14': [['رحلت امام خمینی (ره)', H]],
  '03-15': [['قیام ۱۵ خرداد', H]],
  '03-25': [['روز ملی گل و گیاه']],
  '04-07': [['روز قوه قضاییه']],
  '04-10': [['روز صنعت و معدن']],
  '04-13': [['جشن تیرگان']],
  '04-14': [['روز قلم']],
  '04-25': [['روز بهزیستی و تأمین اجتماعی']],
  '05-08': [['روز بزرگداشت شیخ شهاب‌الدین سهروردی']],
  '05-14': [['سالروز صدور فرمان مشروطیت']],
  '05-17': [['روز خبرنگار']],
  '06-01': [['روز بزرگداشت ابوعلی سینا و روز پزشک']],
  '06-02': [['آغاز هفته دولت']],
  '06-04': [['روز کارمند']],
  '06-05': [['روز بزرگداشت محمد بن زکریای رازی و روز داروسازی']],
  '06-11': [['روز صنعت چاپ']],
  '06-13': [['روز بزرگداشت ابوریحان بیرونی']],
  '06-21': [['روز سینما']],
  '06-27': [['روز شعر و ادب فارسی و بزرگداشت استاد شهریار']],
  '06-31': [['آغاز هفته دفاع مقدس']],
  '07-01': [['آغاز سال تحصیلی']],
  '07-07': [['روز آتش‌نشانی و ایمنی، بزرگداشت شمس تبریزی']],
  '07-08': [['روز بزرگداشت مولوی']],
  '07-10': [['جشن مهرگان']],
  '07-14': [['روز دامپزشکی']],
  '07-16': [['روز ملی کودک']],
  '07-20': [['روز بزرگداشت حافظ']],
  '07-26': [['روز تربیت بدنی و ورزش']],
  '08-01': [['روز آمار و برنامه‌ریزی']],
  '08-13': [['روز دانش‌آموز']],
  '08-18': [['روز ملی کیفیت']],
  '08-24': [['روز کتاب، کتاب‌خوانی و کتابدار']],
  '09-05': [['روز بسیج مستضعفان']],
  '09-07': [['روز نیروی دریایی']],
  '09-10': [['روز مجلس']],
  '09-13': [['روز بیمه']],
  '09-15': [['روز حسابدار']],
  '09-16': [['روز دانشجو']],
  '09-25': [['روز پژوهش']],
  '09-30': [['شب یلدا']],
  '10-05': [['روز ملی ایمنی در برابر زلزله']],
  '11-10': [['جشن سده']],
  '11-12': [['بازگشت امام خمینی (ره) به ایران و آغاز دهه فجر']],
  '11-19': [['روز نیروی هوایی']],
  '11-22': [['پیروزی انقلاب اسلامی', H]],
  '11-29': [['جشن سپندارمذگان']],
  '12-05': [['روز بزرگداشت خواجه نصیرالدین طوسی و روز مهندس']],
  '12-14': [['روز احسان و نیکوکاری']],
  '12-15': [['روز درختکاری']],
  '12-25': [['روز بزرگداشت پروین اعتصامی']],
  '12-29': [['روز ملی شدن صنعت نفت ایران', H]],
};

/** Lunar occasions, keyed by Hijri 'MM-DD'; 'MM-last' is the last day of that month. */
const LUNAR: Record<string, Entry[]> = {
  '01-01': [['آغاز سال هجری قمری']],
  '01-09': [['تاسوعای حسینی', H]],
  '01-10': [['عاشورای حسینی', H]],
  '01-12': [['شهادت امام زین‌العابدین (ع)']],
  '02-20': [['اربعین حسینی', H]],
  '02-28': [['رحلت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)', H]],
  '02-last': [['شهادت امام رضا (ع)', H]],
  '03-01': [['هجرت رسول اکرم (ص) از مکه به مدینه']],
  '03-08': [['شهادت امام حسن عسکری (ع)', H]],
  '03-09': [['آغاز امامت حضرت ولی‌عصر (عج)']],
  '03-12': [['میلاد رسول اکرم (ص) به روایت اهل سنت و آغاز هفته وحدت']],
  '03-17': [['میلاد رسول اکرم (ص) و امام جعفر صادق (ع)', H]],
  '04-08': [['ولادت امام حسن عسکری (ع)']],
  '04-10': [['وفات حضرت معصومه (س)']],
  '05-05': [['ولادت حضرت زینب (س) و روز پرستار']],
  '06-03': [['شهادت حضرت فاطمه زهرا (س)', H]],
  '06-20': [['ولادت حضرت فاطمه زهرا (س) و روز مادر']],
  '07-01': [['ولادت امام محمد باقر (ع)']],
  '07-03': [['شهادت امام علی النقی الهادی (ع)']],
  '07-10': [['ولادت امام محمد تقی (ع)']],
  '07-13': [['ولادت امام علی (ع) و روز پدر', H]],
  '07-15': [['وفات حضرت زینب (س)']],
  '07-25': [['شهادت امام موسی کاظم (ع)']],
  '07-27': [['مبعث رسول اکرم (ص)', H]],
  '08-03': [['ولادت امام حسین (ع) و روز پاسدار']],
  '08-04': [['ولادت حضرت ابوالفضل العباس (ع) و روز جانباز']],
  '08-05': [['ولادت امام زین‌العابدین (ع)']],
  '08-11': [['ولادت حضرت علی‌اکبر (ع) و روز جوان']],
  '08-15': [['ولادت حضرت قائم (عج) و جشن نیمه شعبان', H]],
  '09-01': [['آغاز ماه مبارک رمضان']],
  '09-15': [['ولادت امام حسن مجتبی (ع)']],
  '09-18': [['شب قدر']],
  '09-19': [['ضربت خوردن حضرت علی (ع)']],
  '09-21': [['شهادت حضرت علی (ع)', H]],
  '09-22': [['شب قدر']],
  '10-01': [['عید سعید فطر', H]],
  '10-02': [['تعطیل به مناسبت عید سعید فطر', H]],
  '10-25': [['شهادت امام جعفر صادق (ع)', H]],
  '11-01': [['ولادت حضرت معصومه (س) و روز دختر']],
  '11-11': [['ولادت امام رضا (ع)']],
  '11-last': [['شهادت امام محمد تقی (ع)']],
  '12-01': [['سالروز ازدواج حضرت علی (ع) و حضرت فاطمه (س)']],
  '12-07': [['شهادت امام محمد باقر (ع)']],
  '12-09': [['روز عرفه']],
  '12-10': [['عید سعید قربان', H]],
  '12-15': [['ولادت امام علی النقی الهادی (ع)']],
  '12-18': [['عید سعید غدیر خم', H]],
  '12-20': [['ولادت امام موسی کاظم (ع)']],
};

/** World days, keyed by Gregorian 'MM-DD'. */
const WORLD: Record<string, Entry[]> = {
  '01-01': [['آغاز سال نو میلادی']],
  '03-08': [['روز جهانی زن']],
  '04-07': [['روز جهانی بهداشت']],
  '06-05': [['روز جهانی محیط زیست']],
  '09-27': [['روز جهانی جهانگردی']],
  '10-01': [['روز جهانی سالمندان']],
  '10-05': [['روز جهانی معلم']],
  '12-25': [['میلاد حضرت عیسی مسیح (ع)']],
};

/**
 * First day of each Hijri month in Iran's official calendar (Jalali date), as published by the
 * Calendar Center of the University of Tehran's Geophysics Institute. Lunar months in Iran start
 * on moon sighting, so no formula reproduces them exactly; add the next year's months here when
 * its official calendar is published. Outside this table the astronomical estimate is used.
 */
const IRAN_HIJRI_MONTH_STARTS: [hijriYear: number, hijriMonth: number, jalali: string][] = [
  [1445, 9, '1402/12/22'],
  [1445, 10, '1403/01/22'],
  [1445, 11, '1403/02/21'],
  [1445, 12, '1403/03/19'],
  [1446, 1, '1403/04/17'],
  [1446, 2, '1403/05/16'],
  [1446, 3, '1403/06/15'],
  [1446, 4, '1403/07/14'],
  [1446, 5, '1403/08/13'],
  [1446, 6, '1403/09/13'],
  [1446, 7, '1403/10/13'],
  [1446, 8, '1403/11/12'],
  [1446, 9, '1403/12/12'],
  [1446, 10, '1404/01/11'],
  [1446, 11, '1404/02/09'],
  [1446, 12, '1404/03/07'],
  [1447, 1, '1404/04/06'],
  [1447, 2, '1404/05/04'],
  [1447, 3, '1404/06/03'],
  [1447, 4, '1404/07/02'],
  [1447, 5, '1404/08/01'],
  [1447, 6, '1404/09/01'],
  [1447, 7, '1404/10/01'],
  [1447, 8, '1404/11/01'],
  [1447, 9, '1404/11/30'],
  [1447, 10, '1405/01/01'],
  [1447, 11, '1405/01/30'],
  [1447, 12, '1405/02/28'],
  [1448, 1, '1405/03/26'],
  [1448, 2, '1405/04/25'],
  [1448, 3, '1405/05/23'],
  [1448, 4, '1405/06/22'],
  [1448, 5, '1405/07/20'],
  [1448, 6, '1405/08/20'],
  [1448, 7, '1405/09/20'],
  [1448, 8, '1405/10/20'],
  [1448, 9, '1405/11/19'],
  [1448, 10, '1405/12/19'],
];

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a Jalali date (month 1-12). */
function jalaliDayNumber(jy: number, jm: number, jd: number): number {
  const g = moment(`${jy}/${jm}/${jd}`, 'jYYYY/jM/jD');
  return Math.round(Date.UTC(g.year(), g.month(), g.date()) / DAY_MS);
}

const TABLE = IRAN_HIJRI_MONTH_STARTS.map(([year, month, jalali]) => {
  const [jy, jm, jd] = jalali.split('/').map(Number);
  return { year, month, start: jalaliDayNumber(jy, jm, jd) };
});

let estimator: Intl.DateTimeFormat | null | undefined;

function estimateHijri(dayNumber: number): HijriDate {
  if (estimator === undefined) {
    try {
      estimator = new Intl.DateTimeFormat('en-u-ca-islamic', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
      if (estimator.resolvedOptions().calendar !== 'islamic') estimator = null;
    } catch {
      estimator = null;
    }
  }
  // Iran usually sights the new moon a day after the astronomical calendar starts the month.
  const shifted = dayNumber - 1;
  if (estimator) {
    const parts = estimator.formatToParts(new Date(shifted * DAY_MS + DAY_MS / 2));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value.replace(/\D/g, ''));
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (year && month && day) return { year, month, day, estimated: true };
  }
  return { ...tabularHijri(shifted), estimated: true };
}

/** Arithmetic (civil) Islamic calendar, for environments without Intl calendar support. */
export function tabularHijri(dayNumber: number): Omit<HijriDate, 'estimated'> {
  const jd = dayNumber + 2440588; // Julian day number at noon
  const l0 = jd - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  const l1 = l0 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 = l1 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l2) / 709);
  const day = l2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

function hijriFromDayNumber(dayNumber: number): HijriDate {
  for (let i = TABLE.length - 1; i >= 0; i--) {
    const entry = TABLE[i];
    if (entry.start > dayNumber) continue;
    const day = dayNumber - entry.start + 1;
    const next = TABLE[i + 1];
    // The last listed month has no known end, so only its first 29 days are certain.
    if (next ? dayNumber < next.start : day <= 29) {
      return { year: entry.year, month: entry.month, day, estimated: false };
    }
    break;
  }
  return estimateHijri(dayNumber);
}

/** Hijri date of a Jalali day (month 1-12), following Iran's official calendar where known. */
export function hijriDate(jy: number, jm: number, jd: number): HijriDate {
  return hijriFromDayNumber(jalaliDayNumber(jy, jm, jd));
}

// Read from the title, so a day an admin entered on the calendar page gets its tone too.
const MOURNING_WORDS = ['شهادت', 'رحلت', 'وفات', 'تاسوعا', 'عاشورا', 'اربعین', 'ضربت', 'شب قدر', 'سوگواری', 'عزا'];
const JOY_WORDS = ['نوروز', 'عید', 'ولادت', 'میلاد', 'جشن', 'یلدا', 'مبعث', 'نیمه شعبان', 'روز طبیعت', 'چهارشنبه‌سوری', 'سال نو'];

/** Whether an occasion is festive, a day of mourning or neither; mourning wins when a title mentions both. */
export function occasionTone(title: string): OccasionTone {
  if (MOURNING_WORDS.some((w) => title.includes(w))) return 'mourning';
  if (JOY_WORDS.some((w) => title.includes(w))) return 'joy';
  return 'normal';
}

const pad = (n: number) => String(n).padStart(2, '0');
const toOccasions = (entries: Entry[] | undefined, kind: OccasionKind): Occasion[] =>
  (entries ?? []).map(([title, holiday]) => ({ title, holiday: Boolean(holiday), kind, tone: occasionTone(title) }));

/** Built-in occasions of a Jalali day (month 1-12), official holidays first. */
export function occasionsFor(jy: number, jm: number, jd: number): Occasion[] {
  const dayNumber = jalaliDayNumber(jy, jm, jd);
  const result = toOccasions(SOLAR[`${pad(jm)}-${pad(jd)}`], 'solar');

  // Chaharshanbe Suri is the evening of the year's last Tuesday.
  if (jm === 12 && new Date(dayNumber * DAY_MS).getUTCDay() === 2 && jd > moment.jDaysInMonth(jy, 11) - 7) {
    result.push({ title: 'چهارشنبه‌سوری', holiday: false, kind: 'solar', tone: 'joy' });
  }

  const hijri = hijriFromDayNumber(dayNumber);
  result.push(...toOccasions(LUNAR[`${pad(hijri.month)}-${pad(hijri.day)}`], 'lunar'));
  if (hijriFromDayNumber(dayNumber + 1).day === 1) {
    result.push(...toOccasions(LUNAR[`${pad(hijri.month)}-last`], 'lunar'));
  }

  const g = new Date(dayNumber * DAY_MS);
  result.push(...toOccasions(WORLD[`${pad(g.getUTCMonth() + 1)}-${pad(g.getUTCDate())}`], 'world'));

  return result.sort((a, b) => Number(b.holiday) - Number(a.holiday));
}

/** Gregorian date of a Jalali day (month 1-12), as UTC year/month(1-12)/day. */
export function gregorianDate(jy: number, jm: number, jd: number): { year: number; month: number; day: number } {
  const g = new Date(jalaliDayNumber(jy, jm, jd) * DAY_MS);
  return { year: g.getUTCFullYear(), month: g.getUTCMonth() + 1, day: g.getUTCDate() };
}
