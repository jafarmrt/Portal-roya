import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import moment from 'moment-jalaali';
import { z } from 'zod';
import { isValidJalaliDate, todayJalali } from '../../shared/jalali.js';
import {
  DAY_QUESTION_OPTION_MAX,
  DAY_QUESTION_OPTIONS_MAX,
  DAY_QUESTION_OPTIONS_MIN,
  DAY_QUESTION_TEXT_MAX,
  DAY_QUESTION_THEME_IDS,
  DAY_QUESTIONS_MAX,
  questionProblem,
  themeLabel,
} from '../../shared/dayQuestion.js';
import { DAY_STEP_OUTCOMES, DAY_STEPS, dayStepOrder } from '../../shared/dayStep.js';
import { goodShare, MOOD_MIN_ANSWERS, MOOD_REASON_IDS, MOOD_REASONS_MAX, MOOD_TEAM_DAYS, MOOD_VALUES, type Mood, type MoodTeam } from '../../shared/mood.js';
import { audit } from '../audit.js';
import { can, requirePermission } from '../auth.js';
import { addSampleQuestions, answerToday, bankView, clearDayQuestionCache, loadBank, questionToday } from '../dayQuestions.js';
import { db } from '../db/index.js';
import { dayAnswers, dayQuestionDays, dayQuestions, dayStepCounts, moods, news, settings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { clearMoodReportCache, moodReport } from '../moodReport.js';
import { heardDraft, isMoodReportDays, type MoodReportDays } from '../../shared/moodReport.js';
import { questionResults } from '../../shared/dayQuestion.js';
import { ensureSettings } from '../settings.js';

export const moodsRouter = Router();

const FORMAT = 'jYYYY/jMM/jDD';

type DayCounts = Map<string, Partial<Record<Mood, number>>>;

/** How many colleagues chose each answer on each day since `since` (a Jalali date). */
async function countsSince(since: string): Promise<DayCounts> {
  const rows = await db
    .select({ date: moods.date, mood: moods.mood, count: sql<number>`count(*)::int` })
    .from(moods)
    .where(gte(moods.date, since))
    .groupBy(moods.date, moods.mood);
  const days: DayCounts = new Map();
  for (const row of rows) {
    const day = days.get(row.date) ?? {};
    day[row.mood as Mood] = row.count;
    days.set(row.date, day);
  }
  return days;
}

// «حال‌وهوای ما» is the same for everyone and is asked for by every dashboard that opens, so it is
// worked out at most once a minute. A new answer clears it: the colleague who just answered sees
// themselves counted.
const TEAM_TTL_MS = 60_000;
let teamCache: { at: number; value: MoodTeam } | null = null;

export function clearMoodTeamCache() {
  teamCache = null;
}

async function moodTeam(): Promise<MoodTeam> {
  const date = todayJalali();
  if (teamCache && teamCache.value.date === date && Date.now() - teamCache.at < TEAM_TTL_MS) return teamCache.value;
  const first = moment().subtract(MOOD_TEAM_DAYS - 1, 'days');
  const counts = await countsSince(first.format(FORMAT));
  const days = Array.from({ length: MOOD_TEAM_DAYS }, (_, i) => {
    const day = first.clone().add(i, 'days').format(FORMAT);
    return { date: day, good: goodShare(counts.get(day) ?? {}).good };
  });
  const today = goodShare(counts.get(date) ?? {});
  const value: MoodTeam = { date, answers: today.good === null ? null : today.answers, good: today.good, days };
  teamCache = { at: Date.now(), value };
  return value;
}

const serializeMood = (row: typeof moods.$inferSelect) => ({ id: String(row.id), userId: row.userId, date: row.date, mood: row.mood, reasons: row.reasons });

moodsRouter.post(
  '/moods',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { mood } = parse(z.object({ mood: z.enum(MOOD_VALUES) }), req.body);
    const date = todayJalali();
    const [row] = await db
      .insert(moods)
      .values({ userId: viewer.id, date, mood })
      // The reasons went with the mood they were given for; another mood starts without them.
      .onConflictDoUpdate({
        target: [moods.userId, moods.date],
        set: { mood, submittedAt: new Date(), reasons: sql`case when ${moods.mood} = ${mood} then ${moods.reasons} else '{}'::text[] end` },
      })
      .returning();
    clearMoodTeamCache();
    clearMoodReportCache();
    res.json({ mood: serializeMood(row) });
  }),
);

// «چه چیزی بیشتر اثر داشت؟»: up to three reasons added to today's mood, or taken off again.
moodsRouter.put(
  '/moods/reasons',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { reasons } = parse(z.object({ reasons: z.array(z.enum(MOOD_REASON_IDS)).max(MOOD_REASONS_MAX) }), req.body);
    const [row] = await db
      .update(moods)
      .set({ reasons: [...new Set(reasons)] })
      .where(and(eq(moods.userId, viewer.id), eq(moods.date, todayJalali())))
      .returning();
    if (!row) throw new HttpError(409, 'اول حال امروزتان را انتخاب کنید.');
    clearMoodReportCache();
    res.json({ mood: serializeMood(row) });
  }),
);

moodsRouter.get(
  '/moods/me',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db.select().from(moods).where(eq(moods.userId, viewer.id)).orderBy(desc(moods.date)).limit(60);
    res.json(rows.map(serializeMood));
  }),
);

// What comes back to every colleague after answering: shares only, and nothing below the minimum.
moodsRouter.get(
  '/moods/team',
  route(async (req, res) => {
    currentUser(req);
    res.json(await moodTeam());
  }),
);

// «یک قدم برای امروز»: one more for today's count of this kind of step and what became of it. Nothing
// about the colleague is kept, here or in the audit log: the step offered depends on their mood.
moodsRouter.post(
  '/moods/steps',
  route(async (req, res) => {
    currentUser(req);
    const { kind, outcome } = parse(z.object({ kind: z.enum(DAY_STEPS), outcome: z.enum(DAY_STEP_OUTCOMES) }), req.body);
    await db
      .insert(dayStepCounts)
      .values({ date: todayJalali(), kind, outcome, count: 1 })
      .onConflictDoUpdate({ target: [dayStepCounts.date, dayStepCounts.kind, dayStepCounts.outcome], set: { count: sql`${dayStepCounts.count} + 1` } });
    res.status(204).end();
  }),
);

// Aggregated counts only: managers never see an individual's mood. A day with fewer answers than the
// minimum is left out altogether, so nobody's answer can be read off a nearly empty day.
moodsRouter.get(
  '/moods/summary',
  requirePermission('reports.view'),
  route(async (_req, res) => {
    const counts = await countsSince(moment().subtract(30, 'days').format(FORMAT));
    const rows: { date: string; mood: Mood; count: number }[] = [];
    for (const [date, day] of counts) {
      if (goodShare(day).answers < MOOD_MIN_ANSWERS) continue;
      for (const mood of MOOD_VALUES) if (day[mood]) rows.push({ date, mood, count: day[mood] });
    }
    res.json(rows);
  }),
);

// ---- «پرسش روز» ---------------------------------------------------------------------------------

// Today's question for the card, with the colleague's own answer and, once they answered, everyone's.
moodsRouter.get(
  '/moods/question',
  route(async (req, res) => {
    res.json(await questionToday(currentUser(req).id));
  }),
);

moodsRouter.post(
  '/moods/question',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { option } = parse(z.object({ option: z.number().int().min(0).max(DAY_QUESTION_OPTIONS_MAX - 1) }), req.body);
    if (!(await answerToday(viewer.id, option))) throw new HttpError(400, 'این گزینه در پرسش امروز نیست.');
    res.json(await questionToday(viewer.id));
  }),
);

// What colleagues answered to the questions of the last 30 days, for the managers' report: totals
// only, and a day with fewer answers than the minimum is left out.
moodsRouter.get(
  '/moods/questions/results',
  requirePermission('reports.view'),
  route(async (req, res) => {
    res.json(await askedDays(reportDays(req.query.days)));
  }),
);

/** The range a report is asked for: 30 days unless it names one of the others. */
function reportDays(value: unknown): MoodReportDays {
  const days = Number(value ?? 30);
  if (!isMoodReportDays(days)) throw new HttpError(400, 'بازهٔ گزارش درست نیست.');
  return days;
}

/** Each day's question in the range with how many chose each option; days below the minimum are left out. */
async function askedDays(range: number) {
  const since = moment().subtract(range - 1, 'days').format(FORMAT);
  const days = await db
    .select({ date: dayQuestionDays.date, id: dayQuestions.id, text: dayQuestions.text, theme: dayQuestions.theme, options: dayQuestions.options })
    .from(dayQuestionDays)
    .innerJoin(dayQuestions, eq(dayQuestions.id, dayQuestionDays.questionId))
    .where(gte(dayQuestionDays.date, since))
    .orderBy(desc(dayQuestionDays.date));
  const counts = await db
    .select({ date: dayAnswers.date, questionId: dayAnswers.questionId, option: dayAnswers.option, count: sql<number>`count(*)::int` })
    .from(dayAnswers)
    .where(gte(dayAnswers.date, since))
    .groupBy(dayAnswers.date, dayAnswers.questionId, dayAnswers.option);
  const rows = days
    .map((day) => ({
      date: day.date,
      text: day.text,
      theme: day.theme,
      options: day.options,
      counts: day.options.map((_, i) => counts.find((c) => c.date === day.date && c.questionId === day.id && c.option === i)?.count ?? 0),
    }))
    .filter((day) => day.counts.reduce((sum, n) => sum + n, 0) >= MOOD_MIN_ANSWERS);
  return rows;
}

// The managers' report of a range: the trend, participation, units, reasons and the day's steps. Totals only.
moodsRouter.get(
  '/moods/report',
  requirePermission('reports.view'),
  route(async (req, res) => {
    res.json(await moodReport(reportDays(req.query.days)));
  }),
);

// «شنیدیم»: a news draft that tells colleagues what their answers added up to, for whoever publishes
// news to complete with what was done about it.
moodsRouter.post(
  '/moods/report/heard',
  requirePermission('reports.view'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    if (!can(viewer, 'news.manage')) throw new HttpError(403, 'برای ساختن پیش‌نویس خبر، دسترسی انتشار اخبار لازم است.');
    const { days } = parse(z.object({ days: z.number() }), req.body);
    const report = await moodReport(reportDays(days));
    if (report.totals.answers === 0) throw new HttpError(400, 'در این بازه پاسخ کافی برای گزارش نیست.');
    // The latest question with enough answers, and what most colleagues said.
    const [latest] = await askedDays(report.days);
    const shares = latest ? questionResults(latest.counts)?.shares : undefined;
    const top = shares ? shares.indexOf(Math.max(...shares)) : -1;
    const draft = heardDraft(report, latest && shares ? { text: latest.text, option: latest.options[top], share: shares[top] } : null);
    const row = await ensureSettings();
    const id = newId('news');
    await db.insert(news).values({ id, ...draft, contentFormat: 'text', category: row.newsCategories[0] ?? 'اخبار سازمان', authorId: viewer.id, isDraft: true });
    await audit(viewer, { action: 'create', entity: 'news', id, title: draft.title, detail: 'پیش‌نویس «شنیدیم» از گزارش حال‌وهوا' });
    broadcastChange('news');
    res.status(201).json({ draftId: id });
  }),
);

// The bank, for whoever looks after «شروع روز».
moodsRouter.get(
  '/moods/questions',
  requirePermission('mood.manage'),
  route(async (_req, res) => {
    res.json(await bankView());
  }),
);

const questionSchema = z.object({
  text: z.string().trim().min(1, 'متن پرسش را بنویسید.').max(DAY_QUESTION_TEXT_MAX),
  options: z.array(z.string().trim().min(1, 'گزینهٔ خالی را پر یا حذف کنید.').max(DAY_QUESTION_OPTION_MAX)).min(DAY_QUESTION_OPTIONS_MIN).max(DAY_QUESTION_OPTIONS_MAX),
  theme: z.enum(DAY_QUESTION_THEME_IDS),
  active: z.boolean().default(true),
  pinnedDate: z.string().refine((v) => v === '' || isValidJalaliDate(v), 'تاریخ را درست وارد کنید.').default(''),
});

/** A day can be picked for one question only, not in the past, and not once the day's question is out. */
async function checkPinnedDate(pinnedDate: string, id: string | null) {
  if (!pinnedDate) return;
  const today = todayJalali();
  if (pinnedDate < today) throw new HttpError(400, 'روز انتخاب‌شده گذشته است.');
  const [other] = await db
    .select({ id: dayQuestions.id })
    .from(dayQuestions)
    .where(and(eq(dayQuestions.pinnedDate, pinnedDate), id ? ne(dayQuestions.id, id) : undefined));
  if (other) throw new HttpError(400, 'برای این روز پرسش دیگری انتخاب شده است.');
  const [given] = await db.select().from(dayQuestionDays).where(eq(dayQuestionDays.date, pinnedDate));
  if (given && given.questionId !== id) throw new HttpError(400, 'پرسش امروز پرسیده شده است؛ روز دیگری را انتخاب کنید.');
}

moodsRouter.post(
  '/moods/questions',
  requirePermission('mood.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(questionSchema, req.body);
    const problem = questionProblem(body);
    if (problem) throw new HttpError(400, problem);
    const bank = await loadBank();
    if (bank.length >= DAY_QUESTIONS_MAX) throw new HttpError(400, 'بانک پرسش پر است؛ اول چند پرسش قدیمی را حذف کنید.');
    await checkPinnedDate(body.pinnedDate, null);
    const position = bank.reduce((max, q) => Math.max(max, q.position), -1) + 1;
    await db.insert(dayQuestions).values({ id: newId('dq'), ...body, position });
    clearDayQuestionCache();
    await audit(viewer, { action: 'create', entity: 'settings', title: 'پرسش روز', detail: `${body.text} (${themeLabel(body.theme)})` });
    res.status(201).json(await bankView());
  }),
);

moodsRouter.post(
  '/moods/questions/samples',
  requirePermission('mood.manage'),
  route(async (req, res) => {
    const added = await addSampleQuestions();
    if (added > 0) await audit(currentUser(req), { action: 'create', entity: 'settings', title: 'پرسش روز', detail: `${added} پرسش نمونه` });
    res.json({ added, ...(await bankView()) });
  }),
);

moodsRouter.put(
  '/moods/questions/:id',
  requirePermission('mood.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(questionSchema, req.body);
    const problem = questionProblem(body);
    if (problem) throw new HttpError(400, problem);
    const [before] = await db.select().from(dayQuestions).where(eq(dayQuestions.id, req.params.id));
    if (!before) throw new HttpError(404, 'این پرسش پیدا نشد.');
    const [asked] = await db.select({ date: dayQuestionDays.date }).from(dayQuestionDays).where(eq(dayQuestionDays.questionId, before.id)).limit(1);
    // The answers of a day point at an option by its place, so the options of a question that was asked stay as they are.
    if (asked && JSON.stringify(before.options) !== JSON.stringify(body.options)) {
      throw new HttpError(400, 'این پرسش پرسیده شده و پاسخ دارد؛ گزینه‌هایش عوض نمی‌شود. آن را خاموش کنید و پرسش تازه‌ای بنویسید.');
    }
    if (body.pinnedDate !== before.pinnedDate) await checkPinnedDate(body.pinnedDate, before.id);
    await db.update(dayQuestions).set(body).where(eq(dayQuestions.id, before.id));
    clearDayQuestionCache();
    await audit(viewer, { action: 'update', entity: 'settings', title: 'پرسش روز', detail: `${body.text}${body.active ? '' : ' (خاموش)'}` });
    res.json(await bankView());
  }),
);

moodsRouter.delete(
  '/moods/questions/:id',
  requirePermission('mood.manage'),
  route(async (req, res) => {
    const [before] = await db.select().from(dayQuestions).where(eq(dayQuestions.id, req.params.id));
    if (!before) throw new HttpError(404, 'این پرسش پیدا نشد.');
    const [asked] = await db.select({ date: dayQuestionDays.date }).from(dayQuestionDays).where(eq(dayQuestionDays.questionId, before.id)).limit(1);
    if (asked) throw new HttpError(409, 'این پرسش پرسیده شده و پاسخ دارد؛ به‌جای حذف، آن را خاموش کنید.');
    await db.delete(dayQuestions).where(eq(dayQuestions.id, before.id));
    clearDayQuestionCache();
    await audit(currentUser(req), { action: 'delete', entity: 'settings', title: 'پرسش روز', detail: before.text });
    res.json(await bankView());
  }),
);

// The order «یک قدم برای امروز» tries its steps in, for everyone.
moodsRouter.put(
  '/moods/programme',
  requirePermission('mood.manage'),
  route(async (req, res) => {
    const { stepOrder } = parse(z.object({ stepOrder: z.array(z.enum(DAY_STEPS)).max(DAY_STEPS.length) }), req.body);
    await ensureSettings();
    const order = dayStepOrder(stepOrder);
    // The built-in order is kept as "none", so a step added later takes its built-in place.
    const same = order.every((kind, i) => kind === DAY_STEPS[i]);
    await db.update(settings).set({ dayStepOrder: same ? [] : order }).where(eq(settings.id, 'global'));
    await audit(currentUser(req), { action: 'update', entity: 'settings', title: 'ترتیب پیشنهادهای «شروع روز»', detail: same ? 'ترتیب پیش‌فرض' : order.join('، ') });
    broadcastChange('settings');
    res.json({ stepOrder: same ? [] : order });
  }),
);
