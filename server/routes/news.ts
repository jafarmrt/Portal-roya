import { and, arrayOverlaps, desc, eq, gt, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { jalaliEndOfDay, jalaliToDate } from '../../shared/jalali.js';
import { can, type SessionUser, requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { employees, news, newsLikes, newsReads } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { assetUrl, attachment, jalaliDate, requiredText, timeOfDay } from '../validation.js';

export const newsRouter = Router();

type NewsRow = typeof news.$inferSelect;

/**
 * What a viewer without news.manage may see: published, not expired, and aimed at their department.
 * Visitors who are not signed in only see items addressed to everyone.
 */
function visibleTo(viewer: SessionUser | null): SQL | undefined {
  if (can(viewer, 'news.manage')) return undefined;
  const now = new Date();
  const forEveryone = sql`cardinality(${news.targetDepartments}) = 0`;
  return and(
    lte(news.publishAt, now),
    or(isNull(news.expiresAt), gt(news.expiresAt, now)),
    viewer ? or(forEveryone, arrayOverlaps(news.targetDepartments, [viewer.department])) : forEveryone,
  );
}

function statusOf(item: NewsRow) {
  const now = new Date();
  if (item.publishAt > now) return 'scheduled';
  if (item.expiresAt && item.expiresAt <= now) return 'expired';
  return 'published';
}

async function serializeMany(items: NewsRow[], viewer: SessionUser | null) {
  if (items.length === 0) return [];
  const ids = items.map((n) => n.id);

  const [authors, likeCounts, myLikes, myReads] = await Promise.all([
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
  ]);

  const authorById = new Map(authors.map((a) => [a.id, a]));
  const likes = new Map(likeCounts.map((l) => [l.newsId, l.count]));
  const liked = new Set(myLikes.map((l) => l.newsId));
  const reads = new Map(myReads.map((r) => [r.newsId, r]));

  let readStats = new Map<string, { read: number; acknowledged: number; audience: number }>();
  if (can(viewer, 'news.manage')) {
    const active = authors.filter((a) => a.isActive);
    const counts = await db
      .select({
        newsId: newsReads.newsId,
        read: sql<number>`count(*)::int`,
        acknowledged: sql<number>`count(${newsReads.acknowledgedAt})::int`,
      })
      .from(newsReads)
      .where(inArray(newsReads.newsId, ids))
      .groupBy(newsReads.newsId);
    const countById = new Map(counts.map((c) => [c.newsId, c]));
    readStats = new Map(
      items.map((n) => {
        const audience = n.targetDepartments.length
          ? active.filter((a) => n.targetDepartments.includes(a.department)).length
          : active.length;
        const c = countById.get(n.id);
        return [n.id, { read: c?.read ?? 0, acknowledged: c?.acknowledged ?? 0, audience }];
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
    };
  });
}

async function loadVisible(id: string, viewer: SessionUser | null) {
  const [item] = await db.select().from(news).where(and(eq(news.id, id), visibleTo(viewer)));
  if (!item) throw new HttpError(404, 'خبر یافت نشد.');
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
    const filters = [visibleTo(viewer)];
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
  content: requiredText(20000),
  category: requiredText(100),
  image: assetUrl,
  isPinned: z.boolean().default(false),
  isUrgent: z.boolean().default(false),
  requiresAck: z.boolean().default(false),
  tags: z.array(requiredText(50)).max(20).default([]),
  targetDepartments: z.array(requiredText(100)).max(50).default([]),
  attachments: z.array(attachment).max(10).default([]),
  // Optional scheduling, in Jalali; empty means "now" / "never expires".
  publishDate: jalaliDate.optional().or(z.literal('')),
  publishTime: timeOfDay.optional().or(z.literal('')),
  expiresDate: jalaliDate.optional().or(z.literal('')),
});

function scheduleFrom(body: z.infer<typeof newsSchema>) {
  const publishAt = body.publishDate ? jalaliToDate(body.publishDate, body.publishTime || '08:00') : new Date();
  const expiresAt = body.expiresDate ? jalaliEndOfDay(body.expiresDate) : null;
  if (!publishAt) throw new HttpError(400, 'تاریخ انتشار نامعتبر است.');
  if (expiresAt && expiresAt <= publishAt) throw new HttpError(400, 'تاریخ انقضا باید بعد از تاریخ انتشار باشد.');
  return { publishAt, expiresAt };
}

/** Sends in-portal notifications (and e-mail for urgent items) once an item is live. */
export async function announceNews(item: NewsRow) {
  const claimed = await db
    .update(news)
    .set({ notifiedAt: new Date() })
    .where(and(eq(news.id, item.id), isNull(news.notifiedAt)))
    .returning({ id: news.id });
  if (claimed.length === 0) return;

  const recipients = await audienceIds(item.targetDepartments, item.authorId);
  await createNotifications(
    recipients,
    {
      title: item.requiresAck ? 'بخشنامهٔ جدید: لطفاً مطالعه و تأیید کنید 📌' : item.isUrgent ? 'اطلاعیهٔ فوری 🔴' : 'خبر/اطلاعیهٔ جدید 📰',
      message: item.title,
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
    const body = parse(newsSchema, req.body);
    const { publishAt, expiresAt } = scheduleFrom(body);
    const [item] = await db
      .insert(news)
      .values({
        id: newId('news'),
        title: body.title,
        summary: body.summary,
        content: body.content,
        category: body.category,
        authorId: viewer.id,
        image: body.image,
        isPinned: body.isPinned,
        isUrgent: body.isUrgent,
        requiresAck: body.requiresAck,
        tags: body.tags,
        targetDepartments: body.targetDepartments,
        attachments: body.attachments,
        publishAt,
        expiresAt,
      })
      .returning();
    if (publishAt <= new Date()) await announceNews(item);
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
    const body = parse(newsSchema, req.body);
    const { publishAt, expiresAt } = scheduleFrom(body);
    const [item] = await db
      .update(news)
      .set({
        title: body.title,
        summary: body.summary,
        content: body.content,
        category: body.category,
        image: body.image,
        isPinned: body.isPinned,
        isUrgent: body.isUrgent,
        requiresAck: body.requiresAck,
        tags: body.tags,
        targetDepartments: body.targetDepartments,
        attachments: body.attachments,
        publishAt,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(news.id, existing.id))
      .returning();
    if (publishAt <= new Date()) await announceNews(item);
    broadcastChange('news');
    const [serialized] = await serializeMany([item], viewer);
    res.json(serialized);
  }),
);

newsRouter.delete(
  '/news/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const deleted = await db.delete(news).where(eq(news.id, req.params.id)).returning({ id: news.id });
    if (deleted.length === 0) throw new HttpError(404, 'خبر یافت نشد.');
    broadcastChange('news');
    res.json({ success: true });
  }),
);

newsRouter.post(
  '/news/:id/like',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadVisible(req.params.id, viewer);
    const removed = await db
      .delete(newsLikes)
      .where(and(eq(newsLikes.newsId, item.id), eq(newsLikes.userId, viewer.id)))
      .returning();
    if (removed.length === 0) {
      await db.insert(newsLikes).values({ newsId: item.id, userId: viewer.id }).onConflictDoNothing();
    }
    const [serialized] = await serializeMany([item], viewer);
    broadcastChange('news');
    res.json(serialized);
  }),
);

newsRouter.post(
  '/news/:id/read',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadVisible(req.params.id, viewer);
    await db.insert(newsReads).values({ newsId: item.id, userId: viewer.id }).onConflictDoNothing();
    const [serialized] = await serializeMany([item], viewer);
    res.json(serialized);
  }),
);

newsRouter.post(
  '/news/:id/ack',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const item = await loadVisible(req.params.id, viewer);
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
    const audience = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.isActive, true),
          eq(employees.hasAccount, true),
          item.targetDepartments.length ? inArray(employees.department, item.targetDepartments) : undefined,
        ),
      )
      .orderBy(employees.department, employees.lastName);
    const reads = await db.select().from(newsReads).where(eq(newsReads.newsId, item.id));
    const readByUser = new Map(reads.map((r) => [r.userId, r]));
    res.json(
      audience.map((e) => ({
        userId: e.id,
        name: fullName(e),
        department: e.department,
        readAt: readByUser.get(e.id)?.readAt.toISOString() ?? null,
        acknowledgedAt: readByUser.get(e.id)?.acknowledgedAt?.toISOString() ?? null,
      })),
    );
  }),
);
