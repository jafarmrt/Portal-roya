import { randomInt } from 'node:crypto';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { toPersianDigits } from '../../shared/jalali.js';
import { DEFAULT_SCREEN, WHEEL_PRIZE_MAX, WHEEL_REEL, WISHES_PER_PERSON, WISH_MAX } from '../../shared/specialEvents.js';
import type { SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import {
  eventCompetitions,
  eventEntries,
  eventEntryMembers,
  eventFals,
  eventGuesses,
  eventIdeas,
  eventKidGuesses,
  eventKidPhotos,
  eventMatches,
  eventNominations,
  eventAwards,
  eventPredictions,
  eventQuizAnswers,
  eventQuizQuestions,
  eventSongs,
  eventSongVotes,
  eventWheelSpins,
  eventWishes,
} from '../db/schema.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { type EventRow, type Viewer, announceChange, eventOf, eventView, logAction, phaseOf, requireReferee, rolesOf, saveScreen } from './specialEvents.js';

// «آرزوهای یلدا»: colleagues write a short wish for the new year; once an organizer approves it, it goes
// on the wall of the page and the big screen (with the name, or without it when sent anonymously).
// «گردونهٔ شانس»: on the night the wheel picks a name from everyone who took part in something on the
// page (a team, a prediction, a fal, a quiz answer, a wish, a childhood photo…). The organizers who spin it are not in it.

export const eventWishesRouter = Router();

const freshView = async (eventId: string, viewer: SessionUser) => eventView(await eventOf(eventId), viewer);

/** Wishes are written until the page goes away after the program. */
const wishesOpen = (ev: EventRow) => phaseOf(ev) !== 'ended';

// ─── Who is in the wheel ─────────────────────────────────────────────────────

/** Everyone who took part in something on the event's page, without its organizers. */
export async function wheelPool(ev: EventRow) {
  const competitionIds = (await db.select({ id: eventCompetitions.id }).from(eventCompetitions).where(eq(eventCompetitions.eventId, ev.id))).map((c) => c.id);
  const awardIds = (await db.select({ id: eventAwards.id }).from(eventAwards).where(eq(eventAwards.eventId, ev.id))).map((a) => a.id);
  const questionIds = (await db.select({ id: eventQuizQuestions.id }).from(eventQuizQuestions).where(eq(eventQuizQuestions.eventId, ev.id))).map((q) => q.id);
  const songIds = (await db.select({ id: eventSongs.id }).from(eventSongs).where(eq(eventSongs.eventId, ev.id))).map((s) => s.id);
  const none = Promise.resolve([] as { id: string }[]);
  const lists = await Promise.all([
    competitionIds.length
      ? db
          .select({ id: eventEntryMembers.employeeId })
          .from(eventEntryMembers)
          .innerJoin(eventEntries, eq(eventEntries.id, eventEntryMembers.entryId))
          .where(and(inArray(eventEntryMembers.competitionId, competitionIds), eq(eventEntries.status, 'in')))
      : none,
    competitionIds.length
      ? db
          .select({ id: eventPredictions.employeeId })
          .from(eventPredictions)
          .innerJoin(eventMatches, eq(eventMatches.id, eventPredictions.matchId))
          .where(inArray(eventMatches.competitionId, competitionIds))
      : none,
    db.select({ id: eventGuesses.employeeId }).from(eventGuesses).where(eq(eventGuesses.eventId, ev.id)),
    db.select({ id: eventFals.employeeId }).from(eventFals).where(eq(eventFals.eventId, ev.id)),
    questionIds.length ? db.select({ id: eventQuizAnswers.employeeId }).from(eventQuizAnswers).where(inArray(eventQuizAnswers.questionId, questionIds)) : none,
    db.select({ id: eventWishes.byId }).from(eventWishes).where(and(eq(eventWishes.eventId, ev.id), inArray(eventWishes.status, ['pending', 'approved']))),
    db.select({ id: eventSongs.byId }).from(eventSongs).where(eq(eventSongs.eventId, ev.id)),
    songIds.length ? db.select({ id: eventSongVotes.employeeId }).from(eventSongVotes).where(inArray(eventSongVotes.songId, songIds)) : none,
    db.select({ id: eventIdeas.byId }).from(eventIdeas).where(eq(eventIdeas.eventId, ev.id)),
    awardIds.length ? db.select({ id: eventNominations.nominatorId }).from(eventNominations).where(inArray(eventNominations.awardId, awardIds)) : none,
    db.select({ id: eventKidPhotos.employeeId }).from(eventKidPhotos).where(eq(eventKidPhotos.eventId, ev.id)),
    db
      .select({ id: eventKidGuesses.employeeId })
      .from(eventKidGuesses)
      .innerJoin(eventKidPhotos, eq(eventKidPhotos.id, eventKidGuesses.photoId))
      .where(eq(eventKidPhotos.eventId, ev.id)),
  ]);
  const out = new Set(ev.organizerIds);
  return [...new Set(lists.flat().map((r) => r.id))].filter((id) => !out.has(id)).sort();
}

// ─── What the page shows ─────────────────────────────────────────────────────

export async function wishesView(ev: EventRow, viewer: Viewer) {
  const roles = rolesOf(ev, viewer);
  const [wishes, spins, pool] = await Promise.all([
    db.select().from(eventWishes).where(eq(eventWishes.eventId, ev.id)).orderBy(asc(eventWishes.createdAt)),
    db.select().from(eventWheelSpins).where(eq(eventWheelSpins.eventId, ev.id)).orderBy(asc(eventWheelSpins.createdAt)),
    wheelPool(ev),
  ]);
  const spun = new Set(spins.map((s) => s.winnerId));
  const left = pool.filter((id) => !spun.has(id));
  const wall = wishes
    .filter((w) => w.status === 'approved')
    .map((w) => ({ id: w.id, text: w.text, byId: w.anonymous ? null : w.byId, at: (w.decidedAt ?? w.createdAt).toISOString() }));
  const mine = viewer
    ? wishes.filter((w) => w.byId === viewer.id).map((w) => ({ id: w.id, text: w.text, anonymous: w.anonymous, status: w.status }))
    : [];
  // The organizers read who wrote each wish waiting for them (an anonymous one stays anonymous on the wall).
  const waiting = roles.isOrganizer
    ? wishes.filter((w) => w.status !== 'approved').map((w) => ({ id: w.id, text: w.text, byId: w.byId, anonymous: w.anonymous, status: w.status }))
    : [];
  const spinList = spins.map((s) => ({ id: s.id, winnerId: s.winnerId, prize: s.prize, absent: s.absent, reel: s.reel, at: s.createdAt.toISOString() }));
  return {
    wishes: {
      wall,
      mine,
      waiting,
      open: wishesOpen(ev),
      canWrite: Boolean(viewer && (ev.status === 'active' || roles.referee) && wishesOpen(ev)),
    },
    wheel: {
      spins: spinList,
      // How many names are still in it (those already picked are out for the night).
      left: left.length,
      inIt: Boolean(viewer && pool.includes(viewer.id)),
      organizer: Boolean(viewer && ev.organizerIds.includes(viewer.id)),
      live: phaseOf(ev) === 'live',
    },
    peopleIds: [...wall.map((w) => w.byId), ...waiting.map((w) => w.byId), ...spins.flatMap((s) => [s.winnerId, ...s.reel])].filter((id): id is string => Boolean(id)),
  };
}

// ─── «آرزوهای یلدا» ──────────────────────────────────────────────────────────

eventWishesRouter.post(
  '/special_events/:id/wishes',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    const roles = rolesOf(ev, viewer);
    if (ev.status !== 'active' && !roles.referee) throw new HttpError(400, 'رویداد هنوز شروع نشده است.');
    if (!wishesOpen(ev)) throw new HttpError(400, 'وقت نوشتن آرزو برای امسال تمام شده است.');
    const input = parse(z.object({ text: z.string().trim().min(2, 'آرزویتان را بنویسید.').max(WISH_MAX), anonymous: z.boolean().optional() }), req.body);
    const [{ mine }] = await db.select({ mine: count() }).from(eventWishes).where(and(eq(eventWishes.eventId, ev.id), eq(eventWishes.byId, viewer.id)));
    if (mine >= WISHES_PER_PERSON) throw new HttpError(400, `هر نفر تا ${toPersianDigits(WISHES_PER_PERSON)} آرزو می‌نویسد.`);
    // An organizer's own wish needs nobody else's yes.
    const approved = roles.isOrganizer;
    await db.insert(eventWishes).values({
      id: newId('wish'),
      eventId: ev.id,
      byId: viewer.id,
      text: input.text,
      anonymous: input.anonymous ?? false,
      status: approved ? 'approved' : 'pending',
      decidedById: approved ? viewer.id : null,
      decidedAt: approved ? new Date() : null,
    });
    announceChange(ev);
    res.status(201).json(await freshView(ev.id, viewer));
  }),
);

async function wishOf(id: string) {
  const [wish] = await db.select().from(eventWishes).where(eq(eventWishes.id, id));
  if (!wish) throw new HttpError(404, 'این آرزو پیدا نشد.');
  return wish;
}

/** An organizer puts a wish on the wall, or keeps it off. */
eventWishesRouter.patch(
  '/event_wishes/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const wish = await wishOf(req.params.id);
    const ev = await eventOf(wish.eventId);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'آرزوها را برگزارکنندگان تأیید می‌کنند.');
    const { status } = parse(z.object({ status: z.enum(['approved', 'hidden']) }), req.body);
    if (status !== wish.status) {
      await db.update(eventWishes).set({ status, decidedById: viewer.id, decidedAt: new Date() }).where(eq(eventWishes.id, wish.id));
      if (status === 'hidden') await logAction(ev, viewer.id, 'آرزو روی دیوار نرفت', wish.text.slice(0, 80));
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The one who wrote it takes it back (or an organizer removes it). */
eventWishesRouter.delete(
  '/event_wishes/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const wish = await wishOf(req.params.id);
    const ev = await eventOf(wish.eventId);
    if (wish.byId !== viewer.id && !rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'فقط نویسندهٔ آرزو آن را برمی‌دارد.');
    await db.delete(eventWishes).where(eq(eventWishes.id, wish.id));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── «گردونهٔ شانس» ──────────────────────────────────────────────────────────

/** A random name from those still in the wheel; the big screen runs a reel of names and stops on it. */
eventWishesRouter.post(
  '/special_events/:id/wheel/spin',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    if (phaseOf(ev) !== 'live') throw new HttpError(400, 'گردونه بعد از شروع برنامه می‌چرخد.');
    const { prize } = parse(z.object({ prize: z.string().trim().max(WHEEL_PRIZE_MAX).optional() }), req.body ?? {});
    const spun = new Set((await db.select({ id: eventWheelSpins.winnerId }).from(eventWheelSpins).where(eq(eventWheelSpins.eventId, ev.id))).map((s) => s.id));
    const left = (await wheelPool(ev)).filter((id) => !spun.has(id));
    if (left.length === 0) throw new HttpError(400, 'کسی در گردونه نمانده است.');
    const winnerId = left[randomInt(left.length)];
    // The names that run past first: the others still in it, shuffled (repeated when they are few).
    const others = left.filter((id) => id !== winnerId);
    const reel: string[] = [];
    for (let i = 0; i < WHEEL_REEL - 1 && others.length > 0; i++) reel.push(others[randomInt(others.length)]);
    reel.push(winnerId);
    await db.insert(eventWheelSpins).values({ id: newId('spin'), eventId: ev.id, winnerId, prize: prize ?? '', reel, byId: viewer.id });
    const screen = ev.screen ?? DEFAULT_SCREEN;
    await saveScreen(ev, { ...screen, scene: 'wheel', version: screen.version + 1 });
    await logAction(ev, viewer.id, 'گردونه چرخید', prize ?? '');
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The name came up but its owner is not in the hall: marked, and they stay out of the next turns. */
eventWishesRouter.patch(
  '/event_wheel/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [spin] = await db.select().from(eventWheelSpins).where(eq(eventWheelSpins.id, req.params.id));
    if (!spin) throw new HttpError(404, 'این دور گردونه پیدا نشد.');
    const ev = await eventOf(spin.eventId);
    requireReferee(ev, viewer);
    const { absent } = parse(z.object({ absent: z.boolean() }), req.body);
    await db.update(eventWheelSpins).set({ absent }).where(eq(eventWheelSpins.id, spin.id));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** From the start (after the rehearsal): every name is back in. */
eventWishesRouter.post(
  '/special_events/:id/wheel/reset',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    await db.delete(eventWheelSpins).where(eq(eventWheelSpins.eventId, ev.id));
    await logAction(ev, viewer.id, 'گردونه از اول شد', '');
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);
