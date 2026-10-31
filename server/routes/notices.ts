import { and, count, desc, eq, gt, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { NOTICE_KEEP_DAYS, NOTICE_SENDER_MAX, NOTICE_TEXT_MAX, noticeWindow } from '../../shared/notices.js';
import { featureVisible } from '../../shared/features.js';
import { isValidJalaliDate, toJalali, toPersianDigits } from '../../shared/jalali.js';
import { audit } from '../audit.js';
import { audienceIncludes, audienceOfRow, checkAudience } from '../audience.js';
import { requirePermission, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { employees, noticeDismissals, notices } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { featureConfig } from '../features.js';
import { HttpError, currentUser, newId, parse, route, viewerOf } from '../http.js';
import { audienceIdsFor, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';

// «تابلوی اعلانات»: short notices shown in full on the dashboard of their audience for a few days.
// They are not news: they never appear in the news list and send a notification only when asked to.

export const noticesRouter = Router();

type NoticeRow = typeof notices.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

const audienceColumns = {
  departments: notices.targetDepartments,
  locations: notices.targetLocations,
  roles: notices.targetRoles,
  userIds: notices.targetUserIds,
};

const serialize = (n: NoticeRow, seen: boolean) => ({
  id: n.id,
  text: n.text,
  sender: n.sender,
  important: n.important,
  startsAt: n.startsAt.toISOString(),
  endsAt: n.endsAt.toISOString(),
  seen,
});

/** A short title for the change history and the notification: the first line, cut. */
export function noticeTitle(text: string) {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.length > 70 ? `${line.slice(0, 70)}…` : line;
}

const dayText = (d: Date) => toPersianDigits(toJalali(d));

/** Live notices for this viewer (a guest gets only those for everyone): important first, then newest. */
noticesRouter.get(
  '/notices',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const now = new Date();
    const rows = await db
      .select()
      .from(notices)
      .where(and(lte(notices.startsAt, now), gt(notices.endsAt, now), audienceIncludes(audienceColumns, viewer)))
      .orderBy(desc(notices.important), desc(notices.startsAt), desc(notices.createdAt));
    let seen = new Set<string>();
    if (viewer && rows.length > 0) {
      const marks = await db
        .select({ id: noticeDismissals.noticeId })
        .from(noticeDismissals)
        .where(and(eq(noticeDismissals.employeeId, viewer.id), inArray(noticeDismissals.noticeId, rows.map((r) => r.id))));
      seen = new Set(marks.map((m) => m.id));
    }
    res.json(rows.map((r) => serialize(r, seen.has(r.id))));
  }),
);

/** Every notice for the people who publish them: scheduled, live and recently ended, with how many saw each. */
noticesRouter.get(
  '/notices/manage',
  requirePermission('news.manage'),
  route(async (_req, res) => {
    const since = new Date(Date.now() - NOTICE_KEEP_DAYS * DAY_MS);
    const rows = await db.select().from(notices).where(gt(notices.endsAt, since)).orderBy(desc(notices.startsAt), desc(notices.createdAt));
    if (rows.length === 0) {
      res.json([]);
      return;
    }
    const ids = rows.map((r) => r.id);
    const seenCounts = await db
      .select({ id: noticeDismissals.noticeId, n: count() })
      .from(noticeDismissals)
      .where(inArray(noticeDismissals.noticeId, ids))
      .groupBy(noticeDismissals.noticeId);
    const seen = new Map(seenCounts.map((s) => [s.id, Number(s.n)]));
    const authorIds = [...new Set(rows.map((r) => r.createdById).filter((id): id is string => Boolean(id)))];
    const authors = authorIds.length > 0 ? await db.select().from(employees).where(inArray(employees.id, authorIds)) : [];
    const names = new Map(authors.map((a) => [a.id, fullName(a)]));
    // Counted the way the board shows them: active colleagues with an account, in the audience, who see the board.
    const config = await featureConfig();
    const people = await db.select().from(employees).where(and(eq(employees.isActive, true), eq(employees.hasAccount, true)));
    const boardPeople = new Set(people.filter((p) => featureVisible(config, 'noticeBoard', p)).map((p) => p.id));
    const out = [];
    for (const r of rows) {
      const audience = (await audienceIdsFor(audienceOfRow(r))).filter((id) => boardPeople.has(id));
      out.push({
        ...serialize(r, false),
        notify: r.notify,
        targetDepartments: r.targetDepartments,
        targetLocations: r.targetLocations,
        targetRoles: r.targetRoles,
        targetUserIds: r.targetUserIds,
        createdBy: r.createdById ? (names.get(r.createdById) ?? '') : '',
        createdAt: r.createdAt.toISOString(),
        stats: { seen: seen.get(r.id) ?? 0, audience: audience.length },
      });
    }
    res.json(out);
  }),
);

const jalaliDay = z.string().refine(isValidJalaliDate, 'روز را درست انتخاب کنید.');
const ids = z.array(z.string().min(1).max(200)).max(500);
const noticeSchema = z.object({
  text: z.string().trim().min(1, 'متن اطلاعیه را بنویسید.').max(NOTICE_TEXT_MAX, `متن اطلاعیه حداکثر ${NOTICE_TEXT_MAX} حرف است.`),
  sender: z.string().trim().max(NOTICE_SENDER_MAX).default(''),
  important: z.boolean().default(false),
  notify: z.boolean().default(false),
  firstDay: jalaliDay,
  lastDay: jalaliDay,
  targetDepartments: ids.default([]),
  targetLocations: ids.default([]),
  targetRoles: ids.default([]),
  targetUserIds: ids.default([]),
});

async function noticeValues(body: z.infer<typeof noticeSchema>, now: Date) {
  const window = noticeWindow(body.firstDay, body.lastDay, now);
  if ('error' in window) throw new HttpError(400, window.error);
  const audience = await checkAudience(body);
  return {
    text: body.text,
    sender: body.sender,
    important: body.important,
    notify: body.notify,
    startsAt: window.startsAt < now ? now : window.startsAt,
    endsAt: window.endsAt,
    targetDepartments: audience.departments,
    targetLocations: audience.locations,
    targetRoles: audience.roles,
    targetUserIds: audience.userIds,
  };
}

/**
 * Notices whose time has come: open pages are told once (so a scheduled one shows on time), and the
 * notification goes to the audience once, if the publisher asked for it. Run every minute and after
 * every change.
 */
export async function startDueNotices(now = new Date()) {
  const due = await db
    .select()
    .from(notices)
    .where(
      and(
        lte(notices.startsAt, now),
        gt(notices.endsAt, now),
        or(isNull(notices.startedAt), and(eq(notices.notify, true), isNull(notices.notifiedAt))),
      ),
    );
  let started = 0;
  for (const n of due) {
    if (!n.startedAt) {
      const claimed = await db
        .update(notices)
        .set({ startedAt: now })
        .where(and(eq(notices.id, n.id), isNull(notices.startedAt)))
        .returning({ id: notices.id });
      started += claimed.length;
    }
    if (n.notify && !n.notifiedAt) {
      const claimed = await db
        .update(notices)
        .set({ notifiedAt: now })
        .where(and(eq(notices.id, n.id), isNull(notices.notifiedAt)))
        .returning({ id: notices.id });
      if (claimed.length === 0) continue;
      const config = await featureConfig();
      const recipients = await audienceIdsFor(audienceOfRow(n), n.createdById ?? undefined);
      const people = recipients.length > 0 ? await db.select().from(employees).where(inArray(employees.id, recipients)) : [];
      await createNotifications(
        people.filter((p) => featureVisible(config, 'noticeBoard', p)).map((p) => p.id),
        { title: n.sender ? `اطلاعیهٔ ${n.sender} 📌` : 'اطلاعیهٔ جدید روی داشبورد 📌', message: noticeTitle(n.text), type: 'notice', linkTab: 'dashboard' },
      );
    }
  }
  if (started > 0) broadcastChange('notices');
  return started;
}

/** Ended notices are removed after a while (by the nightly clean-up). */
export async function pruneNotices(now = new Date()) {
  await db.delete(notices).where(lt(notices.endsAt, new Date(now.getTime() - NOTICE_KEEP_DAYS * DAY_MS)));
}

const windowNote = (n: Pick<NoticeRow, 'startsAt' | 'endsAt'>) => `از ${dayText(n.startsAt)} تا ${dayText(n.endsAt)}`;

noticesRouter.post(
  '/notices',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const now = new Date();
    const values = await noticeValues(parse(noticeSchema, req.body), now);
    const [created] = await db
      .insert(notices)
      .values({ id: newId('notice'), ...values, createdById: viewer.id, createdAt: now, updatedAt: now })
      .returning();
    await audit(viewer, { action: 'create', entity: 'notice', id: created.id, title: noticeTitle(created.text), detail: windowNote(created) });
    broadcastChange('notices');
    await startDueNotices(now);
    res.status(201).json(serialize(created, false));
  }),
);

async function findNotice(id: string) {
  const [row] = await db.select().from(notices).where(eq(notices.id, id));
  if (!row) throw new HttpError(404, 'اطلاعیه پیدا نشد.');
  return row;
}

noticesRouter.put(
  '/notices/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const before = await findNotice(req.params.id);
    const now = new Date();
    const body = parse(noticeSchema, req.body);
    const values = await noticeValues(body, now);
    // A notice already on the board keeps its start; moving it to a later day takes it off until then.
    const startsAt = before.startsAt <= now && values.startsAt <= now ? before.startsAt : values.startsAt;
    const [updated] = await db
      .update(notices)
      .set({ ...values, startsAt, startedAt: startsAt > now ? null : before.startedAt, updatedAt: now })
      .where(eq(notices.id, before.id))
      .returning();
    // A changed text is a new message: it opens again for those who had folded it away.
    if (before.text !== updated.text) await db.delete(noticeDismissals).where(eq(noticeDismissals.noticeId, before.id));
    await audit(viewer, { action: 'update', entity: 'notice', id: updated.id, title: noticeTitle(updated.text), detail: windowNote(updated) });
    broadcastChange('notices');
    await startDueNotices(now);
    res.json(serialize(updated, false));
  }),
);

noticesRouter.delete(
  '/notices/:id',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const before = await findNotice(req.params.id);
    await db.delete(notices).where(eq(notices.id, before.id));
    await audit(viewer, { action: 'delete', entity: 'notice', id: before.id, title: noticeTitle(before.text), detail: windowNote(before) });
    broadcastChange('notices');
    res.status(204).end();
  }),
);

/** A live notice this person may see, or 404. */
async function visibleNotice(viewer: SessionUser, id: string) {
  const now = new Date();
  const [row] = await db
    .select({ id: notices.id })
    .from(notices)
    .where(and(eq(notices.id, id), lte(notices.startsAt, now), gt(notices.endsAt, now), audienceIncludes(audienceColumns, viewer)));
  if (!row) throw new HttpError(404, 'اطلاعیه پیدا نشد یا دیگر روی تابلو نیست.');
  return row;
}

/** «دیدم»: the notice folds away on this person's dashboard (and comes back with «نمایش دوباره»). */
noticesRouter.post(
  '/notices/:id/seen',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const row = await visibleNotice(viewer, req.params.id);
    await db.insert(noticeDismissals).values({ noticeId: row.id, employeeId: viewer.id }).onConflictDoNothing();
    res.status(204).end();
  }),
);

noticesRouter.delete(
  '/notices/:id/seen',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const row = await visibleNotice(viewer, req.params.id);
    await db.delete(noticeDismissals).where(and(eq(noticeDismissals.noticeId, row.id), eq(noticeDismissals.employeeId, viewer.id)));
    res.status(204).end();
  }),
);
