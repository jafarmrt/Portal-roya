import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { featureVisible } from '../../shared/features.js';
import {
  KUDOS_BANNER_MAX,
  KUDOS_DAILY_LIMIT,
  KUDOS_KEEP_DAYS,
  KUDOS_PAIR_MINUTES,
  KUDOS_REPLY_HOURS,
  kudosEmojis,
  kudosMessage,
} from '../../shared/kudos.js';
import { toPersianDigits } from '../../shared/jalali.js';
import type { SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { employees, kudos } from '../db/schema.js';
import { sendToUser } from '../events.js';
import { featureConfig } from '../features.js';
import { HttpError, currentUser, parse, route } from '../http.js';
import { markActive, onlineIds, presenceChanged } from '../presence.js';
import { fullName } from '../serializers.js';
import { ensureSettings } from '../settings.js';

// «همکاران آنلاین»: who has the portal open, and a ready-made emoji to one of them. No text at all.

export const kudosRouter = Router();

const MINUTE_MS = 60_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const startOfToday = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Online colleagues this person may see: shown by their own choice, and who see the part themselves. */
async function visibleOnline(viewer: SessionUser) {
  const ids = onlineIds().filter((id) => id !== viewer.id);
  if (ids.length === 0) return [];
  const config = await featureConfig();
  const rows = await db
    .select()
    .from(employees)
    .where(and(inArray(employees.id, ids), eq(employees.isActive, true), eq(employees.hasAccount, true), eq(employees.showOnline, true)));
  return rows
    .filter((e) => featureVisible(config, 'onlineColleagues', e))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fa'));
}

/** When this person may next send to each colleague, for those they sent to in the last few minutes. */
async function waits(viewerId: string, now: Date, tx: Tx | typeof db = db) {
  const since = new Date(now.getTime() - KUDOS_PAIR_MINUTES * MINUTE_MS);
  const rows = await tx
    .select({ toId: kudos.toId, createdAt: kudos.createdAt })
    .from(kudos)
    .where(and(eq(kudos.fromId, viewerId), gte(kudos.createdAt, since)));
  const until: Record<string, string> = {};
  for (const r of rows) {
    const at = new Date(r.createdAt.getTime() + KUDOS_PAIR_MINUTES * MINUTE_MS).toISOString();
    if (!until[r.toId] || until[r.toId] < at) until[r.toId] = at;
  }
  return until;
}

async function sentToday(viewerId: string, now: Date, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select({ n: count() })
    .from(kudos)
    .where(and(eq(kudos.fromId, viewerId), gte(kudos.createdAt, startOfToday(now))));
  return row?.n ?? 0;
}

kudosRouter.get(
  '/presence',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const now = new Date();
    const emojis = kudosEmojis((await ensureSettings()).kudosEmojis);
    const me = { showOnline: viewer.showOnline, acceptKudos: viewer.acceptKudos };
    // Someone who keeps themselves off the list does not see the others either.
    if (!viewer.showOnline) {
      res.json({ me, emojis, online: [], waits: {}, sentToday: 0, dailyLimit: KUDOS_DAILY_LIMIT });
      return;
    }
    const online = (await visibleOnline(viewer)).map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      avatar: e.avatarUrl,
      position: e.position,
      department: e.department,
      acceptKudos: e.acceptKudos,
    }));
    res.json({ me, emojis, online, waits: await waits(viewer.id, now), sentToday: await sentToday(viewer.id, now), dailyLimit: KUDOS_DAILY_LIMIT });
  }),
);

/** The page saw a click, a key or a scroll; sent at most about once a minute. */
kudosRouter.post(
  '/presence/active',
  route(async (req, res) => {
    markActive(currentUser(req).id);
    res.status(204).end();
  }),
);

/** The colleague's own choices: to be shown in the list (and see it), and to receive emoji. */
kudosRouter.put(
  '/presence/me',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(z.object({ showOnline: z.boolean(), acceptKudos: z.boolean() }).partial(), req.body);
    const [updated] = await db.update(employees).set(body).where(eq(employees.id, viewer.id)).returning();
    if (body.showOnline !== undefined && body.showOnline !== viewer.showOnline) presenceChanged();
    res.json({ showOnline: updated.showOnline, acceptKudos: updated.acceptKudos });
  }),
);

const sendSchema = z.object({
  to: z.string().min(1).max(100),
  emoji: z.string().min(1).max(50),
  // The emoji received that this one answers.
  replyTo: z.number().int().positive().optional(),
});

kudosRouter.post(
  '/kudos',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(sendSchema, req.body);
    const now = new Date();
    if (!viewer.showOnline) {
      throw new HttpError(400, 'برای فرستادن ایموجی، اول «نمایش من در همکاران آنلاین» را در پروفایل خود روشن کنید.');
    }
    if (body.to === viewer.id) throw new HttpError(400, 'نمی‌توانید برای خودتان ایموجی بفرستید.');
    const emoji = kudosEmojis((await ensureSettings()).kudosEmojis).find((e) => e.id === body.emoji);
    if (!emoji) throw new HttpError(400, 'این ایموجی دیگر در فهرست نیست؛ صفحه را دوباره باز کنید.');

    const [target] = await db.select().from(employees).where(eq(employees.id, body.to)).limit(1);
    if (!target || !target.isActive || !target.hasAccount || !featureVisible(await featureConfig(), 'onlineColleagues', target)) {
      throw new HttpError(404, 'همکار پیدا نشد.');
    }
    if (!target.acceptKudos) throw new HttpError(400, 'این همکار دریافت ایموجی را خاموش کرده است.');

    if (body.replyTo !== undefined) {
      // One emoji back to the person who sent it, within a day; the exchange goes no further.
      const [original] = await db.select().from(kudos).where(eq(kudos.id, body.replyTo)).limit(1);
      const [answered] = await db.select({ id: kudos.id }).from(kudos).where(eq(kudos.replyToId, body.replyTo)).limit(1);
      const tooOld = original && now.getTime() - original.createdAt.getTime() > KUDOS_REPLY_HOURS * 60 * MINUTE_MS;
      if (!original || original.toId !== viewer.id || original.fromId !== target.id || original.replyToId !== null || answered || tooOld) {
        throw new HttpError(400, 'به این ایموجی دیگر نمی‌شود پاسخ داد.');
      }
    } else if (!target.showOnline || !onlineIds().includes(target.id)) {
      throw new HttpError(400, 'این همکار الان آنلاین نیست.');
    }

    // The limits are checked and the emoji saved under a lock on the sender, so several clicks at once
    // (a double click, two open pages) cannot get past them together.
    let created: typeof kudos.$inferSelect;
    try {
      created = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kudos:${viewer.id}`}))`);
        const wait = (await waits(viewer.id, now, tx))[target.id];
        if (wait) {
          const minutes = Math.max(1, Math.ceil((new Date(wait).getTime() - now.getTime()) / MINUTE_MS));
          throw new HttpError(429, `به هر همکار هر ${toPersianDigits(KUDOS_PAIR_MINUTES)} دقیقه یک ایموجی می‌شود فرستاد؛ ${toPersianDigits(minutes)} دقیقهٔ دیگر.`);
        }
        if ((await sentToday(viewer.id, now, tx)) >= KUDOS_DAILY_LIMIT) {
          throw new HttpError(429, `امروز ${toPersianDigits(KUDOS_DAILY_LIMIT)} ایموجی فرستاده‌اید؛ فردا دوباره می‌توانید.`);
        }
        const [row] = await tx
          .insert(kudos)
          .values({ fromId: viewer.id, toId: target.id, emoji: emoji.emoji, label: emoji.label, replyToId: body.replyTo ?? null })
          .returning();
        return row;
      });
    } catch (err) {
      if (err instanceof HttpError || body.replyTo === undefined) throw err;
      // Two answers to the same emoji at once (two open pages); only one is kept.
      throw new HttpError(400, 'به این ایموجی دیگر نمی‌شود پاسخ داد.');
    }
    markActive(viewer.id);
    // Answering closes the banner of the emoji answered.
    if (body.replyTo !== undefined) {
      await db.update(kudos).set({ dismissedAt: now }).where(and(eq(kudos.id, body.replyTo), isNull(kudos.dismissedAt)));
      sendToUser(viewer.id, 'kudos', {});
    }
    // No notification: the receiver's open pages show it in a small banner at once (see GET /kudos/banner).
    sendToUser(target.id, 'kudos', {});
    res.status(201).json({ id: created.id, waitUntil: new Date(now.getTime() + KUDOS_PAIR_MINUTES * MINUTE_MS).toISOString() });
  }),
);

/**
 * The emoji waiting in this person's banner: received in the last day and not closed yet, newest
 * first. Each can be answered once with one emoji, unless it is itself an answer.
 */
kudosRouter.get(
  '/kudos/banner',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const since = new Date(Date.now() - KUDOS_REPLY_HOURS * 60 * MINUTE_MS);
    const rows = await db
      .select({ k: kudos, from: employees })
      .from(kudos)
      .innerJoin(employees, eq(employees.id, kudos.fromId))
      .where(and(eq(kudos.toId, viewer.id), isNull(kudos.dismissedAt), gte(kudos.createdAt, since)))
      .orderBy(desc(kudos.createdAt))
      .limit(KUDOS_BANNER_MAX);
    const ids = rows.map((r) => r.k.id);
    const answered = new Set(
      ids.length
        ? (await db.select({ id: kudos.replyToId }).from(kudos).where(inArray(kudos.replyToId, ids))).map((r) => r.id)
        : [],
    );
    res.json(
      rows.map(({ k, from }) => ({
        id: k.id,
        from: { id: from.id, firstName: from.firstName, lastName: from.lastName, avatar: from.avatarUrl },
        emoji: k.emoji,
        label: k.label,
        message: kudosMessage(fullName(from), k, k.replyToId !== null),
        createdAt: k.createdAt.toISOString(),
        canReply: k.replyToId === null && !answered.has(k.id) && from.isActive && from.acceptKudos && viewer.showOnline,
      })),
    );
  }),
);

/** Closes emoji in this person's banner: the ids given, or all of them. */
kudosRouter.post(
  '/kudos/banner/dismiss',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(100).optional() }), req.body);
    const mine = and(eq(kudos.toId, viewer.id), isNull(kudos.dismissedAt));
    await db
      .update(kudos)
      .set({ dismissedAt: new Date() })
      .where(ids ? and(mine, inArray(kudos.id, ids.length ? ids : [0])) : mine);
    // The person's other open pages close it too.
    sendToUser(viewer.id, 'kudos', {});
    res.status(204).end();
  }),
);

/** How many emoji colleagues sent each other between two moments, for the monthly summary. */
export async function kudosCount(from: Date, to: Date) {
  const [row] = await db.select({ n: count() }).from(kudos).where(and(gte(kudos.createdAt, from), lt(kudos.createdAt, to)));
  return row?.n ?? 0;
}

/** Nightly: emoji older than the reports need are removed. */
export async function pruneKudos(now = new Date()) {
  await db.delete(kudos).where(lt(kudos.createdAt, new Date(now.getTime() - KUDOS_KEEP_DAYS * 24 * 60 * MINUTE_MS)));
}
