import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { jalaliEndOfDay, toJalali } from '../../shared/jalali.js';
import { can, type SessionUser, requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { employees, pollOptions, polls, pollVotes } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { jalaliDate, optionalText, requiredText } from '../validation.js';

export const pollsRouter = Router();

type PollRow = typeof polls.$inferSelect;

const isOpen = (p: PollRow) => p.isActive && (!p.expiresAt || p.expiresAt > new Date());

async function serializePolls(rows: PollRow[], viewer: SessionUser | null) {
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const [options, counts, mine, freeTexts, creators] = await Promise.all([
    db.select().from(pollOptions).where(inArray(pollOptions.pollId, ids)).orderBy(pollOptions.position),
    db
      .select({ optionId: pollVotes.optionId, pollId: pollVotes.pollId, count: sql<number>`count(*)::int` })
      .from(pollVotes)
      .where(inArray(pollVotes.pollId, ids))
      .groupBy(pollVotes.pollId, pollVotes.optionId),
    viewer ? db.select().from(pollVotes).where(and(inArray(pollVotes.pollId, ids), eq(pollVotes.userId, viewer.id))) : [],
    // Free-text answers are returned without any link to the person who wrote them, and only to staff.
    viewer
      ? db
          .select({ id: pollVotes.id, pollId: pollVotes.pollId, freeText: pollVotes.freeText, submittedAt: pollVotes.submittedAt })
          .from(pollVotes)
          .where(and(inArray(pollVotes.pollId, ids), sql`${pollVotes.freeText} is not null`))
          .orderBy(sql`random()`)
      : [],
    db.select().from(employees).where(inArray(employees.id, rows.map((p) => p.createdById))),
  ]);
  const creatorById = new Map(creators.map((c) => [c.id, c]));
  const myVote = new Map(mine.map((v) => [v.pollId, v]));

  return rows.map((p) => {
    const pollCounts = counts.filter((c) => c.pollId === p.id);
    const creator = creatorById.get(p.createdById);
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      department: p.department,
      createdBy: creator ? fullName(creator) : '',
      createdAt: p.createdAt.toISOString(),
      expiresAt: p.expiresAt?.toISOString() ?? null,
      expiryDate: p.expiresAt ? toJalali(p.expiresAt) : '',
      type: p.type,
      isActive: isOpen(p),
      options: options
        .filter((o) => o.pollId === p.id)
        .map((o) => ({ id: o.id, text: o.text, votesCount: pollCounts.find((c) => c.optionId === o.id)?.count ?? 0 })),
      freeTextResponses: freeTexts
        .filter((f) => f.pollId === p.id)
        .map((f) => ({ id: String(f.id), responseText: f.freeText ?? '', submittedAt: f.submittedAt.toISOString() })),
      totalVotes: pollCounts.reduce((sum, c) => sum + c.count, 0),
      hasVoted: myVote.has(p.id),
      myOptionId: myVote.get(p.id)?.optionId ?? null,
    };
  });
}

pollsRouter.get(
  '/polls',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const audience = viewer ? or(eq(polls.department, 'all'), eq(polls.department, viewer.department)) : eq(polls.department, 'all');
    const rows = await db
      .select()
      .from(polls)
      .where(can(viewer, 'polls.manage') ? undefined : audience)
      .orderBy(desc(polls.createdAt));
    res.json(await serializePolls(rows, viewer));
  }),
);

const createSchema = z
  .object({
    title: requiredText(200),
    description: optionalText(2000),
    department: requiredText(100).default('all'),
    type: z.enum(['multiple_choice', 'free_text']),
    expiryDate: jalaliDate.optional().or(z.literal('')),
    options: z.array(requiredText(200)).max(10).default([]),
  })
  .refine((p) => p.type === 'free_text' || p.options.length >= 2, {
    message: 'نظرسنجی گزینه‌ای حداقل دو گزینه لازم دارد',
    path: ['options'],
  });

pollsRouter.post(
  '/polls',
  requirePermission('polls.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(createSchema, req.body);
    const expiresAt = body.expiryDate ? jalaliEndOfDay(body.expiryDate) : null;
    if (expiresAt && expiresAt <= new Date()) throw new HttpError(400, 'مهلت نظرسنجی باید در آینده باشد.');

    const poll = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(polls)
        .values({
          id: newId('poll'),
          title: body.title,
          description: body.description,
          department: body.department,
          createdById: viewer.id,
          type: body.type,
          expiresAt,
        })
        .returning();
      if (body.type === 'multiple_choice') {
        await tx
          .insert(pollOptions)
          .values(body.options.map((text, position) => ({ id: newId('opt'), pollId: created.id, text, position })));
      }
      return created;
    });

    await createNotifications(await audienceIds(body.department === 'all' ? [] : [body.department], viewer.id), {
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

const voteSchema = z.object({
  optionId: z.string().max(100).optional(),
  freeText: z.string().trim().min(1).max(2000).optional(),
});

pollsRouter.post(
  '/polls/:id/vote',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(voteSchema, req.body);
    const [poll] = await db.select().from(polls).where(eq(polls.id, req.params.id));
    if (!poll) throw new HttpError(404, 'نظرسنجی یافت نشد.');
    if (poll.department !== 'all' && poll.department !== viewer.department && !can(viewer, 'polls.manage')) {
      throw new HttpError(403, 'این نظرسنجی برای واحد شما نیست.');
    }
    if (!isOpen(poll)) throw new HttpError(400, 'مهلت این نظرسنجی به پایان رسیده است.');

    if (poll.type === 'multiple_choice') {
      if (!body.optionId) throw new HttpError(400, 'یک گزینه را انتخاب کنید.');
      const [option] = await db
        .select()
        .from(pollOptions)
        .where(and(eq(pollOptions.id, body.optionId), eq(pollOptions.pollId, poll.id)));
      if (!option) throw new HttpError(400, 'گزینهٔ انتخاب‌شده معتبر نیست.');
    } else if (!body.freeText) {
      throw new HttpError(400, 'متن پاسخ را بنویسید.');
    }

    // The unique index on (poll_id, user_id) guarantees one vote per person, even under concurrent requests.
    const inserted = await db
      .insert(pollVotes)
      .values({
        pollId: poll.id,
        userId: viewer.id,
        optionId: poll.type === 'multiple_choice' ? body.optionId : null,
        freeText: poll.type === 'free_text' ? body.freeText : null,
      })
      .onConflictDoNothing()
      .returning({ id: pollVotes.id });
    if (inserted.length === 0) throw new HttpError(409, 'شما قبلاً در این نظرسنجی شرکت کرده‌اید.');

    broadcastChange('polls');
    const [serialized] = await serializePolls([poll], viewer);
    res.json(serialized);
  }),
);

pollsRouter.patch(
  '/polls/:id/status',
  requirePermission('polls.manage'),
  route(async (req, res) => {
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    const [poll] = await db.update(polls).set({ isActive }).where(eq(polls.id, req.params.id)).returning();
    if (!poll) throw new HttpError(404, 'نظرسنجی یافت نشد.');
    broadcastChange('polls');
    const [serialized] = await serializePolls([poll], currentUser(req));
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
