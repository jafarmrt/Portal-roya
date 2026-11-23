import moment from 'moment-jalaali';
import { MOOD_SCORE, type Mood } from './mood.js';

// «شروع روز» at the other end of the day and of the week: the afternoon wrap-up of the day's notes,
// «هفتهٔ من» (the colleague's own last week, for their eyes only) and the morning reminder they may
// switch on for themselves.

const FORMAT = 'jYYYY/jMM/jDD';
const parse = (date: string) => moment(date, FORMAT);

/** From this hour the card asks what became of the day's notes. */
export const DAY_WRAP_FROM = 15;

export interface DayWrapFacts {
  /** 0–23, on the colleague's clock. */
  hour: number;
  mood: Mood;
  /** Notes due today: ticked off, and still open. */
  done: number;
  open: number;
  /** The wrap-up was answered or closed today already. */
  settled: boolean;
}

/**
 * Whether the afternoon wrap-up is shown: once a day, from DAY_WRAP_FROM, to someone who had notes
 * for today. Not on a hard day: such a day is not asked about work.
 */
export const wrapDue = (f: DayWrapFacts) => f.hour >= DAY_WRAP_FROM && !f.settled && f.done + f.open > 0 && MOOD_SCORE[f.mood] >= 3;

/** What the wrap-up says. */
export function wrapLine(done: number, open: number, fa: (n: number) => string): string {
  const all = done + open;
  if (open === 0) return all === 1 ? 'کار امروزتان انجام شد. خسته نباشید!' : `هر ${fa(all)} کار امروز انجام شد. خسته نباشید!`;
  if (done === 0) return all === 1 ? 'کار امروزتان هنوز باز است. به فردا ببرم؟' : `${fa(all)} کار امروز هنوز باز است. به فردا ببرم؟`;
  return `از ${fa(all)} کار امروز ${fa(done)} تا انجام شد. ${open === 1 ? 'آن یکی' : 'بقیه'} را به فردا ببرم؟`;
}

/** The week before the one `today` is in: from its Saturday to its Friday. */
export function previousWeek(today: string): { from: string; to: string } {
  const day = parse(today);
  const saturday = day.subtract(((day.day() + 1) % 7) + 7, 'days');
  return { from: saturday.format(FORMAT), to: saturday.clone().add(6, 'days').format(FORMAT) };
}

/** How many of a week's days «هفتهٔ من» shows the mood of: Saturday to Wednesday. */
export const MY_WEEK_MOOD_DAYS = 5;

/** A colleague's own last week in the portal. Only they ever get it. */
export interface MyWeek {
  from: string;
  to: string;
  /** Notes ticked off in the week. */
  notesDone: number;
  /** Work handed to them that they finished in the week. */
  tasksDone: number;
  /** Recognitions they gave, and received, in the week. */
  given: number;
  received: number;
  /** Their mood on Saturday to Wednesday; null for a day without an answer. */
  moods: (Mood | null)[];
}

/** A week with nothing in it gets no card: nobody is told they did nothing. */
export const weekIsEmpty = (week: MyWeek) => week.notesDone + week.tasksDone + week.given + week.received === 0 && week.moods.every((m) => m === null);

/** The morning reminder goes out between these hours, so a server started late does not send a "good morning" at noon. */
export const DAY_REMINDER_HOURS = { from: 8, until: 11 };
export const DAY_REMINDER = { title: 'شروع روز ☀️', message: 'حال امروزتان چطور است؟ یک لمس، و بعد ببینید بقیه چه گفتند.' };
