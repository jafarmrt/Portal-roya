import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { inAudience } from '../../shared/audience.js';
import { jalaliEndOfDay, toJalali } from '../../shared/jalali.js';
import { audienceIncludes, audienceOfRow, checkAudience } from '../audience.js';
import { can, type SessionUser, requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import {
  employees,
  pollAnswers,
  pollOptions,
  pollQuestions,
  pollResponses,
  polls,
  type PollQuestionType,
  type PollResultsVisibility,
} from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIdsFor, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { jalaliDate, optionalText, requiredText } from '../validation.js';

export const pollsRouter = Router();

type PollRow = typeof polls.$inferSelect;
type QuestionRow = typeof pollQuestions.$inferSelect;
type OptionRow = typeof pollOptions.$inferSelect;
type AnswerRow = typeof pollAnswers.$inferSelect;

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 15;
const CHOICE_TYPES: PollQuestionType[] = ['single', 'multiple'];

const isOpen = (p: PollRow, now = new Date()) => p.isActive && (!p.expiresAt || p.expiresAt > now);

/** The creator and poll managers run a poll: they always see its results and who has not answered. */
const runs = (viewer: SessionUser | null, p: PollRow) => Boolean(viewer && (can(viewer, 'polls.manage') || p.createdById === viewer.id));

/** Polls this viewer may see: their audience's, their own, or all of them for poll managers. */
function visibleTo(viewer: SessionUser | null) {
  const columns = { departments: polls.targetDepartments, locations: polls.targetLocations, roles: polls.targetRoles, userIds: polls.targetUserIds };
  if (viewer && can(viewer, 'polls.manage')) return undefined;
  return viewer ? or(audienceIncludes(columns, viewer), eq(polls.createdById, viewer.id)) : audienceIncludes(columns, null);
}

/** Whether the viewer may see the results, as the creator chose. */
function resultsVisible(viewer: SessionUser | null, p: PollRow, answered: boolean) {
  if (runs(viewer, p)) return true;
  const visibility: PollResultsVisibility = p.resultsVisibility;
  if (visibility === 'managers') return false;
  if (visibility === 'after_close') return !isOpen(p);
  return answered || !isOpen(p);
}

interface QuestionResults {
  /** People who answered this question. */
  answered: number;
  /** Votes per option id (multi-select questions count each chosen option). */
  votes?: Record<string, number>;
  /** Ratings 1 to 5: how many gave each, and the average. */
  ratings?: number[];
  average?: number | null;
  /** Written answers, without names; only when they are shown to this viewer. */
  texts?: string[];
}

function resultsOf(question: QuestionRow, answers: AnswerRow[], withTexts: boolean): QuestionResults {
  const mine = answers.filter((a) => a.questionId === question.id);
  const answered = new Set(mine.map((a) => a.responseId)).size;
  if (CHOICE_TYPES.includes(question.type)) {
    const votes: Record<string, number> = {};
    for (const a of mine) if (a.optionId) votes[a.optionId] = (votes[a.optionId] ?? 0) + 1;
    return { answered, votes };
  }
  if (question.type === 'rating') {
    const ratings = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const a of mine) {
      if (!a.rating) continue;
      ratings[a.rating - 1]++;
      sum += a.rating;
    }
    return { answered, ratings, average: answered > 0 ? Math.round((sum / answered) * 10) / 10 : null };
  }
  // Sorted by their words, so the order says nothing about who wrote first.
  const texts = withTexts ? mine.map((a) => a.text ?? '').filter(Boolean).sort((a, b) => a.localeCompare(b, 'fa')) : undefined;
  return { answered, texts };
}

async function serializePolls(rows: PollRow[], viewer: SessionUser | null) {
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const [questions, options, responses, creators, people] = await Promise.all([
    db.select().from(pollQuestions).where(inArray(pollQuestions.pollId, ids)).orderBy(pollQuestions.position),
    db.select().from(pollOptions).where(inArray(pollOptions.pollId, ids)).orderBy(pollOptions.position),
    db.select().from(pollResponses).where(inArray(pollResponses.pollId, ids)),
    db.select().from(employees).where(inArray(employees.id, rows.map((p) => p.createdById))),
    db
      .select({ id: employees.id, department: employees.department, location: employees.location, role: employees.role })
      .from(employees)
      .where(and(eq(employees.isActive, true), eq(employees.hasAccount, true))),
  ]);
  const answers = responses.length > 0 ? await db.select().from(pollAnswers).where(inArray(pollAnswers.responseId, responses.map((r) => r.id))) : [];
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  return rows.map((p) => {
    const pollResponsesOf = responses.filter((r) => r.pollId === p.id);
    const responseIds = new Set(pollResponsesOf.map((r) => r.id));
    const pollAnswersOf = answers.filter((a) => responseIds.has(a.responseId));
    const myResponse = viewer ? pollResponsesOf.find((r) => r.userId === viewer.id) : undefined;
    const manager = runs(viewer, p);
    const showResults = resultsVisible(viewer, p, Boolean(myResponse));
    const showTexts = manager || (showResults && p.showTextAnswers);
    const creator = creatorById.get(p.createdById);
    const audience = audienceOfRow(p);
    const myAnswers = myResponse ? pollAnswersOf.filter((a) => a.responseId === myResponse.id) : [];

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      createdBy: creator ? fullName(creator) : '',
      createdAt: p.createdAt.toISOString(),
      expiresAt: p.expiresAt?.toISOString() ?? null,
      expiryDate: p.expiresAt ? toJalali(p.expiresAt) : '',
      isActive: isOpen(p),
      anonymous: p.anonymous,
      resultsVisibility: p.resultsVisibility,
      showTextAnswers: p.showTextAnswers,
      targetDepartments: p.targetDepartments,
      targetLocations: p.targetLocations,
      targetRoles: p.targetRoles,
      // Who got the poll by name is for the people who run it.
      targetUserIds: manager ? p.targetUserIds : [],
      targetUserCount: p.targetUserIds.length,
      /** In the audience, so may answer. */
      forMe: Boolean(viewer && inAudience(viewer, audience)),
      canManage: manager,
      responseCount: pollResponsesOf.length,
      // How many of the audience answered, for the people who run the poll.
      audienceCount: manager ? people.filter((person) => inAudience(person, audience)).length : undefined,
      remindedAt: manager ? (p.remindedAt?.toISOString() ?? null) : null,
      resultsVisible: showResults,
      hasVoted: Boolean(myResponse),
      myAnswers: myResponse
        ? Object.fromEntries(
            questions
              .filter((q) => q.pollId === p.id)
              .map((q) => {
                const mine = myAnswers.filter((a) => a.questionId === q.id);
                return [q.id, { optionIds: mine.map((a) => a.optionId).filter(Boolean), rating: mine[0]?.rating ?? null, text: mine[0]?.text ?? '' }];
              }),
          )
        : null,
      questions: questions
        .filter((q) => q.pollId === p.id)
        .map((q) => ({
          id: q.id,
          type: q.type,
          // Polls from before multi-question polls ask their title.
          text: q.text || p.title,
          required: q.required,
          options: options.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, text: o.text })),
          results: showResults ? resultsOf(q, pollAnswersOf, showTexts) : undefined,
        })),
    };
  });
}

async function loadVisible(id: string, viewer: SessionUser | null) {
  const [poll] = await db.select().from(polls).where(and(eq(polls.id, id), visibleTo(viewer)));
  if (!poll) throw new HttpError(404, 'نظرسنجی یافت نشد.');
  return poll;
}

async function loadRun(id: string, viewer: SessionUser) {
  const poll = await loadVisible(id, viewer);
  if (!runs(viewer, poll)) throw new HttpError(403, 'فقط طراح نظرسنجی یا مدیر نظرسنجی‌ها می‌تواند این کار را انجام دهد.');
  return poll;
}

pollsRouter.get(
  '/polls',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const rows = await db.select().from(polls).where(visibleTo(viewer)).orderBy(desc(polls.createdAt));
    res.json(await serializePolls(rows, viewer));
  }),
);

const questionSchema = z.object({
  id: z.string().max(100).optional(),
  text: requiredText(500),
  type: z.enum(['single', 'multiple', 'rating', 'text']),
  required: z.boolean().default(true),
  options: z.array(z.object({ id: z.string().max(100).optional(), text: requiredText(200) })).max(MAX_OPTIONS).default([]),
});
type QuestionInput = z.infer<typeof questionSchema>;

const pollSchema = z.object({
  title: requiredText(200),
  description: optionalText(2000),
  expiryDate: jalaliDate.optional().or(z.literal('')),
  anonymous: z.boolean().default(true),
  resultsVisibility: z.enum(['managers', 'after_answer', 'after_close']).default('after_answer'),
  showTextAnswers: z.boolean().default(false),
  targetDepartments: z.array(requiredText(100)).max(50).default([]),
  targetLocations: z.array(requiredText(100)).max(50).default([]),
  targetRoles: z.array(requiredText(100)).max(50).default([]),
  targetUserIds: z.array(requiredText(100)).max(300).default([]),
  questions: z.array(questionSchema).min(1, 'نظرسنجی دست‌کم یک سؤال لازم دارد.').max(MAX_QUESTIONS),
});

function checkQuestions(questions: QuestionInput[]) {
  questions.forEach((q, i) => {
    const label = `سؤال ${(i + 1).toLocaleString('fa-IR')}`;
    if (CHOICE_TYPES.includes(q.type)) {
      if (q.options.length < 2) throw new HttpError(400, `${label} دست‌کم دو گزینه لازم دارد.`);
      if (new Set(q.options.map((o) => o.text)).size !== q.options.length) throw new HttpError(400, `${label} گزینهٔ تکراری دارد.`);
    } else if (q.options.length > 0) {
      throw new HttpError(400, `${label} از نوع ${q.type === 'rating' ? 'امتیاز' : 'تشریحی'} گزینه ندارد.`);
    }
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertQuestion(tx: Tx, pollId: string, q: QuestionInput, position: number) {
  const id = newId('q');
  await tx.insert(pollQuestions).values({ id, pollId, position, type: q.type, text: q.text, required: q.required });
  if (q.options.length > 0) {
    await tx.insert(pollOptions).values(q.options.map((o, i) => ({ id: newId('opt'), pollId, questionId: id, text: o.text, position: i })));
  }
}

function expiryOf(expiryDate: string | undefined, previous: Date | null = null) {
  const expiresAt = expiryDate ? jalaliEndOfDay(expiryDate) : null;
  // A new deadline must be in the future; keeping the current one is always fine.
  if (expiresAt && expiresAt <= new Date() && expiresAt.getTime() !== previous?.getTime()) {
    throw new HttpError(400, 'مهلت نظرسنجی باید در آینده باشد.');
  }
  return expiresAt;
}

pollsRouter.post(
  '/polls',
  requirePermission('polls.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(pollSchema, req.body);
    checkQuestions(body.questions);
    const audience = await checkAudience(body);
    const expiresAt = expiryOf(body.expiryDate);

    const poll = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(polls)
        .values({
          id: newId('poll'),
          title: body.title,
          description: body.description,
          createdById: viewer.id,
          expiresAt,
          anonymous: body.anonymous,
          resultsVisibility: body.resultsVisibility,
          showTextAnswers: body.showTextAnswers,
          targetDepartments: audience.departments,
          targetLocations: audience.locations,
          targetRoles: audience.roles,
          targetUserIds: audience.userIds,
        })
        .returning();
      for (const [i, q] of body.questions.entries()) await insertQuestion(tx, created.id, q, i);
      return created;
    });

    await createNotifications(await audienceIdsFor(audience, viewer.id), {
      title: 'نظرسنجی جدید 🗳️',
      message: body.title,
      type: 'poll',
      linkTab: 'polls',
      linkId: poll.id,
    });
    broadcastChange('polls');
    const [serialized] = await serializePolls([poll], viewer);
    res.status(201).json(serialized);
  }),
);

/**
 * Before anyone answers, everything can change. After that, answers must keep their meaning:
 * questions and options can be reworded and added, but not removed or turned into another type,
 * and a poll that promised anonymity stays anonymous.
 */
pollsRouter.put(
  '/polls/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await loadRun(req.params.id, viewer);
    const body = parse(pollSchema, req.body);
    checkQuestions(body.questions);
    const audience = await checkAudience(body);
    const expiresAt = expiryOf(body.expiryDate, existing.expiresAt);

    const poll = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(polls).where(eq(polls.id, existing.id)).for('update');
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(pollResponses).where(eq(pollResponses.pollId, locked.id));
      if (count === 0) {
        await tx.delete(pollQuestions).where(eq(pollQuestions.pollId, locked.id));
        for (const [i, q] of body.questions.entries()) await insertQuestion(tx, locked.id, q, i);
      } else {
        if (locked.anonymous && !body.anonymous) throw new HttpError(400, 'پاسخ‌ها با وعدهٔ ناشناس بودن ثبت شده‌اند؛ نظرسنجی را نمی‌توان با نام کرد.');
        const current = await tx.select().from(pollQuestions).where(eq(pollQuestions.pollId, locked.id));
        const currentOptions = await tx.select().from(pollOptions).where(eq(pollOptions.pollId, locked.id));
        const sent = new Map(body.questions.filter((q) => q.id).map((q) => [q.id!, q]));
        if (current.some((q) => !sent.has(q.id)) || sent.size !== current.length) {
          throw new HttpError(400, 'سؤال‌هایی که پاسخ گرفته‌اند حذف نمی‌شوند؛ فقط متنشان اصلاح می‌شود و سؤال تازه اضافه می‌شود.');
        }
        for (const [position, q] of body.questions.entries()) {
          const old = q.id ? current.find((c) => c.id === q.id) : undefined;
          if (!old) {
            await insertQuestion(tx, locked.id, q, position);
            continue;
          }
          if (old.type !== q.type) throw new HttpError(400, 'نوع سؤالی که پاسخ گرفته است تغییر نمی‌کند.');
          await tx.update(pollQuestions).set({ text: q.text, required: q.required, position }).where(eq(pollQuestions.id, old.id));
          const oldOptions = currentOptions.filter((o) => o.questionId === old.id);
          const sentOptions = new Map(q.options.filter((o) => o.id).map((o) => [o.id!, o.text]));
          if (oldOptions.some((o) => !sentOptions.has(o.id)) || sentOptions.size !== oldOptions.length) {
            throw new HttpError(400, 'گزینه‌های فعلی حذف نمی‌شوند؛ فقط متنشان اصلاح می‌شود.');
          }
          for (const option of oldOptions) {
            const text = sentOptions.get(option.id)!;
            if (text !== option.text) await tx.update(pollOptions).set({ text }).where(eq(pollOptions.id, option.id));
          }
          const added = q.options.filter((o) => !o.id);
          if (added.length > 0) {
            await tx
              .insert(pollOptions)
              .values(added.map((o, i) => ({ id: newId('opt'), pollId: locked.id, questionId: old.id, text: o.text, position: oldOptions.length + i })));
          }
        }
      }
      const [updated] = await tx
        .update(polls)
        .set({
          title: body.title,
          description: body.description,
          expiresAt,
          anonymous: body.anonymous,
          resultsVisibility: body.resultsVisibility,
          showTextAnswers: body.showTextAnswers,
          targetDepartments: audience.departments,
          targetLocations: audience.locations,
          targetRoles: audience.roles,
          targetUserIds: audience.userIds,
          // A new deadline gets its own reminder.
          ...(expiresAt?.getTime() !== locked.expiresAt?.getTime() ? { autoRemindedAt: null } : {}),
        })
        .where(eq(polls.id, locked.id))
        .returning();
      return updated;
    });
    broadcastChange('polls');
    const [serialized] = await serializePolls([poll], viewer);
    res.json(serialized);
  }),
);

const voteSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().max(100),
        optionIds: z.array(z.string().max(100)).max(MAX_OPTIONS).default([]),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        text: z.string().trim().max(2000).optional().default(''),
      }),
    )
    .max(MAX_QUESTIONS),
});

pollsRouter.post(
  '/polls/:id/vote',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { answers } = parse(voteSchema, req.body);
    const poll = await loadVisible(req.params.id, viewer);
    // Only the audience answers, so a poll for one department reflects that department.
    if (!inAudience(viewer, audienceOfRow(poll))) throw new HttpError(403, 'این نظرسنجی برای شما نیست.');
    if (!isOpen(poll)) throw new HttpError(400, 'مهلت این نظرسنجی به پایان رسیده است.');

    const questions = await db.select().from(pollQuestions).where(eq(pollQuestions.pollId, poll.id)).orderBy(pollQuestions.position);
    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, poll.id));
    const rows: Omit<typeof pollAnswers.$inferInsert, 'responseId'>[] = [];
    for (const [i, q] of questions.entries()) {
      const answer = answers.find((a) => a.questionId === q.id);
      const label = questions.length > 1 ? `سؤال ${(i + 1).toLocaleString('fa-IR')}` : 'این سؤال';
      if (CHOICE_TYPES.includes(q.type)) {
        const chosen = [...new Set(answer?.optionIds ?? [])];
        if (chosen.some((id) => !options.some((o: OptionRow) => o.id === id && o.questionId === q.id))) throw new HttpError(400, 'گزینهٔ انتخاب‌شده معتبر نیست.');
        if (q.type === 'single' && chosen.length > 1) throw new HttpError(400, `در ${label} فقط یک گزینه را انتخاب کنید.`);
        if (chosen.length === 0 && q.required) throw new HttpError(400, `به ${label} پاسخ دهید.`);
        for (const optionId of chosen) rows.push({ questionId: q.id, optionId });
      } else if (q.type === 'rating') {
        if (answer?.rating) rows.push({ questionId: q.id, rating: answer.rating });
        else if (q.required) throw new HttpError(400, `به ${label} امتیاز دهید.`);
      } else if (answer?.text) {
        rows.push({ questionId: q.id, text: answer.text });
      } else if (q.required) {
        throw new HttpError(400, `پاسخ ${label} را بنویسید.`);
      }
    }
    if (rows.length === 0) throw new HttpError(400, 'دست‌کم به یک سؤال پاسخ دهید.');

    await db.transaction(async (tx) => {
      // The unique index on (poll_id, user_id) keeps one answer sheet per person, even under concurrent requests.
      const [response] = await tx
        .insert(pollResponses)
        .values({ pollId: poll.id, userId: viewer.id })
        .onConflictDoNothing()
        .returning({ id: pollResponses.id });
      if (!response) throw new HttpError(409, 'شما قبلاً در این نظرسنجی شرکت کرده‌اید.');
      await tx.insert(pollAnswers).values(rows.map((r) => ({ ...r, responseId: response.id })));
    });

    broadcastChange('polls');
    const [serialized] = await serializePolls([poll], viewer);
    res.json(serialized);
  }),
);

/**
 * Every answer sheet, for the people who run the poll (the Excel export). Anonymous polls give no
 * names or times and are sorted by their answers, so the order does not follow who answered when.
 */
pollsRouter.get(
  '/polls/:id/responses',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const poll = await loadRun(req.params.id, viewer);
    const questions = await db.select().from(pollQuestions).where(eq(pollQuestions.pollId, poll.id)).orderBy(pollQuestions.position);
    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, poll.id)).orderBy(pollOptions.position);
    const responses = await db.select().from(pollResponses).where(eq(pollResponses.pollId, poll.id)).orderBy(pollResponses.submittedAt);
    const answers = responses.length > 0 ? await db.select().from(pollAnswers).where(inArray(pollAnswers.responseId, responses.map((r) => r.id))) : [];
    const people = poll.anonymous ? [] : await db.select().from(employees).where(inArray(employees.id, responses.map((r) => r.userId)));
    const optionText = new Map(options.map((o) => [o.id, o.text]));

    const sheets = responses.map((r) => {
      const person = people.find((p) => p.id === r.userId);
      const mine = answers.filter((a) => a.responseId === r.id);
      return {
        name: person ? fullName(person) : '',
        department: person?.department ?? '',
        submittedAt: poll.anonymous ? null : r.submittedAt.toISOString(),
        answers: questions.map((q) => {
          const forQuestion = mine.filter((a) => a.questionId === q.id);
          if (CHOICE_TYPES.includes(q.type)) return forQuestion.map((a) => optionText.get(a.optionId ?? '') ?? '').join('، ');
          if (q.type === 'rating') return forQuestion[0]?.rating ? String(forQuestion[0].rating) : '';
          return forQuestion[0]?.text ?? '';
        }),
      };
    });
    if (poll.anonymous) sheets.sort((a, b) => a.answers.join('\u0000').localeCompare(b.answers.join('\u0000'), 'fa'));
    res.json({ anonymous: poll.anonymous, questions: questions.map((q) => q.text || poll.title), responses: sheets });
  }),
);

/** Colleagues in the audience who have not answered yet. */
async function notAnswered(poll: PollRow) {
  const recipients = await audienceIdsFor(audienceOfRow(poll), poll.createdById);
  const answered = await db.select({ userId: pollResponses.userId }).from(pollResponses).where(eq(pollResponses.pollId, poll.id));
  const done = new Set(answered.map((a) => a.userId));
  return recipients.filter((id) => !done.has(id));
}

const REMIND_GAP_MS = 10 * 60 * 1000;

pollsRouter.post(
  '/polls/:id/remind',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const poll = await loadRun(req.params.id, viewer);
    const now = new Date();
    if (!isOpen(poll, now)) throw new HttpError(400, 'این نظرسنجی بسته شده است.');
    if (poll.remindedAt && now.getTime() - poll.remindedAt.getTime() < REMIND_GAP_MS) {
      throw new HttpError(429, 'چند دقیقه پیش یادآوری فرستاده شد؛ کمی بعد دوباره امتحان کنید.');
    }
    const pending = await notAnswered(poll);
    await db.update(polls).set({ remindedAt: now }).where(eq(polls.id, poll.id));
    await createNotifications(pending, {
      title: 'یادآوری: در نظرسنجی شرکت کنید 🗳️',
      message: poll.expiresAt ? `${poll.title} (مهلت: ${toJalali(poll.expiresAt)})` : poll.title,
      type: 'poll',
      linkTab: 'polls',
      linkId: poll.id,
    });
    broadcastChange('polls');
    res.json({ sent: pending.length });
  }),
);

pollsRouter.patch(
  '/polls/:id/status',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await loadRun(req.params.id, viewer);
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    const [poll] = await db.update(polls).set({ isActive }).where(eq(polls.id, existing.id)).returning();
    broadcastChange('polls');
    const [serialized] = await serializePolls([poll], viewer);
    res.json(serialized);
  }),
);

pollsRouter.delete(
  '/polls/:id',
  requirePermission('polls.manage'),
  route(async (req, res) => {
    const deleted = await db.delete(polls).where(eq(polls.id, req.params.id)).returning({ id: polls.id });
    if (deleted.length === 0) throw new HttpError(404, 'نظرسنجی یافت نشد.');
    broadcastChange('polls');
    res.json({ success: true });
  }),
);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Run by the scheduler: on a poll's last day, one reminder to those in its audience who have not answered. */
export async function processPollDeadlines(now = new Date()) {
  const dueSoon = await db
    .select()
    .from(polls)
    .where(and(eq(polls.isActive, true), isNull(polls.autoRemindedAt), gt(polls.expiresAt, now), lte(polls.expiresAt, new Date(now.getTime() + DAY_MS))));
  for (const poll of dueSoon) {
    const claimed = await db
      .update(polls)
      .set({ autoRemindedAt: now })
      .where(and(eq(polls.id, poll.id), isNull(polls.autoRemindedAt)))
      .returning({ id: polls.id });
    if (claimed.length === 0) continue;
    // Published only hours ago: the announcement itself is the reminder.
    if (now.getTime() - poll.createdAt.getTime() < DAY_MS / 2) continue;
    await createNotifications(await notAnswered(poll), {
      title: 'مهلت نظرسنجی رو به پایان است ⏰',
      message: `${poll.title} (مهلت: ${toJalali(poll.expiresAt!)})`,
      type: 'poll',
      linkTab: 'polls',
      linkId: poll.id,
    });
  }
}
