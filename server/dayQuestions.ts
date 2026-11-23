import { asc, eq, sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { dayAnswers, dayQuestionDays, dayQuestions } from './db/schema.js';
import {
  type DayQuestion,
  type DayQuestionRow,
  type DayQuestionTheme,
  type DayQuestionToday,
  pickQuestion,
  questionResults,
  restedCount,
  SAMPLE_DAY_QUESTIONS,
} from '../shared/dayQuestion.js';
import { todayJalali } from '../shared/jalali.js';
import { newId } from './http.js';

// «پرسش روز» on the server: the bank, which question a day was given, and what colleagues answered.

type QuestionRow = typeof dayQuestions.$inferSelect;

const toQuestion = (row: QuestionRow): DayQuestion => ({
  id: row.id,
  text: row.text,
  options: row.options,
  theme: row.theme as DayQuestionTheme,
  active: row.active,
  pinnedDate: row.pinnedDate,
});

export const loadBank = () => db.select().from(dayQuestions).orderBy(asc(dayQuestions.position), asc(dayQuestions.createdAt), asc(dayQuestions.id));

/** The last day each question was asked, and how often. */
async function askedDays() {
  const rows = await db
    .select({ questionId: dayQuestionDays.questionId, last: sql<string>`max(${dayQuestionDays.date})`, times: sql<number>`count(*)::int` })
    .from(dayQuestionDays)
    .groupBy(dayQuestionDays.questionId);
  return new Map(rows.map((r) => [r.questionId, { last: r.last, times: r.times }]));
}

/** The bank as its page shows it, and how many questions are left to ask in their turn. */
export async function bankView(): Promise<{ questions: DayQuestionRow[]; rested: number; today: string; todayId: string | null; samplesMissing: number }> {
  const today = todayJalali();
  const [bank, asked, [day]] = await Promise.all([loadBank(), askedDays(), db.select().from(dayQuestionDays).where(eq(dayQuestionDays.date, today))]);
  const questions = bank.map((row) => ({ ...toQuestion(row), lastAsked: asked.get(row.id)?.last ?? null, timesAsked: asked.get(row.id)?.times ?? 0 }));
  const last = new Map([...asked].map(([id, a]) => [id, a.last]));
  const have = new Set(bank.map((q) => q.sample));
  const samplesMissing = SAMPLE_DAY_QUESTIONS.filter((q) => !have.has(q.key)).length;
  return { questions, rested: restedCount(questions, last, today), today, todayId: day?.questionId ?? null, samplesMissing };
}

/** Adds the sample questions the bank does not have yet (by their key) and returns how many. */
export async function addSampleQuestions(): Promise<number> {
  const bank = await loadBank();
  const have = new Set(bank.map((q) => q.sample).filter(Boolean));
  const missing = SAMPLE_DAY_QUESTIONS.filter((q) => !have.has(q.key));
  if (missing.length === 0) return 0;
  const start = bank.reduce((max, q) => Math.max(max, q.position), -1) + 1;
  await db.insert(dayQuestions).values(
    // An occasion question waits, switched on, for a day to be picked for it; it is never asked without one.
    missing.map((q, i) => ({ id: newId('dq'), text: q.text, options: [...q.options], theme: q.theme, sample: q.key, position: start + i })),
  );
  clearDayQuestionCache();
  return missing.length;
}

/** A portal that never had a question starts with the samples; an emptied bank stays empty. */
export async function ensureSampleQuestions() {
  const [[question], [day]] = await Promise.all([db.select({ id: dayQuestions.id }).from(dayQuestions).limit(1), db.select({ date: dayQuestionDays.date }).from(dayQuestionDays).limit(1)]);
  if (question || day) return 0;
  return addSampleQuestions();
}

// Every dashboard asks for the day's question and its answers, so both are kept for a minute. A new
// answer or a change to the bank clears them.
const TTL_MS = 60_000;
let dayCache: { at: number; date: string; question: DayQuestion | null } | null = null;
let countsCache: { at: number; date: string; counts: number[] } | null = null;

export function clearDayQuestionCache() {
  dayCache = null;
  countsCache = null;
}

/** The question `date` was given. The first call of a day picks it and writes it down for everyone. */
export async function questionOfDay(date = todayJalali()): Promise<DayQuestion | null> {
  if (dayCache && dayCache.date === date && Date.now() - dayCache.at < TTL_MS) return dayCache.question;
  const given = async () => {
    const [row] = await db
      .select({ question: dayQuestions })
      .from(dayQuestionDays)
      .innerJoin(dayQuestions, eq(dayQuestions.id, dayQuestionDays.questionId))
      .where(eq(dayQuestionDays.date, date));
    return row ? toQuestion(row.question) : null;
  };
  let question = await given();
  if (!question) {
    const [bank, asked] = await Promise.all([loadBank(), askedDays()]);
    const picked = pickQuestion(date, bank.map(toQuestion), new Map([...asked].map(([id, a]) => [id, a.last])));
    if (picked) {
      // Two dashboards opening at the same moment: the first one's pick is the day's question for both.
      await db.insert(dayQuestionDays).values({ date, questionId: picked.id }).onConflictDoNothing();
      question = await given();
    }
  }
  dayCache = { at: Date.now(), date, question };
  return question;
}

async function countsOf(date: string, question: DayQuestion): Promise<number[]> {
  if (countsCache && countsCache.date === date && Date.now() - countsCache.at < TTL_MS) return countsCache.counts;
  const rows = await db
    .select({ option: dayAnswers.option, count: sql<number>`count(*)::int` })
    .from(dayAnswers)
    .where(sql`${dayAnswers.date} = ${date} and ${dayAnswers.questionId} = ${question.id}`)
    .groupBy(dayAnswers.option);
  const counts = question.options.map((_, i) => rows.find((r) => r.option === i)?.count ?? 0);
  countsCache = { at: Date.now(), date, counts };
  return counts;
}

/** What the card shows a colleague: the question, their own answer, and (once they answered) everyone's. */
export async function questionToday(userId: string): Promise<DayQuestionToday> {
  const date = todayJalali();
  const question = await questionOfDay(date);
  if (!question) return { date, question: null, mine: null, results: null };
  const [answer] = await db.select({ option: dayAnswers.option, questionId: dayAnswers.questionId }).from(dayAnswers).where(sql`${dayAnswers.userId} = ${userId} and ${dayAnswers.date} = ${date}`);
  const mine = answer && answer.questionId === question.id ? answer.option : null;
  return {
    date,
    question: { id: question.id, text: question.text, options: question.options, theme: question.theme },
    mine,
    // What others said is the answer's reward, and is not shown before it: nobody is led by the crowd.
    results: mine === null ? null : questionResults(await countsOf(date, question)),
  };
}

/** One answer a day; choosing again replaces it. Returns false when there is no such option today. */
export async function answerToday(userId: string, option: number): Promise<boolean> {
  const date = todayJalali();
  const question = await questionOfDay(date);
  if (!question || option < 0 || option >= question.options.length) return false;
  await db
    .insert(dayAnswers)
    .values({ userId, date, questionId: question.id, option })
    .onConflictDoUpdate({ target: [dayAnswers.userId, dayAnswers.date], set: { questionId: question.id, option, answeredAt: new Date() } });
  countsCache = null;
  return true;
}
