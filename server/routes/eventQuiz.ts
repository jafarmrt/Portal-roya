import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { toPersianDigits } from '../../shared/jalali.js';
import {
  DEFAULT_SCREEN,
  QUIZ_GRACE_MS,
  QUIZ_MAX,
  QUIZ_OPTION_MAX,
  QUIZ_SECONDS,
  QUIZ_TEXT_MAX,
  type QuizState,
  quizPoints,
} from '../../shared/specialEvents.js';
import type { SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { eventQuizAnswers, eventQuizQuestions, specialEvents } from '../db/schema.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { type EventRow, type Viewer, announceChange, eventOf, eventView, logAction, phaseOf, requireReferee, rolesOf, saveScreen } from './specialEvents.js';

// «مسابقهٔ همه‌با‌هم»: on the night the organizers open one question at a time; the question and four
// colored options are on the big screen, everyone in the hall answers on their phone before the clock
// runs out, then the answer is shown and a table of points (right and fast) follows. The organizers
// write the questions beforehand, so they do not play.

export const eventQuizRouter = Router();

const freshView = async (eventId: string, viewer: SessionUser) => eventView(await eventOf(eventId), viewer);

/** Players: anyone signed in who did not write the questions. */
const plays = (ev: EventRow, viewer: Viewer) => Boolean(viewer && !ev.organizerIds.includes(viewer.id) && (ev.status === 'active' || rolesOf(ev, viewer).referee));

/** The night's quiz runs once the program has started (or in the rehearsal of the night). */
const quizTime = (ev: EventRow) => phaseOf(ev) === 'live';

export async function quizView(ev: EventRow, viewer: Viewer) {
  const roles = rolesOf(ev, viewer);
  const now = Date.now();
  const questions = await db.select().from(eventQuizQuestions).where(eq(eventQuizQuestions.eventId, ev.id)).orderBy(asc(eventQuizQuestions.sortOrder));
  const ids = questions.map((q) => q.id);
  const answers = ids.length ? await db.select().from(eventQuizAnswers).where(inArray(eventQuizAnswers.questionId, ids)) : [];
  const state = ev.quizState;
  const current = state ? questions.find((q) => q.id === state.questionId) : undefined;

  // Points count once a question's answer is shown (the one on now only after its reveal).
  const counted = questions.filter((q) => q.askedAt && (q.id !== current?.id || state?.revealedAt));
  const totals = new Map<string, { points: number; correct: number }>();
  for (const q of counted) {
    for (const a of answers.filter((x) => x.questionId === q.id)) {
      const t = totals.get(a.employeeId) ?? { points: 0, correct: 0 };
      const right = a.choice === q.correct;
      t.points += quizPoints(right, a.ms, q.seconds);
      if (right) t.correct += 1;
      totals.set(a.employeeId, t);
    }
  }
  const ranked = [...totals.entries()]
    .map(([employeeId, t]) => ({ employeeId, ...t }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.employeeId.localeCompare(b.employeeId));
  const rankOf = (i: number) => ranked.findIndex((x) => x.points === ranked[i].points) + 1;
  // Only those with points make the table (no medal for nothing).
  const leaders = ranked.slice(0, 10).map((r, i) => ({ ...r, rank: rankOf(i) })).filter((r) => r.points > 0);
  const myIndex = viewer ? ranked.findIndex((r) => r.employeeId === viewer.id) : -1;

  let currentPart = null;
  if (state && current) {
    const own = answers.filter((a) => a.questionId === current.id);
    const mine = viewer ? own.find((a) => a.employeeId === viewer.id) : undefined;
    const revealed = Boolean(state.revealedAt);
    currentPart = {
      id: current.id,
      index: questions.indexOf(current) + 1,
      text: current.text,
      options: current.options,
      seconds: current.seconds,
      openedAt: state.openedAt,
      closesAt: state.closesAt,
      open: !revealed && now < new Date(state.closesAt).getTime(),
      revealed,
      correct: revealed || roles.isOrganizer ? current.correct : null,
      answered: own.length,
      counts: revealed || roles.isOrganizer ? current.options.map((_, i) => own.filter((a) => a.choice === i).length) : null,
      myChoice: mine?.choice ?? null,
      myPoints: mine && revealed ? quizPoints(mine.choice === current.correct, mine.ms, current.seconds) : null,
    };
  }

  return {
    quiz: {
      count: questions.length,
      asked: questions.filter((q) => q.askedAt).length,
      // The questions themselves are for those who write them; colleagues see only the one on now.
      questions: roles.isOrganizer
        ? questions.map((q) => ({ id: q.id, text: q.text, options: q.options, correct: q.correct, seconds: q.seconds, asked: Boolean(q.askedAt) }))
        : [],
      current: currentPart,
      leaders,
      me: viewer && myIndex >= 0 ? { ...ranked[myIndex], rank: rankOf(myIndex) } : null,
      canPlay: plays(ev, viewer),
      live: quizTime(ev),
    },
    peopleIds: leaders.map((l) => l.employeeId),
  };
}

// ─── The organizers write the questions ──────────────────────────────────────

const questionsSchema = z.object({
  questions: z
    .array(
      z
        .object({
          id: z.string().max(100).optional(),
          text: z.string().trim().min(3, 'متن سؤال را بنویسید.').max(QUIZ_TEXT_MAX),
          options: z.array(z.string().trim().min(1, 'گزینهٔ خالی نگذارید.').max(QUIZ_OPTION_MAX)).min(2, 'هر سؤال دست‌کم ۲ گزینه دارد.').max(4, 'هر سؤال حداکثر ۴ گزینه دارد.'),
          correct: z.number().int().min(0),
          seconds: z.number().int().min(QUIZ_SECONDS.min).max(QUIZ_SECONDS.max).optional(),
        })
        .refine((q) => q.correct < q.options.length, 'گزینهٔ درست را انتخاب کنید.'),
    )
    .max(QUIZ_MAX, `حداکثر ${toPersianDigits(QUIZ_MAX)} سؤال.`),
});

eventQuizRouter.put(
  '/special_events/:id/quiz_questions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'سؤال‌ها را برگزارکنندگان می‌نویسند.');
    if (ev.quizState && !ev.quizState.revealedAt) throw new HttpError(400, 'یک سؤال الان باز است؛ اول جوابش را نشان دهید.');
    const { questions } = parse(questionsSchema, req.body);
    const existing = await db.select().from(eventQuizQuestions).where(eq(eventQuizQuestions.eventId, ev.id));
    const kept = new Set<string>();
    await db.transaction(async (tx) => {
      for (const [i, q] of questions.entries()) {
        const old = q.id ? existing.find((e) => e.id === q.id) : undefined;
        const values = { text: q.text, options: q.options, correct: q.correct, seconds: q.seconds ?? QUIZ_SECONDS.default, sortOrder: i };
        if (old) {
          kept.add(old.id);
          await tx.update(eventQuizQuestions).set(values).where(eq(eventQuizQuestions.id, old.id));
        } else {
          await tx.insert(eventQuizQuestions).values({ id: newId('quiz'), eventId: ev.id, ...values });
        }
      }
      const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
      if (gone.length) await tx.delete(eventQuizQuestions).where(inArray(eventQuizQuestions.id, gone));
    });
    if (ev.quizState && !kept.has(ev.quizState.questionId)) await db.update(specialEvents).set({ quizState: null }).where(eq(specialEvents.id, ev.id));
    await logAction(ev, viewer.id, 'سؤال‌های مسابقهٔ همه به‌روز شد', `${toPersianDigits(questions.length)} سؤال`);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── On the night (organizers and jurors, from the remote) ───────────────────

async function setState(ev: EventRow, quizState: QuizState | null) {
  await db.update(specialEvents).set({ quizState, updatedAt: new Date() }).where(eq(specialEvents.id, ev.id));
}

/** The next question not yet asked (or the one named) opens, and the big screen shows it. */
eventQuizRouter.post(
  '/special_events/:id/quiz/next',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    if (!quizTime(ev)) throw new HttpError(400, 'مسابقهٔ همه بعد از شروع برنامه اجرا می‌شود.');
    if (ev.quizState && !ev.quizState.revealedAt) throw new HttpError(400, 'اول جواب سؤال فعلی را نشان دهید.');
    const { questionId } = parse(z.object({ questionId: z.string().optional() }), req.body ?? {});
    const [question] = questionId
      ? await db.select().from(eventQuizQuestions).where(and(eq(eventQuizQuestions.id, questionId), eq(eventQuizQuestions.eventId, ev.id)))
      : await db
          .select()
          .from(eventQuizQuestions)
          .where(and(eq(eventQuizQuestions.eventId, ev.id), isNull(eventQuizQuestions.askedAt)))
          .orderBy(asc(eventQuizQuestions.sortOrder))
          .limit(1);
    if (!question) throw new HttpError(400, questionId ? 'این سؤال پیدا نشد.' : 'همهٔ سؤال‌ها پرسیده شده‌اند.');
    // Asked again (from the list): the earlier answers to it no longer count.
    await db.delete(eventQuizAnswers).where(eq(eventQuizAnswers.questionId, question.id));
    const now = new Date();
    await db.update(eventQuizQuestions).set({ askedAt: now }).where(eq(eventQuizQuestions.id, question.id));
    await setState(ev, { questionId: question.id, openedAt: now.toISOString(), closesAt: new Date(now.getTime() + question.seconds * 1000).toISOString(), revealedAt: null });
    const screen = ev.screen ?? DEFAULT_SCREEN;
    await saveScreen(ev, { ...screen, scene: 'quiz', version: screen.version + 1 });
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The answer is shown on the screen and the phones; points of this question count from now. */
eventQuizRouter.post(
  '/special_events/:id/quiz/reveal',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    const state = ev.quizState;
    if (!state) throw new HttpError(400, 'سؤالی باز نیست.');
    if (!state.revealedAt) {
      const now = new Date();
      await setState(ev, { ...state, revealedAt: now.toISOString(), closesAt: new Date(Math.min(new Date(state.closesAt).getTime(), now.getTime())).toISOString() });
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** From the start (after the rehearsal): every answer goes and no question counts as asked. */
eventQuizRouter.post(
  '/special_events/:id/quiz/reset',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    const ids = (await db.select({ id: eventQuizQuestions.id }).from(eventQuizQuestions).where(eq(eventQuizQuestions.eventId, ev.id))).map((q) => q.id);
    if (ids.length) {
      await db.delete(eventQuizAnswers).where(inArray(eventQuizAnswers.questionId, ids));
      await db.update(eventQuizQuestions).set({ askedAt: null }).where(inArray(eventQuizQuestions.id, ids));
    }
    await setState(ev, null);
    await logAction(ev, viewer.id, 'مسابقهٔ همه از اول شد', '');
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** A colleague's answer: once, to the question on now, before its clock runs out. */
eventQuizRouter.put(
  '/event_quiz/:id/answer',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [question] = await db.select().from(eventQuizQuestions).where(eq(eventQuizQuestions.id, req.params.id));
    if (!question) throw new HttpError(404, 'این سؤال پیدا نشد.');
    const ev = await eventOf(question.eventId);
    if (!plays(ev, viewer)) throw new HttpError(403, 'برگزارکنندگان که سؤال‌ها را نوشته‌اند در مسابقه شرکت نمی‌کنند.');
    const state = ev.quizState;
    const now = Date.now();
    if (!state || state.questionId !== question.id || state.revealedAt || now > new Date(state.closesAt).getTime() + QUIZ_GRACE_MS) {
      throw new HttpError(400, 'وقت جواب دادن به این سؤال تمام شده است.');
    }
    const { choice } = parse(z.object({ choice: z.number().int().min(0).max(question.options.length - 1) }), req.body);
    const ms = Math.max(0, now - new Date(state.openedAt).getTime());
    const inserted = await db.insert(eventQuizAnswers).values({ questionId: question.id, employeeId: viewer.id, choice, ms }).onConflictDoNothing().returning();
    if (inserted.length === 0) throw new HttpError(409, 'به این سؤال جواب داده‌اید.');
    // No announcement: forty phones refetching on every tap is too much; the big screen polls anyway.
    res.json(await freshView(ev.id, viewer));
  }),
);
