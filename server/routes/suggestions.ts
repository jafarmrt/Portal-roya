import { createHash, randomInt } from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { featureVisible } from '../../shared/features.js';
import {
  boxNames,
  normalizeTrackingCode,
  SUGGESTION_BOX_IDS,
  SUGGESTION_BOXES,
  SUGGESTION_KIND_IDS,
  suggestionBox,
  suggestionKindLabel,
  TRACKING_ALPHABET,
} from '../../shared/suggestions.js';
import { can, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { employees, suggestions } from '../db/schema.js';
import { featureConfig } from '../features.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import { createNotifications } from '../notify.js';
import { idsWithPermission } from '../roles.js';
import { ensureSettings } from '../settings.js';
import { fullName } from '../serializers.js';
import { requiredText } from '../validation.js';

// صندوق انتقادات و پیشنهادات. Nothing here writes to the audit log or the console: an anonymous
// message must not be traceable to its sender, not even by the portal's admin.

export const suggestionsRouter = Router();

type SuggestionRow = typeof suggestions.$inferSelect;

const readableBoxes = (viewer: SessionUser) => SUGGESTION_BOXES.filter((b) => can(viewer, b.permission)).map((b) => b.id);

function requireReader(viewer: SessionUser, box: string) {
  const def = suggestionBox(box);
  if (!def) throw new HttpError(404, 'صندوق یافت نشد.');
  if (!can(viewer, def.permission)) throw new HttpError(403, 'شما خوانندهٔ این صندوق نیستید.');
  return def;
}

const hashCode = (code: string) => createHash('sha256').update(normalizeTrackingCode(code)).digest('hex');

function newTrackingCode() {
  const chars = Array.from({ length: 12 }, () => TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

// Iran has kept +03:30 all year since 2022.
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Noon in Tehran of the given moment's day: anonymous messages keep only the day they were sent.
 * Noon rather than midnight, so the day reads the same on a computer set to another time zone.
 */
export function tehranDay(at: Date) {
  return new Date(Math.floor((at.getTime() + TEHRAN_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS / 2 - TEHRAN_OFFSET_MS);
}

// A colleague may send a few messages an hour. Kept in memory only, so nothing about who sent what is stored.
const SEND_LIMIT = 10;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const recentSends = new Map<string, number[]>();

function checkSendLimit(userId: string) {
  const now = Date.now();
  const recent = (recentSends.get(userId) ?? []).filter((t) => now - t < SEND_WINDOW_MS);
  if (recent.length >= SEND_LIMIT) throw new HttpError(429, 'در یک ساعت گذشته پیام‌های زیادی فرستاده‌اید. کمی بعد دوباره تلاش کنید.');
  recent.push(now);
  recentSends.set(userId, recent);
}

/** For tests: forget the send counts. */
export function resetSuggestionLimits() {
  recentSends.clear();
}

/** What the sender sees of their own message (named ones in «پیام‌های من», anonymous ones by code). */
function forSender(row: SuggestionRow) {
  return {
    id: row.id,
    box: row.box,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    isAnonymous: row.isAnonymous,
    createdAt: row.createdAt.toISOString(),
    isRead: Boolean(row.readAt),
    reply: row.reply,
    repliedAt: row.repliedAt?.toISOString() ?? null,
  };
}

suggestionsRouter.post(
  '/suggestions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(
      z.object({
        box: z.enum(SUGGESTION_BOX_IDS),
        kind: z.enum(SUGGESTION_KIND_IDS).default('suggestion'),
        subject: requiredText(200),
        body: requiredText(5000),
        anonymous: z.boolean().default(false),
      }),
      req.body,
    );
    const box = suggestionBox(body.box)!;
    // A box that is switched off (or in preview for others) takes no new messages; its readers still answer the earlier ones.
    if (!featureVisible(await featureConfig(), box.feature, viewer)) throw new HttpError(400, 'این صندوق فعلاً پیام تازه نمی‌پذیرد.');
    checkSendLimit(viewer.id);
    const { label } = boxNames((await ensureSettings()).suggestionBoxNames, box.id);
    const trackingCode = body.anonymous ? newTrackingCode() : null;
    const now = new Date();
    const [row] = await db
      .insert(suggestions)
      .values({
        id: newId('sg'),
        box: body.box,
        kind: body.kind,
        subject: body.subject,
        body: body.body,
        isAnonymous: body.anonymous,
        senderId: body.anonymous ? null : viewer.id,
        trackingHash: trackingCode ? hashCode(trackingCode) : null,
        createdAt: body.anonymous ? tehranDay(now) : now,
      })
      .returning();

    // The readers are told something arrived, never by whom. An anonymous sender who reads the box
    // themselves is notified too, so leaving them out gives nothing away.
    const readers = await idsWithPermission(box.permission);
    await createNotifications(
      body.anonymous ? readers : readers.filter((id) => id !== viewer.id),
      {
        title: `پیام تازه در ${label} 📮`,
        message: `${suggestionKindLabel(body.kind)}: «${body.subject}»`,
        type: 'suggestion',
        linkTab: 'suggestions',
        linkId: box.id,
      },
    );
    res.status(201).json({ id: row.id, trackingCode });
  }),
);

/** The colleague's own named messages and their answers. */
suggestionsRouter.get(
  '/suggestions/mine',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db.select().from(suggestions).where(eq(suggestions.senderId, viewer.id)).orderBy(desc(suggestions.createdAt));
    res.json(rows.map(forSender));
  }),
);

/** An anonymous message and its answer, found by the tracking code its sender kept. */
suggestionsRouter.post(
  '/suggestions/track',
  route(async (req, res) => {
    currentUser(req);
    const { code } = parse(z.object({ code: z.string().trim().min(1).max(40) }), req.body);
    if (normalizeTrackingCode(code).length !== 12) throw new HttpError(400, 'کد پیگیری ۱۲ حرف و عدد است، مثل K7QM-3XPA-9TRW.');
    const [row] = await db.select().from(suggestions).where(eq(suggestions.trackingHash, hashCode(code)));
    if (!row) throw new HttpError(404, 'پیامی با این کد پیدا نشد. کد را دوباره بررسی کنید.');
    res.json(forSender(row));
  }),
);

/** Unread messages in the boxes this person reads, for the menu badge and «کارهای من». */
suggestionsRouter.get(
  '/suggestions/summary',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const boxes = readableBoxes(viewer);
    const counts = Object.fromEntries(boxes.map((b) => [b, 0])) as Record<string, number>;
    if (boxes.length > 0) {
      const rows = await db
        .select({ box: suggestions.box })
        .from(suggestions)
        .where(and(inArray(suggestions.box, boxes), isNull(suggestions.readAt), eq(suggestions.isClosed, false)));
      for (const r of rows) counts[r.box] = (counts[r.box] ?? 0) + 1;
    }
    res.json({ boxes, unread: counts });
  }),
);

/** A box's messages, for its readers. */
suggestionsRouter.get(
  '/suggestions/box/:box',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const box = requireReader(viewer, req.params.box);
    const rows = await db.select().from(suggestions).where(eq(suggestions.box, box.id)).orderBy(desc(suggestions.createdAt));
    const ids = [...new Set(rows.flatMap((r) => [r.senderId, r.repliedById]).filter((id): id is string => Boolean(id)))];
    const people = new Map(
      (ids.length > 0 ? await db.select().from(employees).where(inArray(employees.id, ids)) : []).map((e) => [e.id, e]),
    );
    res.json(
      rows.map((r) => {
        const sender = r.senderId ? people.get(r.senderId) : undefined;
        const repliedBy = r.repliedById ? people.get(r.repliedById) : undefined;
        return {
          ...forSender(r),
          sender: sender
            ? { id: sender.id, name: fullName(sender), department: sender.department, position: sender.position, avatar: sender.avatarUrl }
            : null,
          readAt: r.readAt?.toISOString() ?? null,
          repliedByName: repliedBy ? fullName(repliedBy) : null,
          isClosed: r.isClosed,
          // An anonymous sender can only read the answer with their tracking code.
          canFollow: r.isAnonymous ? Boolean(r.trackingHash) : Boolean(sender),
        };
      }),
    );
  }),
);

async function loadForReader(viewer: SessionUser, id: string) {
  const [row] = await db.select().from(suggestions).where(eq(suggestions.id, id));
  if (!row) throw new HttpError(404, 'پیام یافت نشد.');
  return { row, box: requireReader(viewer, row.box) };
}

/** Opening a message marks it as read for every reader of the box. */
suggestionsRouter.post(
  '/suggestions/:id/read',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { row } = await loadForReader(viewer, req.params.id);
    if (!row.readAt) await db.update(suggestions).set({ readAt: new Date() }).where(eq(suggestions.id, row.id));
    res.json({ success: true });
  }),
);

suggestionsRouter.put(
  '/suggestions/:id/reply',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { row, box } = await loadForReader(viewer, req.params.id);
    const { reply } = parse(z.object({ reply: requiredText(5000) }), req.body);
    const now = new Date();
    await db
      .update(suggestions)
      .set({ reply, repliedById: viewer.id, repliedAt: now, readAt: row.readAt ?? now })
      .where(eq(suggestions.id, row.id));
    if (row.senderId && !row.reply) {
      await createNotifications([row.senderId], {
        title: `پاسخ ${boxNames((await ensureSettings()).suggestionBoxNames, box.id).label} 💬`,
        message: `به پیام «${row.subject}» پاسخ داده شد.`,
        type: 'suggestion',
        linkTab: 'suggestions',
        linkId: 'mine',
      });
    }
    res.json({ success: true });
  }),
);

/** Archive a handled message, or bring it back. */
suggestionsRouter.patch(
  '/suggestions/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { row } = await loadForReader(viewer, req.params.id);
    const { closed } = parse(z.object({ closed: z.boolean() }), req.body);
    await db.update(suggestions).set({ isClosed: closed, readAt: row.readAt ?? new Date() }).where(eq(suggestions.id, row.id));
    res.json({ success: true });
  }),
);

/** Readers may remove a message that is abusive or sent by mistake. */
suggestionsRouter.delete(
  '/suggestions/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { row } = await loadForReader(viewer, req.params.id);
    await db.delete(suggestions).where(eq(suggestions.id, row.id));
    res.json({ success: true });
  }),
);
