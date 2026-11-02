import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { toJalali, toPersianDigits } from '../../shared/jalali.js';
import {
  AWARD_NOTE_MAX,
  AWARD_TITLE_MAX,
  AWARDS_MAX,
  EVENT_TEXT_MAX,
  NOMINATION_REASON_MAX,
  SHORTLIST_SIZE,
  type AwardStage,
  awardTimes,
  countAwards,
} from '../../shared/specialEvents.js';
import type { SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { employees, eventAwardOptOuts, eventAwards, eventAwardVotes, eventNominations, eventNominees, specialEvents } from '../db/schema.js';
import { signalUser } from '../events.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import {
  type EventRow,
  type Viewer,
  announceChange,
  claimReminder,
  eventOf,
  eventView,
  logAction,
  phaseOf,
  requireOrganizer,
  rolesOf,
} from './specialEvents.js';

// «انتخاب‌های یلدا»: categories colleagues nominate each other for, and the jury chooses in secret.
// Care for colleagues: who nominated is never shown, nor how many nominations anyone had; anyone may ask
// to be left out; a shortlisted colleague may step down; a nomination's line is for the jury only, and
// the jury hides one that is not kind; and each colleague wins at most one title.

export const eventAwardsRouter = Router();

type AwardRow = typeof eventAwards.$inferSelect;
type NomineeRow = typeof eventNominees.$inferSelect;

// A literal (not built from NOTIFY at load time: specialEvents.ts imports this file too).
const AWARD_NOTIFY = { type: 'event' as const, linkTab: 'event', linkId: 'awards' };

/** Who votes: the jury, or the organizers of an event without one. Who settles a tie: the head, or any of them. */
function voters(ev: EventRow) {
  return ev.juryIds.length > 0 ? ev.juryIds : ev.organizerIds;
}
function settlesTies(ev: EventRow, viewerId: string) {
  return ev.juryIds.length > 0 ? ev.juryHeadId === viewerId : ev.organizerIds.includes(viewerId);
}

const onList = (n: NomineeRow) => !n.withdrawn && !n.removedById;

/** Every change answers with the whole page as the viewer now sees it. */
const freshView = async (eventId: string, viewer: SessionUser) => eventView(await eventOf(eventId), viewer);

/** Where the nominations of the event stand now. */
export function awardStage(ev: EventRow, award: Pick<AwardRow, 'decidedAt' | 'revealedAt' | 'tieIds' | 'winnerId'>): AwardStage {
  if (award.revealedAt) return 'revealed';
  if (award.decidedAt) return 'decided';
  if (ev.awardsClosedAt) return 'counting';
  if (ev.awardsPublishedAt) return 'voting';
  if (ev.awardsShortlistedAt) return 'shortlisting';
  return 'nominating';
}

async function awardsOf(eventId: string) {
  return db.select().from(eventAwards).where(eq(eventAwards.eventId, eventId)).orderBy(asc(eventAwards.sortOrder), asc(eventAwards.createdAt));
}

async function awardOf(id: string) {
  const [award] = await db.select().from(eventAwards).where(eq(eventAwards.id, id));
  if (!award) throw new HttpError(404, 'این بخش پیدا نشد.');
  return { award, ev: await eventOf(award.eventId) };
}

async function optedOut(eventId: string) {
  const rows = await db.select({ id: eventAwardOptOuts.employeeId }).from(eventAwardOptOuts).where(eq(eventAwardOptOuts.eventId, eventId));
  return new Set(rows.map((r) => r.id));
}

/** Colleagues who can be nominated: active, with a portal account (so they can step down), not on the jury. */
async function eligible(ev: EventRow, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(inArray(employees.id, ids), eq(employees.isActive, true), eq(employees.hasAccount, true)));
  const out = await optedOut(ev.id);
  return new Set(rows.map((r) => r.id).filter((id) => !ev.juryIds.includes(id) && !out.has(id)));
}

// ─── What the page shows ─────────────────────────────────────────────────────

/**
 * The categories as this viewer may see them. Everyone: their own nomination, and the shortlist once it
 * is public. Organizers and jurors: the shortlist as soon as it is made. Jurors: the nominations' lines
 * (without names) and their own vote. The head of the jury: a tie to settle. A winner only once opened.
 */
export async function awardsView(ev: EventRow, viewer: Viewer) {
  const awards = await awardsOf(ev.id);
  const roles = rolesOf(ev, viewer);
  const times = awardTimes(ev);
  const out = await optedOut(ev.id);
  const ids = awards.map((a) => a.id);
  const [nominees, mine, reasons, votes] = ids.length
    ? await Promise.all([
        db.select().from(eventNominees).where(inArray(eventNominees.awardId, ids)).orderBy(asc(eventNominees.rank), asc(eventNominees.createdAt)),
        viewer ? db.select().from(eventNominations).where(and(inArray(eventNominations.awardId, ids), eq(eventNominations.nominatorId, viewer.id))) : [],
        roles.isJuror || (ev.juryIds.length === 0 && roles.isOrganizer)
          ? db.select().from(eventNominations).where(inArray(eventNominations.awardId, ids)).orderBy(asc(eventNominations.createdAt))
          : [],
        db.select().from(eventAwardVotes).where(inArray(eventAwardVotes.awardId, ids)),
      ])
    : [[], [], [], []];
  const seesShortlist = Boolean(ev.awardsPublishedAt) || (Boolean(ev.awardsShortlistedAt) && roles.referee);
  const voterIds = voters(ev);
  const people = new Set<string>();

  const list = awards.map((a) => {
    const own = mine.find((n) => n.awardId === a.id);
    if (own) people.add(own.nomineeId);
    const shortlist = seesShortlist ? nominees.filter((n) => n.awardId === a.id && (roles.referee || onList(n))) : [];
    for (const n of shortlist) people.add(n.employeeId);
    const tie = viewer && settlesTies(ev, viewer.id) ? a.tieIds : [];
    for (const id of tie) people.add(id);
    const winner = a.revealedAt ? a.winnerId : null;
    if (winner) people.add(winner);
    const awardVotes = votes.filter((v) => v.awardId === a.id && voterIds.includes(v.jurorId));
    return {
      id: a.id,
      title: a.title,
      icon: a.icon,
      description: a.description,
      sortOrder: a.sortOrder,
      stage: awardStage(ev, a),
      myNomination: own ? { nomineeId: own.nomineeId, reason: own.reason } : null,
      nominees: shortlist.map((n) => ({
        id: n.employeeId,
        // The jury's own additions and removals are for organizers and jurors only.
        ...(roles.referee
          ? { source: n.source, note: n.note, withdrawn: n.withdrawn, removed: Boolean(n.removedById), removedReason: n.removedReason }
          : {}),
        // The lines nominators wrote, without their names, for those who vote.
        reasons: reasons
          .filter((r) => r.awardId === a.id && r.nomineeId === n.employeeId && r.reason)
          .map((r) => ({ id: r.id, text: r.hidden ? '' : r.reason, hidden: r.hidden })),
      })),
      myVote: viewer ? (awardVotes.find((v) => v.jurorId === viewer.id)?.nomineeId ?? null) : null,
      // How many of those who vote have voted (not for whom), for organizers and jurors.
      votedCount: roles.referee ? awardVotes.length : null,
      tie,
      decided: roles.referee ? Boolean(a.decidedAt) : a.revealedAt !== null,
      noWinner: Boolean(a.decidedAt && !a.winnerId && a.tieIds.length === 0) && (roles.referee || Boolean(a.revealedAt)),
      winnerId: winner,
    };
  });

  return {
    awards: list,
    awardsInfo: {
      shortlistAt: times.shortlistAt.toISOString(),
      publishAt: times.publishAt.toISOString(),
      voteDeadline: times.voteDeadline.toISOString(),
      shortlistedAt: ev.awardsShortlistedAt?.toISOString() ?? null,
      publishedAt: ev.awardsPublishedAt?.toISOString() ?? null,
      closedAt: ev.awardsClosedAt?.toISOString() ?? null,
      optedOut: Boolean(viewer && out.has(viewer.id)),
      voters: voterIds.length,
      // Shortlisted colleagues may step down until the list is public.
      canStepDown: Boolean(viewer && ev.awardsShortlistedAt && !ev.awardsPublishedAt),
      votes: Boolean(viewer && voterIds.includes(viewer.id)),
      // The categories whose shortlist the viewer is on (told the morning it is made, before it is public).
      onShortlist: viewer ? nominees.filter((n) => n.employeeId === viewer.id && onList(n) && ev.awardsShortlistedAt).map((n) => n.awardId) : [],
    },
    peopleIds: [...people],
  };
}

// ─── Categories (organizers) ─────────────────────────────────────────────────

const awardSchema = z.object({
  title: z.string().trim().min(1, 'نام بخش را بنویسید.').max(AWARD_TITLE_MAX),
  icon: z.string().trim().min(1).max(8).optional(),
  description: z.string().trim().max(EVENT_TEXT_MAX).optional(),
});

eventAwardsRouter.post(
  '/special_events/:id/awards',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireOrganizer(ev, viewer);
    if (ev.awardsShortlistedAt) throw new HttpError(400, 'فهرست نامزدها ساخته شده و بخش تازه اضافه نمی‌شود.');
    const input = parse(awardSchema, req.body);
    const existing = await awardsOf(ev.id);
    if (existing.length >= AWARDS_MAX) throw new HttpError(400, `حداکثر ${toPersianDigits(AWARDS_MAX)} بخش می‌شود ساخت.`);
    await db.insert(eventAwards).values({
      id: newId('award'),
      eventId: ev.id,
      title: input.title,
      icon: input.icon ?? '🏅',
      description: input.description ?? '',
      sortOrder: existing.length,
    });
    await logAction(ev, viewer.id, 'بخش انتخاب‌ها ساخته شد', input.title);
    announceChange(ev);
    res.status(201).json(await freshView(ev.id, viewer));
  }),
);

eventAwardsRouter.put(
  '/event_awards/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireOrganizer(ev, viewer);
    const input = parse(awardSchema.extend({ sortOrder: z.number().int().min(0).max(100).optional() }), req.body);
    await db
      .update(eventAwards)
      .set({ title: input.title, icon: input.icon ?? award.icon, description: input.description ?? award.description, sortOrder: input.sortOrder ?? award.sortOrder })
      .where(eq(eventAwards.id, award.id));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventAwardsRouter.delete(
  '/event_awards/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireOrganizer(ev, viewer);
    if (ev.awardsClosedAt) throw new HttpError(400, 'رأی‌گیری بسته شده و بخش حذف نمی‌شود.');
    await db.delete(eventAwards).where(eq(eventAwards.id, award.id));
    await logAction(ev, viewer.id, 'بخش انتخاب‌ها حذف شد', award.title);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── Nominating (everyone, during signup) ────────────────────────────────────

function requireNominating(ev: EventRow, viewer: SessionUser) {
  const roles = rolesOf(ev, viewer);
  if (roles.isJuror) throw new HttpError(403, 'داوران نامزد معرفی نمی‌کنند؛ انتخاب برنده با شماست.');
  if (ev.awardsShortlistedAt) throw new HttpError(400, 'مهلت معرفی نامزد تمام شده است.');
  if (roles.isOrganizer) return;
  if (ev.status !== 'active') throw new HttpError(400, 'معرفی نامزد هنوز شروع نشده است.');
  if (phaseOf(ev) !== 'signup') throw new HttpError(400, 'مهلت معرفی نامزد تمام شده است.');
}

eventAwardsRouter.put(
  '/event_awards/:id/nomination',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireNominating(ev, viewer);
    const input = parse(z.object({ nomineeId: z.string().min(1).max(100), reason: z.string().trim().max(NOMINATION_REASON_MAX).optional() }), req.body);
    if (input.nomineeId === viewer.id) throw new HttpError(400, 'خودتان را نمی‌توانید معرفی کنید 🙂');
    if (ev.juryIds.includes(input.nomineeId)) throw new HttpError(400, 'داوران در بخش‌های نامزدی نیستند.');
    if ((await optedOut(ev.id)).has(input.nomineeId)) throw new HttpError(400, 'این همکار خواسته در بخش‌های نامزدی نباشد.');
    if (!(await eligible(ev, [input.nomineeId])).has(input.nomineeId)) throw new HttpError(400, 'فقط همکاران فعال با حساب پرتال را می‌شود معرفی کرد.');
    await db
      .insert(eventNominations)
      .values({ id: newId('nomination'), awardId: award.id, nominatorId: viewer.id, nomineeId: input.nomineeId, reason: input.reason ?? '' })
      .onConflictDoUpdate({
        target: [eventNominations.awardId, eventNominations.nominatorId],
        set: { nomineeId: input.nomineeId, reason: input.reason ?? '', hidden: false, createdAt: new Date() },
      });
    signalUser(viewer.id, 'special_event');
    res.json(await freshView(ev.id, viewer));
  }),
);

eventAwardsRouter.delete(
  '/event_awards/:id/nomination',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireNominating(ev, viewer);
    await db.delete(eventNominations).where(and(eq(eventNominations.awardId, award.id), eq(eventNominations.nominatorId, viewer.id)));
    signalUser(viewer.id, 'special_event');
    res.json(await freshView(ev.id, viewer));
  }),
);

/** «مرا در بخش‌های نامزدی قرار ندهید»: also takes the colleague off any shortlist not yet decided. */
eventAwardsRouter.put(
  '/special_events/:id/awards/opt_out',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    const { out } = parse(z.object({ out: z.boolean() }), req.body);
    if (!out) {
      if (ev.awardsClosedAt) throw new HttpError(400, 'رأی‌گیری بسته شده است.');
      await db.delete(eventAwardOptOuts).where(and(eq(eventAwardOptOuts.eventId, ev.id), eq(eventAwardOptOuts.employeeId, viewer.id)));
      signalUser(viewer.id, 'special_event');
      res.json(await freshView(ev.id, viewer));
      return;
    }
    await db.insert(eventAwardOptOuts).values({ eventId: ev.id, employeeId: viewer.id }).onConflictDoNothing();
    if (!ev.awardsClosedAt) await stepDown(ev, viewer.id);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** A shortlisted colleague steps down (before the list is public); the next most nominated takes the place. */
eventAwardsRouter.post(
  '/special_events/:id/awards/step_down',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!ev.awardsShortlistedAt || ev.awardsPublishedAt) throw new HttpError(400, 'مهلت انصراف از نامزدی تمام شده است؛ اگر لازم است به برگزارکننده بگویید.');
    const { awardId } = parse(z.object({ awardId: z.string().optional() }), req.body);
    await stepDown(ev, viewer.id, awardId);
    res.json(await freshView(ev.id, viewer));
  }),
);

async function stepDown(ev: EventRow, employeeId: string, awardId?: string) {
  const awards = await awardsOf(ev.id);
  const targets = awards.filter((a) => !a.decidedAt && (!awardId || a.id === awardId)).map((a) => a.id);
  if (targets.length === 0) return;
  const rows = await db
    .update(eventNominees)
    .set({ withdrawn: true })
    .where(and(inArray(eventNominees.awardId, targets), eq(eventNominees.employeeId, employeeId), eq(eventNominees.withdrawn, false)))
    .returning();
  if (rows.length === 0) return;
  await db.delete(eventAwardVotes).where(and(inArray(eventAwardVotes.awardId, targets), eq(eventAwardVotes.nomineeId, employeeId)));
  await logAction(ev, null, 'انصراف از نامزدی', awards.filter((a) => rows.some((r) => r.awardId === a.id)).map((a) => a.title).join('، '));
  // Before the list is public the next most nominated colleague comes in.
  if (!ev.awardsPublishedAt) for (const row of rows) await fillShortlist(ev, awards.find((a) => a.id === row.awardId)!);
  announceChange(ev);
}

// ─── The shortlist ───────────────────────────────────────────────────────────

/** Brings a category's shortlist up to its size from the most nominated colleagues not on it yet. */
async function fillShortlist(ev: EventRow, award: AwardRow) {
  const existing = await db.select().from(eventNominees).where(eq(eventNominees.awardId, award.id));
  let free = SHORTLIST_SIZE - existing.filter(onList).length;
  if (free <= 0) return [];
  const nominations = await db.select().from(eventNominations).where(eq(eventNominations.awardId, award.id)).orderBy(asc(eventNominations.createdAt));
  const counts = new Map<string, { count: number; first: number }>();
  for (const n of nominations) {
    const c = counts.get(n.nomineeId) ?? { count: 0, first: n.createdAt.getTime() };
    c.count++;
    counts.set(n.nomineeId, c);
  }
  const ok = await eligible(ev, [...counts.keys()]);
  const taken = new Set(existing.map((e) => e.employeeId));
  // The most nominated first; between equals, the one nominated first.
  const order = [...counts.entries()].filter(([id]) => ok.has(id) && !taken.has(id)).sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first);
  const added: string[] = [];
  let rank = existing.length;
  for (const [id] of order) {
    if (free <= 0) break;
    await db.insert(eventNominees).values({ awardId: award.id, employeeId: id, source: 'auto', rank: rank++ }).onConflictDoNothing();
    added.push(id);
    free--;
  }
  if (added.length > 0 && ev.status === 'active') {
    await createNotifications(added, {
      ...AWARD_NOTIFY,
      title: `شما در بخش «${award.title}» نامزد شدید ${award.icon}`,
      message: `همکاران شما را برای «${award.title}» در «${ev.title}» معرفی کرده‌اند و برنده را هیئت داوران انتخاب می‌کند. اگر نمی‌خواهید، تا پایان امروز در صفحهٔ رویداد «انصراف از نامزدی» را بزنید.`,
    });
  }
  return added;
}

async function makeShortlists(ev: EventRow, by: string | null) {
  // Claimed once: the minute job and an organizer's tap at the same moment make one list.
  const [fresh] = await db
    .update(specialEvents)
    .set({ awardsShortlistedAt: new Date() })
    .where(and(eq(specialEvents.id, ev.id), isNull(specialEvents.awardsShortlistedAt)))
    .returning();
  if (!fresh) return eventOf(ev.id);
  for (const award of await awardsOf(ev.id)) await fillShortlist(fresh, award);
  await logAction(fresh, by, 'فهرست نامزدهای انتخاب‌ها ساخته شد');
  announceChange(fresh);
  return fresh;
}

async function publishShortlists(ev: EventRow, by: string | null) {
  const [fresh] = await db
    .update(specialEvents)
    .set({ awardsPublishedAt: new Date() })
    .where(and(eq(specialEvents.id, ev.id), isNull(specialEvents.awardsPublishedAt)))
    .returning();
  if (!fresh) return eventOf(ev.id);
  await logAction(fresh, by, 'فهرست نامزدها منتشر شد');
  if (fresh.status === 'active' && (await awardsOf(ev.id)).length > 0) {
    const deadline = awardTimes(fresh).voteDeadline;
    await createNotifications(voters(fresh), {
      ...AWARD_NOTIFY,
      title: `رأی‌گیری «انتخاب‌های ${fresh.title}» باز شد`,
      message: `در صفحهٔ رویداد برای هر بخش یک نفر را انتخاب کنید. رأی‌ها محرمانه است و تا ساعت ${toPersianDigits(toJalali(deadline, 'HH:mm'))} روز ${toPersianDigits(toJalali(deadline))} قابل تغییر است.`,
    });
  }
  announceChange(fresh);
  return fresh;
}

/** Closes the votes and works out every category's winner in order (one title per colleague). */
async function closeVotes(ev: EventRow, by: string | null) {
  const [fresh] = await db
    .update(specialEvents)
    .set({ awardsClosedAt: new Date() })
    .where(and(eq(specialEvents.id, ev.id), isNull(specialEvents.awardsClosedAt)))
    .returning();
  if (!fresh) return eventOf(ev.id);
  await logAction(fresh, by, 'رأی‌گیری انتخاب‌ها بسته شد');
  await decideAwards(fresh);
  return fresh;
}

async function decideAwards(ev: EventRow) {
  const awards = await awardsOf(ev.id);
  if (awards.length === 0) return;
  const ids = awards.map((a) => a.id);
  const [nominees, votes] = await Promise.all([
    db.select().from(eventNominees).where(inArray(eventNominees.awardId, ids)).orderBy(asc(eventNominees.rank), asc(eventNominees.createdAt)),
    db.select().from(eventAwardVotes).where(inArray(eventAwardVotes.awardId, ids)),
  ]);
  const voterIds = voters(ev);
  const outcomes = countAwards(
    awards.map((a) => ({
      id: a.id,
      nominees: nominees.filter((n) => n.awardId === a.id && onList(n)).map((n) => n.employeeId),
      votes: Object.fromEntries(votes.filter((v) => v.awardId === a.id && voterIds.includes(v.jurorId)).map((v) => [v.jurorId, v.nomineeId])),
      picked: a.pickedId,
    })),
    ev.juryIds.length > 0 ? ev.juryHeadId : null,
  );
  const newTies: AwardRow[] = [];
  for (const o of outcomes) {
    const award = awards.find((a) => a.id === o.id)!;
    if (award.revealedAt) continue;
    const decided = !o.waiting && o.tie.length === 0;
    await db
      .update(eventAwards)
      .set({ winnerId: o.winner, tieIds: o.tie, decidedAt: decided ? (award.decidedAt ?? new Date()) : null })
      .where(eq(eventAwards.id, award.id));
    if (o.tie.length > 0 && award.tieIds.join() !== o.tie.join()) newTies.push(award);
  }
  if (newTies.length > 0) {
    const settlers = ev.juryIds.length > 0 && ev.juryHeadId ? [ev.juryHeadId] : ev.organizerIds;
    await createNotifications(settlers, {
      ...AWARD_NOTIFY,
      title: `تساوی در «${newTies[0].title}»`,
      message: 'رأی‌ها مساوی شد و انتخاب برنده با رئیس هیئت داوران است؛ در صفحهٔ رویداد یکی را انتخاب کنید.',
    });
  }
  if (outcomes.every((o) => !o.waiting && o.tie.length === 0) && (await claimReminder(ev, 'awards-decided'))) {
    await createNotifications(ev.organizerIds, {
      ...AWARD_NOTIFY,
      title: 'برندگان انتخاب‌ها معلوم شدند',
      message: 'نتیجه تا اعلام روی صحنه پنهان است؛ در شب برنامه از صفحهٔ رویداد یا ریموت برنده‌ها را یکی‌یکی باز کنید.',
    });
  }
  announceChange(ev);
}

const requireOrganizerOf = async (id: string, viewer: SessionUser) => {
  const ev = await eventOf(id);
  requireOrganizer(ev, viewer);
  return ev;
};

/** By hand, for the rehearsal or when the dates were changed late: make, publish, or close now. */
eventAwardsRouter.post(
  '/special_events/:id/awards/shortlist',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await requireOrganizerOf(req.params.id, viewer);
    if (ev.awardsShortlistedAt) throw new HttpError(400, 'فهرست نامزدها قبلاً ساخته شده است.');
    await makeShortlists(ev, viewer.id);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventAwardsRouter.post(
  '/special_events/:id/awards/publish',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await requireOrganizerOf(req.params.id, viewer);
    if (!ev.awardsShortlistedAt) throw new HttpError(400, 'اول فهرست نامزدها را بسازید.');
    if (ev.awardsPublishedAt) throw new HttpError(400, 'فهرست نامزدها منتشر شده است.');
    await publishShortlists(ev, viewer.id);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventAwardsRouter.post(
  '/special_events/:id/awards/close',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await requireOrganizerOf(req.params.id, viewer);
    if (!ev.awardsPublishedAt) throw new HttpError(400, 'رأی‌گیری هنوز شروع نشده است.');
    if (ev.awardsClosedAt) throw new HttpError(400, 'رأی‌گیری بسته شده است.');
    await closeVotes(ev, viewer.id);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── The jury ────────────────────────────────────────────────────────────────

function requireVoter(ev: EventRow, viewer: SessionUser) {
  if (!voters(ev).includes(viewer.id)) throw new HttpError(403, 'انتخاب برنده با هیئت داوران است.');
}

eventAwardsRouter.put(
  '/event_awards/:id/vote',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireVoter(ev, viewer);
    if (!ev.awardsPublishedAt) throw new HttpError(400, 'رأی‌گیری هنوز شروع نشده است.');
    if (ev.awardsClosedAt) throw new HttpError(400, 'رأی‌گیری بسته شده است.');
    const { nomineeId } = parse(z.object({ nomineeId: z.string().min(1) }), req.body);
    const [nominee] = await db
      .select()
      .from(eventNominees)
      .where(and(eq(eventNominees.awardId, award.id), eq(eventNominees.employeeId, nomineeId)));
    if (!nominee || !onList(nominee)) throw new HttpError(400, 'این همکار در فهرست نامزدهای این بخش نیست.');
    await db
      .insert(eventAwardVotes)
      .values({ awardId: award.id, jurorId: viewer.id, nomineeId })
      .onConflictDoUpdate({ target: [eventAwardVotes.awardId, eventAwardVotes.jurorId], set: { nomineeId, updatedAt: new Date() } });
    for (const id of new Set([...voters(ev), ...ev.organizerIds])) signalUser(id, 'special_event');
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The jury adds a colleague to a shortlist (with a reason) or takes one off (with a reason). */
eventAwardsRouter.post(
  '/event_awards/:id/nominees',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireVoter(ev, viewer);
    if (!ev.awardsShortlistedAt || ev.awardsClosedAt) throw new HttpError(400, 'الان فهرست نامزدها را نمی‌شود تغییر داد.');
    const input = parse(z.object({ employeeId: z.string().min(1), note: z.string().trim().min(3, 'دلیل را بنویسید.').max(AWARD_NOTE_MAX) }), req.body);
    if (!(await eligible(ev, [input.employeeId])).has(input.employeeId)) {
      throw new HttpError(400, 'این همکار را نمی‌شود نامزد کرد (داور است، حساب پرتال ندارد یا خواسته در نامزدی‌ها نباشد).');
    }
    await db
      .insert(eventNominees)
      .values({ awardId: award.id, employeeId: input.employeeId, source: 'jury', rank: 100, addedById: viewer.id, note: input.note })
      .onConflictDoUpdate({
        target: [eventNominees.awardId, eventNominees.employeeId],
        set: { source: 'jury', addedById: viewer.id, note: input.note, removedById: null, removedReason: '', withdrawn: false },
      });
    const [person] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
    await logAction(ev, viewer.id, 'نامزد به فهرست اضافه شد', `${award.title}: ${person ? fullName(person) : ''}؛ ${input.note}`);
    if (ev.status === 'active') {
      await createNotifications([input.employeeId], {
        ...AWARD_NOTIFY,
        title: `شما در بخش «${award.title}» نامزد شدید ${award.icon}`,
        message: `هیئت داوران شما را به فهرست نامزدهای «${award.title}» اضافه کرد. اگر نمی‌خواهید، در صفحهٔ رویداد «مرا در بخش‌های نامزدی قرار ندهید» را بزنید.`,
      });
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventAwardsRouter.post(
  '/event_awards/:id/nominees/:employeeId/remove',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    requireVoter(ev, viewer);
    if (!ev.awardsShortlistedAt || ev.awardsClosedAt) throw new HttpError(400, 'الان فهرست نامزدها را نمی‌شود تغییر داد.');
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'دلیل را بنویسید.').max(AWARD_NOTE_MAX) }), req.body);
    const employeeId = String(req.params.employeeId);
    const updated = await db
      .update(eventNominees)
      .set({ removedById: viewer.id, removedReason: reason })
      .where(and(eq(eventNominees.awardId, award.id), eq(eventNominees.employeeId, employeeId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, 'این همکار در فهرست نیست.');
    await db.delete(eventAwardVotes).where(and(eq(eventAwardVotes.awardId, award.id), eq(eventAwardVotes.nomineeId, employeeId)));
    const [person] = await db.select().from(employees).where(eq(employees.id, employeeId));
    await logAction(ev, viewer.id, 'نامزد از فهرست برداشته شد', `${award.title}: ${person ? fullName(person) : ''}؛ ${reason}`);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The jury hides a nomination's line that is not kind (or shows it again). */
eventAwardsRouter.post(
  '/event_nominations/:id/hide',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [nomination] = await db.select().from(eventNominations).where(eq(eventNominations.id, String(req.params.id)));
    if (!nomination) throw new HttpError(404, 'این معرفی پیدا نشد.');
    const { ev } = await awardOf(nomination.awardId);
    requireVoter(ev, viewer);
    const { hidden } = parse(z.object({ hidden: z.boolean() }), req.body);
    await db.update(eventNominations).set({ hidden }).where(eq(eventNominations.id, nomination.id));
    for (const id of voters(ev)) signalUser(id, 'special_event');
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The head of the jury settles a tie. */
eventAwardsRouter.post(
  '/event_awards/:id/settle',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    if (!settlesTies(ev, viewer.id)) throw new HttpError(403, 'تساوی را رئیس هیئت داوران حل می‌کند.');
    const { nomineeId } = parse(z.object({ nomineeId: z.string().min(1) }), req.body);
    if (!award.tieIds.includes(nomineeId)) throw new HttpError(400, 'فقط یکی از نامزدهای مساوی را می‌شود انتخاب کرد.');
    await db.update(eventAwards).set({ pickedId: nomineeId }).where(eq(eventAwards.id, award.id));
    await logAction(ev, viewer.id, 'تساوی با تصمیم رئیس هیئت حل شد', award.title);
    await decideAwards(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** Opens a category's winner on stage: from now on everyone sees it, and the winner is told. */
eventAwardsRouter.post(
  '/event_awards/:id/reveal',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { award, ev } = await awardOf(req.params.id);
    if (!rolesOf(ev, viewer).referee) throw new HttpError(403, 'اعلام برنده با برگزارکنندگان و داوران است.');
    if (!award.decidedAt) throw new HttpError(400, 'برندهٔ این بخش هنوز معلوم نشده است.');
    if (award.revealedAt) throw new HttpError(400, 'برندهٔ این بخش اعلام شده است.');
    await db.update(eventAwards).set({ revealedAt: new Date() }).where(eq(eventAwards.id, award.id));
    await logAction(ev, viewer.id, 'برندهٔ انتخاب‌ها اعلام شد', award.title);
    if (award.winnerId && ev.status === 'active') {
      await createNotifications([award.winnerId], {
        ...AWARD_NOTIFY,
        title: `شما «${award.title}»ِ ${ev.title} شدید ${award.icon}🎉`,
        message: 'هیئت داوران از میان نامزدهای همکاران شما را انتخاب کرد. مبارک باشد!',
      });
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── On its own (every minute, from processSpecialEvents) ────────────────────

export async function processAwards(ev: EventRow, now: Date) {
  if (ev.status !== 'active') return;
  const awards = await awardsOf(ev.id);
  if (awards.length === 0) return;
  const times = awardTimes(ev);
  let current = ev;
  if (!current.awardsShortlistedAt && now >= times.shortlistAt) current = await makeShortlists(current, null);
  if (current.awardsShortlistedAt && !current.awardsPublishedAt && now >= times.publishAt) current = await publishShortlists(current, null);
  // Three hours before the votes close, those who have not voted everywhere are reminded once.
  if (current.awardsPublishedAt && !current.awardsClosedAt && now.getTime() >= times.voteDeadline.getTime() - 3 * 3600_000 && (await claimReminder(current, 'awards-vote'))) {
    const votes = await db.select().from(eventAwardVotes).where(inArray(eventAwardVotes.awardId, awards.map((a) => a.id)));
    const late = voters(current).filter((id) => votes.filter((v) => v.jurorId === id).length < awards.length);
    await createNotifications(late, {
      ...AWARD_NOTIFY,
      title: 'رأی شما در انتخاب‌ها کامل نیست',
      message: 'چند ساعت تا بسته شدن رأی‌گیری مانده؛ در صفحهٔ رویداد برای همهٔ بخش‌ها رأی دهید.',
    });
  }
  if (current.awardsPublishedAt && !current.awardsClosedAt && now >= times.voteDeadline) await closeVotes(current, null);
}

