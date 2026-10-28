import { and, desc, eq, gt, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { type Audience, inAudience } from '../../shared/audience.js';
import { jalaliEndOfDay, jalaliToDate, toJalali, toPersianDigits } from '../../shared/jalali.js';
import { can, type SessionUser, requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { employees, news, newsLikes, newsQuestions, newsReads, newsRevisions, type NewsSnapshot, newsTemplates } from '../db/schema.js';
import { broadcastChange, broadcastEvent, signalUser } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIdsFor, createNotifications } from '../notify.js';
import { richTextToPlain, sanitizeRichText } from '../richText.js';
import { idsWithPermission } from '../roles.js';
import { fullName } from '../serializers.js';
import { assetUrl, attachment, jalaliDate, optionalText, requiredText, timeOfDay } from '../validation.js';
import { audienceIncludes, audienceOfRow, checkAudience } from '../audience.js';
import { audit, changedLabels } from '../audit.js';
import { NEWS_FIELD_LABELS } from '../../shared/audit.js';

export const newsRouter = Router();

type NewsRow = typeof news.$inferSelect;

/**
 * What a viewer without news.manage may see: published, not expired, and meant for them (see
 * shared/audience.ts). Visitors who are not signed in only see items addressed to everyone.
 */
function visibleTo(viewer: SessionUser | null): SQL | undefined {
  if (can(viewer, 'news.manage')) return undefined;
  const now = new Date();
  const forMe = audienceIncludes(
    { departments: news.targetDepartments, locations: news.targetLocations, roles: news.targetRoles, userIds: news.targetUserIds },
    viewer,
  );
  return and(eq(news.isDraft, false), lte(news.publishAt, now), or(isNull(news.expiresAt), gt(news.expiresAt, now)), forMe);
}

const audienceOfItem = (item: NewsRow): Audience => audienceOfRow(item);

/**
 * Who an item is meant for: active colleagues with a portal account in its audience.
 * People listed only in the phone book can't read it, and the author is not counted.
 */
export function audienceOf<T extends typeof employees.$inferSelect>(item: NewsRow, people: T[]) {
  const audience = audienceOfItem(item);
  return people.filter((p) => p.isActive && p.hasAccount && p.id !== item.authorId && inAudience(p, audience));
}

function statusOf(item: NewsRow) {
  if (item.isDraft) return 'draft';
  const now = new Date();
  if (item.publishAt > now) return 'scheduled';
  if (item.expiresAt && item.expiresAt <= now) return 'expired';
  return 'published';
}

async function serializeMany(items: NewsRow[], viewer: SessionUser | null) {
  if (items.length === 0) return [];
  const ids = items.map((n) => n.id);

  const [authors, likeCounts, myLikes, myReads, lastEdits, openQuestions] = await Promise.all([
    db.select().from(employees),
    db
      .select({ newsId: newsLikes.newsId, count: sql<number>`count(*)::int` })
      .from(newsLikes)
      .where(inArray(newsLikes.newsId, ids))
      .groupBy(newsLikes.newsId),
    viewer
      ? db.select({ newsId: newsLikes.newsId }).from(newsLikes).where(and(eq(newsLikes.userId, viewer.id), inArray(newsLikes.newsId, ids)))
      : [],
    viewer ? db.select().from(newsReads).where(and(eq(newsReads.userId, viewer.id), inArray(newsReads.newsId, ids))) : [],
    db
      .select({ newsId: newsRevisions.newsId, at: sql<Date>`max(${newsRevisions.createdAt})` })
      .from(newsRevisions)
      .where(and(inArray(newsRevisions.newsId, ids), eq(newsRevisions.action, 'edit')))
      .groupBy(newsRevisions.newsId),
    viewer
      ? db
          .select({ newsId: newsQuestions.newsId, count: sql<number>`count(*)::int` })
          .from(newsQuestions)
          .where(and(inArray(newsQuestions.newsId, ids), isNull(newsQuestions.answer)))
          .groupBy(newsQuestions.newsId)
      : [],
  ]);

  const authorById = new Map(authors.map((a) => [a.id, a]));
  const likes = new Map(likeCounts.map((l) => [l.newsId, l.count]));
  const liked = new Set(myLikes.map((l) => l.newsId));
  const reads = new Map(myReads.map((r) => [r.newsId, r]));
  const editedAt = new Map(lastEdits.map((e) => [e.newsId, new Date(e.at)]));
  const unanswered = new Map(openQuestions.map((q) => [q.newsId, q.count]));

  const isManager = can(viewer, 'news.manage');
  let readStats = new Map<string, { read: number; acknowledged: number; audience: number }>();
  if (isManager) {
    const allReads = await db
      .select({ newsId: newsReads.newsId, userId: newsReads.userId, acknowledgedAt: newsReads.acknowledgedAt })
      .from(newsReads)
      .where(inArray(newsReads.newsId, ids));
    readStats = new Map(
      items.map((n) => {
        // Only reads by the item's audience count, so the numbers match the receipts list.
        const audience = new Set(audienceOf(n, authors).map((a) => a.id));
        const mine = allReads.filter((r) => r.newsId === n.id && audience.has(r.userId));
        return [n.id, { read: mine.length, acknowledged: mine.filter((r) => r.acknowledgedAt).length, audience: audience.size }];
      }),
    );
  }

  return items.map((n) => {
    const author = authorById.get(n.authorId);
    const read = reads.get(n.id);
    return {
      id: n.id,
      title: n.title,
      summary: n.summary,
      content: n.content,
      category: n.category,
      authorId: n.authorId,
      author: author ? fullName(author) : '',
      authorRole: author?.position ?? '',
      image: n.image,
      isPinned: n.isPinned,
      isUrgent: n.isUrgent,
      requiresAck: n.requiresAck,
      tags: n.tags,
      targetDepartments: n.targetDepartments,
      targetLocations: n.targetLocations,
      targetRoles: n.targetRoles,
      // Who else got a personal message is for the people who publish news.
      targetUserIds: isManager ? n.targetUserIds : [],
      targetUserCount: n.targetUserIds.length,
      contentFormat: n.contentFormat,
      ackDeadline: n.ackDeadline?.toISOString() ?? null,
      ackRemindedAt: isManager ? (n.ackRemindedAt?.toISOString() ?? null) : null,
      attachments: n.attachments,
      publishAt: n.publishAt.toISOString(),
      expiresAt: n.expiresAt?.toISOString() ?? null,
      date: n.publishAt.toISOString(),
      likesCount: likes.get(n.id) ?? 0,
      likedByMe: liked.has(n.id),
      // Guests have no read history; reporting items as read keeps "unread" markers off their screen.
      isRead: viewer ? Boolean(read) : true,
      acknowledgedAt: read?.acknowledgedAt?.toISOString() ?? null,
      status: statusOf(n),
      readStats: readStats.get(n.id),
      // Shown under the text, so readers know an item changed after it was published.
      editedAt: editedAt.get(n.id)?.toISOString() ?? null,
      updatedAt: n.updatedAt.toISOString(),
      // Questions waiting for an answer, for those who answer them.
      openQuestions: isManager || n.authorId === viewer?.id ? (unanswered.get(n.id) ?? 0) : 0,
    };
  });
}

async function loadVisible(id: string, viewer: SessionUser | null) {
  const [item] = await db.select().from(news).where(and(eq(news.id, id), visibleTo(viewer)));
  if (!item) throw new HttpError(404, 'خبر یافت نشد.');
  return item;
}

/** A visible item that has been published (likes, reads and questions are not for drafts). */
async function loadPublished(id: string, viewer: SessionUser | null) {
  const item = await loadVisible(id, viewer);
  if (item.isDraft) throw new HttpError(404, 'خبر یافت نشد.');
  return item;
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: z.string().max(100).optional(),
  q: z.string().trim().max(100).optional(),
});

newsRouter.get(
  '/news',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const query = parse(listQuery, req.query);
    const filters = [visibleTo(viewer), eq(news.isDraft, false)];
    if (query.category && query.category !== 'all') filters.push(eq(news.category, query.category));
    if (query.q) {
      const pattern = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      filters.push(or(ilike(news.title, pattern), ilike(news.summary, pattern), ilike(news.content, pattern)));
    }
    const rows = await db
      .select()
      .from(news)
      .where(and(...filters))
      .orderBy(desc(news.isPinned), desc(news.publishAt), desc(news.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    const hasMore = rows.length > query.limit;
    res.json({ items: await serializeMany(rows.slice(0, query.limit), viewer), hasMore });
  }),
);

/** Drafts of every publisher, most recently saved first. */
newsRouter.get(
  '/news-drafts',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db.select().from(news).where(eq(news.isDraft, true)).orderBy(desc(news.updatedAt));
    res.json(await serializeMany(rows, viewer));
  }),
);

newsRouter.get(
  '/news/:id',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const [item] = await serializeMany([await loadVisible(req.params.id, viewer)], viewer);
    res.json(item);
  }),
);

const newsSchema = z.object({
  title: requiredText(200),
  summary: requiredText(500),
  content: requiredText(60000),
  // 'html' from the editor (sanitized here), 'text' for plain text.
  contentFormat: z.enum(['text', 'html']).default('text'),
  category: requiredText(100),
  image: assetUrl,
  isPinned: z.boolean().default(false),
  isUrgent: z.boolean().default(false),
  requiresAck: z.boolean().default(false),
  tags: z.array(requiredText(50)).max(20).default([]),
  targetDepartments: z.array(requiredText(100)).max(50).default([]),
  targetLocations: z.array(requiredText(100)).max(50).default([]),
  targetRoles: z.array(requiredText(100)).max(50).default([]),
  targetUserIds: z.array(requiredText(100)).max(300).default([]),
  // Circulars: acknowledge by the end of this Jalali day (optional).
  ackDate: jalaliDate.optional().or(z.literal('')),
  attachments: z.array(attachment).max(10).default([]),
  // Optional scheduling, in Jalali; empty means "now" / "never expires".
  publishDate: jalaliDate.optional().or(z.literal('')),
  publishTime: timeOfDay.optional().or(z.literal('')),
  expiresDate: jalaliDate.optional().or(z.literal('')),
  // Saved without announcing; only the title is required until it is published.
  draft: z.boolean().default(false),
});

const draftSchema = newsSchema.extend({
  summary: optionalText(500),
  content: z.string().max(60000).default(''),
  category: optionalText(100),
});

type NewsBody = z.infer<typeof newsSchema>;

const parseNews = (body: unknown): NewsBody =>
  (body as { draft?: unknown } | null)?.draft === true ? parse(draftSchema, body) : parse(newsSchema, body);

/** `keptPublishAt`: the date of a published item being fixed, which an edit without a publish date keeps. */
function scheduleFrom(body: NewsBody, keptPublishAt?: Date) {
  const publishAt = body.publishDate ? jalaliToDate(body.publishDate, body.publishTime || '08:00') : (keptPublishAt ?? new Date());
  const expiresAt = body.expiresDate ? jalaliEndOfDay(body.expiresDate) : null;
  if (!publishAt) throw new HttpError(400, 'تاریخ انتشار نامعتبر است.');
  if (expiresAt && expiresAt <= publishAt) throw new HttpError(400, 'تاریخ انقضا باید بعد از تاریخ انتشار باشد.');
  const ackDeadline = body.requiresAck && body.ackDate ? jalaliEndOfDay(body.ackDate) : null;
  if (ackDeadline && ackDeadline <= publishAt) throw new HttpError(400, 'مهلت تأیید باید بعد از زمان انتشار باشد.');
  return { publishAt, expiresAt, ackDeadline };
}

/** Editor text is cleaned of anything but formatting; plain text is kept as typed. */
function checkedContent(body: NewsBody) {
  if (body.contentFormat === 'text') return body.content;
  const html = sanitizeRichText(body.content);
  if (!body.draft && !richTextToPlain(html) && !html.includes('<img')) throw new HttpError(400, 'متن کامل را بنویسید.');
  return html;
}

/** The columns a create or edit writes. */
async function newsValues(body: NewsBody, keptPublishAt?: Date) {
  const audience = await checkAudience(body);
  return {
    title: body.title,
    summary: body.summary,
    content: checkedContent(body),
    contentFormat: body.contentFormat,
    category: body.category,
    image: body.image,
    isPinned: body.isPinned,
    isUrgent: body.isUrgent,
    requiresAck: body.requiresAck,
    tags: body.tags,
    targetDepartments: audience.departments,
    targetLocations: audience.locations,
    targetRoles: audience.roles,
    targetUserIds: audience.userIds,
    attachments: body.attachments,
    isDraft: body.draft,
    ...scheduleFrom(body, keptPublishAt),
  };
}

/** The editable state of an item, kept in its edit history. */
const snapshotOf = (n: NewsRow): NewsSnapshot => ({
  title: n.title,
  summary: n.summary,
  content: n.content,
  contentFormat: n.contentFormat,
  category: n.category,
  image: n.image,
  isPinned: n.isPinned,
  isUrgent: n.isUrgent,
  requiresAck: n.requiresAck,
  tags: n.tags,
  targetDepartments: n.targetDepartments,
  targetLocations: n.targetLocations,
  targetRoles: n.targetRoles,
  targetUserIds: n.targetUserIds,
  attachments: n.attachments,
  publishAt: n.publishAt.toISOString(),
  expiresAt: n.expiresAt?.toISOString() ?? null,
  ackDeadline: n.ackDeadline?.toISOString() ?? null,
});

function changedKeys(before: NewsSnapshot, after: NewsSnapshot) {
  return (Object.keys(before) as (keyof NewsSnapshot)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

/** "۱۴۰۵/۰۸/۱۰" for notification texts. */
const deadlineText = (deadline: Date) => toPersianDigits(toJalali(deadline));

/** How an item went out, for the change history: kept as a draft, or scheduled for later. */
function publishingNote(item: NewsRow) {
  if (item.isDraft) return 'پیش‌نویس';
  if (item.publishAt > new Date()) return `زمان‌بندی برای ${toPersianDigits(toJalali(item.publishAt, 'jYYYY/jMM/jDD، HH:mm'))}`;
  return '';
}

/** Sends in-portal notifications (and e-mail for urgent items) once an item is live. */
export async function announceNews(item: NewsRow) {
  const claimed = await db
    .update(news)
    .set({ notifiedAt: new Date() })
    .where(and(eq(news.id, item.id), isNull(news.notifiedAt)))
    .returning({ id: news.id });
  if (claimed.length === 0) return;

  const recipients = await audienceIdsFor(audienceOfItem(item), item.authorId);
  await createNotifications(
    recipients,
    {
      title: item.requiresAck ? 'بخشنامهٔ جدید: لطفاً مطالعه و تأیید کنید 📌' : item.isUrgent ? 'اطلاعیهٔ فوری 🔴' : 'خبر/اطلاعیهٔ جدید 📰',
      message: item.ackDeadline ? `${item.title} (مهلت تأیید: ${deadlineText(item.ackDeadline)})` : item.title,
      type: 'announcement',
      linkTab: 'news',
      linkId: item.id,
    },
    { email: item.isUrgent || item.requiresAck },
  );
}

newsRouter.post(
  '/news',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const values = await newsValues(parseNews(req.body));
    const [item] = await db
      .insert(news)
      .values({ id: newId('news'), authorId: viewer.id, ...values })
      .returning();
    if (!item.isDraft && item.publishAt <= new Date()) await announceNews(item);
    await audit(viewer, { action: 'create', entity: 'news', id: item.id, title: item.title, detail: publishingNote(item) });
    broadcastChange('news');
    const [serialized] = await serializeMany([item], viewer);
    res.status(201).json(serialized);
  }),
);

newsRouter.patch(
  '/news/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [existing] = await db.select().from(news).where(eq(news.id, req.params.id));
    if (!existing) throw new HttpError(404, 'خبر یافت نشد.');
    const body = parseNews(req.body);
    if (body.draft && !existing.isDraft) throw new HttpError(400, 'خبر منتشرشده را نمی‌شود به پیش‌نویس برگرداند.');
    // Fixing a published item keeps its date instead of moving it to the top as new; its deadline and
    // expiry are checked against that date, so a circular can still be fixed after its deadline.
    const isLive = !existing.isDraft && existing.publishAt <= new Date();
    const values = await newsValues(body, isLive ? existing.publishAt : undefined);
    // A new deadline gets its own reminder and report.
    const deadlineMoved = values.ackDeadline?.getTime() !== existing.ackDeadline?.getTime();
    const { item, changed } = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(news)
        .set({ ...values, updatedAt: new Date(), ...(deadlineMoved ? { ackAutoRemindedAt: null, ackReportedAt: null } : {}) })
        .where(eq(news.id, existing.id))
        .returning();
      // Saving a draft again is not history; publishing it and editing a published item are.
      if (existing.isDraft && !updated.isDraft) {
        await tx.insert(newsRevisions).values({ newsId: existing.id, editorId: viewer.id, action: 'publish', snapshot: snapshotOf(existing) });
      } else if (!existing.isDraft) {
        const changed = changedKeys(snapshotOf(existing), snapshotOf(updated));
        if (changed.length > 0) {
          await tx.insert(newsRevisions).values({ newsId: existing.id, editorId: viewer.id, action: 'edit', changed, snapshot: snapshotOf(existing) });
        }
        return { item: updated, changed };
      }
      return { item: updated, changed: [] };
    });
    if (!item.isDraft && item.publishAt <= new Date()) await announceNews(item);
    if (existing.isDraft && !item.isDraft) {
      await audit(viewer, { action: 'publish', entity: 'news', id: item.id, title: item.title, detail: publishingNote(item) });
    } else if (changed.length > 0) {
      await audit(viewer, { action: 'update', entity: 'news', id: item.id, title: item.title, detail: changedLabels(changed, NEWS_FIELD_LABELS) });
    }
    broadcastChange('news');
    const [serialized] = await serializeMany([item], viewer);
    res.json(serialized);
  }),
);

newsRouter.delete(
  '/news/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const [deleted] = await db.delete(news).where(eq(news.id, req.params.id)).returning({ id: news.id, title: news.title, isDraft: news.isDraft });
    if (!deleted) throw new HttpError(404, 'خبر یافت نشد.');
    await audit(currentUser(req), { action: 'delete', entity: 'news', id: deleted.id, title: deleted.title, detail: deleted.isDraft ? 'پیش‌نویس' : '' });
    broadcastChange('news');
    res.json({ success: true });
  }),
);

newsRouter.post(
  '/news/:id/like',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadPublished(req.params.id, viewer);
    const removed = await db
      .delete(newsLikes)
      .where(and(eq(newsLikes.newsId, item.id), eq(newsLikes.userId, viewer.id)))
      .returning();
    if (removed.length === 0) {
      await db.insert(newsLikes).values({ newsId: item.id, userId: viewer.id }).onConflictDoNothing();
    }
    const [serialized] = await serializeMany([item], viewer);
    // Others only need the new count; this person's other pages also need «liked by me».
    broadcastEvent('news-likes', { id: item.id, likesCount: serialized.likesCount });
    signalUser(viewer.id, 'news');
    res.json(serialized);
  }),
);

newsRouter.post(
  '/news/:id/read',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadPublished(req.params.id, viewer);
    await db.insert(newsReads).values({ newsId: item.id, userId: viewer.id }).onConflictDoNothing();
    const [serialized] = await serializeMany([item], viewer);
    res.json(serialized);
  }),
);

newsRouter.post(
  '/news/:id/ack',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadPublished(req.params.id, viewer);
    const now = new Date();
    await db
      .insert(newsReads)
      .values({ newsId: item.id, userId: viewer.id, readAt: now, acknowledgedAt: now })
      .onConflictDoUpdate({
        target: [newsReads.newsId, newsReads.userId],
        set: { acknowledgedAt: sql`coalesce(${newsReads.acknowledgedAt}, ${now})` },
      });
    const [serialized] = await serializeMany([item], viewer);
    res.json(serialized);
  }),
);

newsRouter.get(
  '/news/:id/receipts',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const [item] = await db.select().from(news).where(eq(news.id, req.params.id));
    if (!item) throw new HttpError(404, 'خبر یافت نشد.');
    const audience = audienceOf(item, await db.select().from(employees).orderBy(employees.department, employees.lastName));
    const reads = await db.select().from(newsReads).where(eq(newsReads.newsId, item.id));
    const readByUser = new Map(reads.map((r) => [r.userId, r]));
    res.json(
      audience.map((e) => ({
        userId: e.id,
        name: fullName(e),
        department: e.department,
        location: e.location,
        readAt: readByUser.get(e.id)?.readAt.toISOString() ?? null,
        acknowledgedAt: readByUser.get(e.id)?.acknowledgedAt?.toISOString() ?? null,
      })),
    );
  }),
);

/** Audience members who have not acknowledged a circular yet (or not read another item). */
async function pendingPeople(item: NewsRow) {
  const audience = audienceOf(item, await db.select().from(employees));
  const reads = await db.select().from(newsReads).where(eq(newsReads.newsId, item.id));
  const done = new Set(reads.filter((r) => !item.requiresAck || r.acknowledgedAt).map((r) => r.userId));
  return audience.filter((p) => !done.has(p.id));
}

const REMIND_GAP_MS = 10 * 60 * 1000;

/** "Remind the people who have not acknowledged yet", from the read report. */
newsRouter.post(
  '/news/:id/remind',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const now = new Date();
    const [item] = await db.select().from(news).where(eq(news.id, req.params.id));
    if (!item) throw new HttpError(404, 'خبر یافت نشد.');
    if (item.isDraft || item.publishAt > now) throw new HttpError(400, 'این خبر هنوز منتشر نشده است.');
    if (item.ackRemindedAt && now.getTime() - item.ackRemindedAt.getTime() < REMIND_GAP_MS) {
      throw new HttpError(429, 'چند دقیقه پیش یادآوری فرستاده شد؛ کمی بعد دوباره امتحان کنید.');
    }
    const pending = await pendingPeople(item);
    await db.update(news).set({ ackRemindedAt: now }).where(eq(news.id, item.id));
    await createNotifications(
      pending.map((p) => p.id),
      {
        title: item.requiresAck ? 'یادآوری: بخشنامه را مطالعه و تأیید کنید 📌' : 'یادآوری: اطلاعیه را بخوانید 📰',
        message: item.ackDeadline ? `${item.title} (مهلت تأیید: ${deadlineText(item.ackDeadline)})` : item.title,
        type: 'announcement',
        linkTab: 'news',
        linkId: item.id,
      },
    );
    broadcastChange('news');
    res.json({ sent: pending.length });
  }),
);

// --- Edit history (ب۳) ---

newsRouter.get(
  '/news/:id/revisions',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const [item] = await db.select().from(news).where(eq(news.id, req.params.id));
    if (!item) throw new HttpError(404, 'خبر یافت نشد.');
    const people = new Map((await db.select().from(employees)).map((e) => [e.id, fullName(e)]));
    const rows = await db.select().from(newsRevisions).where(eq(newsRevisions.newsId, item.id)).orderBy(desc(newsRevisions.id));
    res.json({
      author: people.get(item.authorId) ?? '',
      createdAt: item.createdAt.toISOString(),
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        editor: (r.editorId && people.get(r.editorId)) || '',
        createdAt: r.createdAt.toISOString(),
        changed: r.changed,
        before: r.snapshot,
      })),
    });
  }),
);

// --- Questions to the publisher (ب۵) ---

const shorten = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** The item's author answers; news managers may too (e.g. when the author is away). */
const answers = (viewer: SessionUser | null, item: NewsRow) => Boolean(viewer) && (viewer!.id === item.authorId || can(viewer, 'news.manage'));

newsRouter.get(
  '/news/:id/questions',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const item = await loadPublished(req.params.id, viewer);
    const rows = await db.select().from(newsQuestions).where(eq(newsQuestions.newsId, item.id)).orderBy(newsQuestions.createdAt);
    const canAnswer = answers(viewer, item);
    const people = canAnswer ? new Map((await db.select().from(employees)).map((e) => [e.id, e])) : new Map();
    const shown = rows.filter((q) => canAnswer || q.askerId === viewer?.id || (q.isPublic && q.answer));
    res.json({
      canAnswer,
      items: shown.map((q) => {
        const mine = q.askerId === viewer?.id;
        const asker = people.get(q.askerId);
        return {
          id: q.id,
          // Others read the question as the publisher shared it, without the asker's name.
          question: canAnswer || mine ? q.question : (q.publicQuestion ?? q.question),
          publicQuestion: canAnswer ? q.publicQuestion : null,
          answer: q.answer,
          answeredAt: q.answeredAt?.toISOString() ?? null,
          isPublic: q.isPublic,
          mine,
          askerName: asker ? fullName(asker) : null,
          askerDepartment: asker?.department ?? null,
          createdAt: q.createdAt.toISOString(),
        };
      }),
    });
  }),
);

newsRouter.post(
  '/news/:id/questions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadPublished(req.params.id, viewer);
    if (item.authorId === viewer.id) throw new HttpError(400, 'این خبر را خودتان منتشر کرده‌اید.');
    const { question } = parse(z.object({ question: requiredText(1000) }), req.body);
    const [row] = await db.insert(newsQuestions).values({ id: newId('nq'), newsId: item.id, askerId: viewer.id, question }).returning();
    // The author answers; if they have left, the people who publish news do.
    const [author] = await db.select().from(employees).where(eq(employees.id, item.authorId));
    const recipients = author?.isActive && author.hasAccount ? [author.id] : await idsWithPermission('news.manage');
    await createNotifications(
      recipients.filter((id) => id !== viewer.id),
      {
        title: 'پرسش دربارهٔ اطلاعیه ❓',
        message: `${fullName(viewer)} دربارهٔ «${item.title}» پرسیده است: ${shorten(question)}`,
        type: 'announcement',
        linkTab: 'news',
        linkId: item.id,
      },
    );
    broadcastChange('news');
    res.status(201).json({ id: row.id });
  }),
);

async function loadQuestion(id: string) {
  const [question] = await db.select().from(newsQuestions).where(eq(newsQuestions.id, id));
  if (!question) throw new HttpError(404, 'پرسش یافت نشد.');
  const [item] = await db.select().from(news).where(eq(news.id, question.newsId));
  return { question, item };
}

newsRouter.put(
  '/news-questions/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { question, item } = await loadQuestion(req.params.id);
    if (!answers(viewer, item)) throw new HttpError(403, 'فقط ناشر خبر یا مدیران اخبار پاسخ می‌دهند.');
    const body = parse(
      z.object({ answer: requiredText(3000), isPublic: z.boolean().default(false), publicQuestion: optionalText(1000) }),
      req.body,
    );
    await db
      .update(newsQuestions)
      .set({
        answer: body.answer,
        isPublic: body.isPublic,
        publicQuestion: body.isPublic && body.publicQuestion && body.publicQuestion !== question.question ? body.publicQuestion : null,
        answeredById: viewer.id,
        answeredAt: question.answeredAt ?? new Date(),
      })
      .where(eq(newsQuestions.id, question.id));
    if (!question.answer) {
      await createNotifications([question.askerId], {
        title: 'پاسخ پرسش شما 💬',
        message: `دربارهٔ «${item.title}»: ${shorten(body.answer)}`,
        type: 'announcement',
        linkTab: 'news',
        linkId: item.id,
      });
    }
    broadcastChange('news');
    res.json({ success: true });
  }),
);

newsRouter.delete(
  '/news-questions/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { question, item } = await loadQuestion(req.params.id);
    // The asker may take back a question nobody has answered yet.
    const ownOpen = question.askerId === viewer.id && !question.answer;
    if (!ownOpen && !answers(viewer, item)) throw new HttpError(403, 'اجازهٔ حذف این پرسش را ندارید.');
    await db.delete(newsQuestions).where(eq(newsQuestions.id, question.id));
    broadcastChange('news');
    res.json({ success: true });
  }),
);

/** Unanswered questions this person should answer, for «منتظر اقدام شما». */
newsRouter.get(
  '/news-questions/pending',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db
      .select({ id: newsQuestions.id, newsId: news.id, newsTitle: news.title, authorId: news.authorId, question: newsQuestions.question, createdAt: newsQuestions.createdAt })
      .from(newsQuestions)
      .innerJoin(news, eq(news.id, newsQuestions.newsId))
      .where(isNull(newsQuestions.answer))
      .orderBy(newsQuestions.createdAt);
    // Questions on items of a publisher who has left fall to the news managers.
    const gone = new Set(
      can(viewer, 'news.manage')
        ? (await db.select().from(employees)).filter((e) => !e.isActive || !e.hasAccount).map((e) => e.id)
        : [],
    );
    res.json(
      rows
        .filter((r) => r.authorId === viewer.id || gone.has(r.authorId))
        .map((r) => ({ id: r.id, newsId: r.newsId, newsTitle: r.newsTitle, question: r.question, createdAt: r.createdAt.toISOString() })),
    );
  }),
);

// --- Templates for recurring announcements (ب۶) ---

const templateSchema = z.object({
  name: requiredText(100),
  title: requiredText(200),
  summary: optionalText(500),
  content: z.string().max(60000).default(''),
  category: optionalText(100),
  isUrgent: z.boolean().default(false),
  requiresAck: z.boolean().default(false),
  tags: z.array(requiredText(50)).max(20).default([]),
});

const serializeTemplate = (t: typeof newsTemplates.$inferSelect) => ({
  id: t.id,
  name: t.name,
  title: t.title,
  summary: t.summary,
  content: t.content,
  category: t.category,
  isUrgent: t.isUrgent,
  requiresAck: t.requiresAck,
  tags: t.tags,
  updatedAt: t.updatedAt.toISOString(),
});

newsRouter.get(
  '/news-templates',
  requirePermission('news.manage'),
  route(async (_req, res) => {
    const rows = await db.select().from(newsTemplates).orderBy(newsTemplates.name);
    res.json(rows.map(serializeTemplate));
  }),
);

newsRouter.post(
  '/news-templates',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(templateSchema, req.body);
    const [row] = await db
      .insert(newsTemplates)
      .values({ id: newId('tpl'), ...body, content: sanitizeRichText(body.content), createdById: viewer.id })
      .returning();
    await audit(viewer, { action: 'create', entity: 'news_template', id: row.id, title: row.name });
    res.status(201).json(serializeTemplate(row));
  }),
);

newsRouter.put(
  '/news-templates/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const body = parse(templateSchema, req.body);
    const [row] = await db
      .update(newsTemplates)
      .set({ ...body, content: sanitizeRichText(body.content), updatedAt: new Date() })
      .where(eq(newsTemplates.id, req.params.id))
      .returning();
    if (!row) throw new HttpError(404, 'قالب یافت نشد.');
    await audit(currentUser(req), { action: 'update', entity: 'news_template', id: row.id, title: row.name });
    res.json(serializeTemplate(row));
  }),
);

newsRouter.delete(
  '/news-templates/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const [deleted] = await db.delete(newsTemplates).where(eq(newsTemplates.id, req.params.id)).returning({ id: newsTemplates.id, name: newsTemplates.name });
    if (!deleted) throw new HttpError(404, 'قالب یافت نشد.');
    await audit(currentUser(req), { action: 'delete', entity: 'news_template', id: deleted.id, title: deleted.name });
    res.json({ success: true });
  }),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NAMES = 10;

const nameList = (people: { firstName: string; lastName: string }[]) =>
  people.slice(0, MAX_NAMES).map(fullName).join('، ') + (people.length > MAX_NAMES ? ` و ${toPersianDigits(people.length - MAX_NAMES)} نفر دیگر` : '');

/** Marks a step of an item as done; false when another run did it already. */
async function claim(item: NewsRow, step: 'ackAutoRemindedAt' | 'ackReportedAt', now: Date) {
  const claimed = await db
    .update(news)
    .set({ [step]: now })
    .where(and(eq(news.id, item.id), isNull(news[step])))
    .returning({ id: news.id });
  return claimed.length > 0;
}

/**
 * Circular deadlines, run by the scheduler: a reminder a day before the deadline to those who have
 * not acknowledged, and after the deadline a report to the publisher (by department) and to each
 * direct manager about their own people.
 */
export async function processAckDeadlines(now = new Date()) {
  const dueSoon = await db
    .select()
    .from(news)
    .where(
      and(
        eq(news.requiresAck, true),
        eq(news.isDraft, false),
        isNull(news.ackAutoRemindedAt),
        lte(news.publishAt, now),
        gt(news.ackDeadline, now),
        lte(news.ackDeadline, new Date(now.getTime() + DAY_MS)),
      ),
    );
  for (const item of dueSoon) {
    if (!(await claim(item, 'ackAutoRemindedAt', now))) continue;
    // Published only hours ago: the announcement itself is the reminder.
    if (now.getTime() - item.publishAt.getTime() < DAY_MS / 2) continue;
    const pending = await pendingPeople(item);
    await createNotifications(pending.map((p) => p.id), {
      title: 'مهلت تأیید بخشنامه رو به پایان است ⏰',
      message: `${item.title} (مهلت تأیید: ${deadlineText(item.ackDeadline!)})`,
      type: 'announcement',
      linkTab: 'news',
      linkId: item.id,
    });
  }

  const overdue = await db
    .select()
    .from(news)
    .where(and(eq(news.requiresAck, true), eq(news.isDraft, false), isNotNull(news.ackDeadline), isNull(news.ackReportedAt), lte(news.ackDeadline, now)));
  for (const item of overdue) {
    if (!(await claim(item, 'ackReportedAt', now))) continue;
    const everyone = await db.select().from(employees);
    const pending = await pendingPeople(item);
    const byDepartment = new Map<string, number>();
    for (const p of pending) byDepartment.set(p.department, (byDepartment.get(p.department) ?? 0) + 1);
    await createNotifications([item.authorId], {
      title: pending.length === 0 ? 'همه بخشنامه را تأیید کردند ✅' : `${toPersianDigits(pending.length)} نفر بخشنامه را تا مهلت تأیید نکردند`,
      message:
        pending.length === 0
          ? item.title
          : `«${item.title}»: ${[...byDepartment].map(([department, count]) => `${department} ${toPersianDigits(count)} نفر`).join('، ')}. فهرست کامل در گزارش خوانده‌شدن.`,
      type: 'announcement',
      linkTab: 'news',
      linkId: item.id,
    });

    // Each direct manager hears about their own people, so they can follow up.
    const byManager = new Map<string, typeof pending>();
    for (const p of pending) {
      if (!p.directManagerId || p.directManagerId === item.authorId) continue;
      byManager.set(p.directManagerId, [...(byManager.get(p.directManagerId) ?? []), p]);
    }
    const audience = audienceOfItem(item);
    for (const [managerId, people] of byManager) {
      const manager = everyone.find((e) => e.id === managerId);
      if (!manager?.isActive || !manager.hasAccount) continue;
      await createNotifications([managerId], {
        title: 'همکاران شما بخشنامه را تأیید نکرده‌اند',
        message: `${nameList(people)} بخشنامهٔ «${item.title}» را تا مهلت (${deadlineText(item.ackDeadline!)}) تأیید نکرده‌اند.`,
        type: 'announcement',
        linkTab: 'news',
        // A manager outside the audience cannot open the item itself.
        linkId: inAudience(manager, audience) ? item.id : undefined,
      });
    }
  }
}
