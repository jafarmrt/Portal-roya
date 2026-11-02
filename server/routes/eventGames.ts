import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { jalaliToDate, TIME_RE, toJalali, toPersianDigits } from '../../shared/jalali.js';
import {
  SCHEDULE_MAX,
  SCHEDULE_TITLE_MAX,
  GUESS_MAX,
  GUESS_QUESTION_MAX,
  PREDICT_DRAW,
  eventPhase,
  guessOrder,
  predictionRight,
  programStart,
  randomFal,
} from '../../shared/specialEvents.js';
import type { SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { eventAwards, eventCompetitions, eventEntryMembers, eventFals, eventGuesses, eventMatches, eventPredictions, specialEvents } from '../db/schema.js';
import { HttpError, currentUser, newId, parse, route, viewerOf } from '../http.js';
import { createNotifications } from '../notify.js';
import { guestSettings } from '../settings.js';
import { type EventRow, type Viewer, announceChange, championInfo, eventOf, eventView, logAction, phaseOf, requireReferee, rolesOf } from './specialEvents.js';

// Games for everyone, not only the players: «پیش‌بینی برنده» (who wins each match, with a table of the
// best predictors) and «چند دانه؟» (a number guessed before the program and opened on stage). Also the
// badges of last year's champions and award winners, shown next to their names in the phone book.

export const eventGamesRouter = Router();

type CompetitionRow = typeof eventCompetitions.$inferSelect;
type MatchRow = typeof eventMatches.$inferSelect;

// Literals (not built from NOTIFY at load time: specialEvents.ts imports this file too).
const GUESS_NOTIFY = { type: 'event' as const, linkTab: 'event', linkId: 'guess' };

const freshView = async (eventId: string, viewer: SessionUser) => eventView(await eventOf(eventId), viewer);

// ─── «پیش‌بینی برنده» ─────────────────────────────────────────────────────────

/** When predictions for a match close: a stage match at the program, a daytime one at its time. */
function predictionCloses(ev: EventRow, m: MatchRow) {
  if (m.onStage) return programStart(ev);
  return m.day && m.time ? jalaliToDate(m.day, m.time) : null;
}

/** Whether colleagues may still predict this match: both sides known, not started, not over. */
function predictionOpen(ev: EventRow, c: CompetitionRow, m: MatchRow, now: Date) {
  if (c.format === 'ranking' || !c.publishedAt) return false;
  if (m.bye || !m.entryA || !m.entryB || m.done || m.live) return false;
  const phase = phaseOf(ev, now);
  if (phase === 'memories' || phase === 'ended') return false;
  const closes = predictionCloses(ev, m);
  return !closes || Number.isNaN(closes.getTime()) || now.getTime() < closes.getTime();
}

/** The pick is still one of the match's sides (a side can change when an earlier result is fixed). */
const pickValid = (pick: string, m: MatchRow, c: Pick<CompetitionRow, 'format'>) =>
  pick === m.entryA || pick === m.entryB || (pick === PREDICT_DRAW && c.format === 'league');

interface GamesInput {
  competitions: CompetitionRow[];
  matches: MatchRow[];
  membersOf: Map<string, string[]>;
}

/** The predictions and the guessing game of an event as this viewer sees them. */
export async function gamesView(ev: EventRow, viewer: Viewer, { competitions, matches, membersOf }: GamesInput) {
  const now = new Date();
  const roles = rolesOf(ev, viewer);
  const byId = new Map(competitions.map((c) => [c.id, c]));
  const predictable = matches.filter((m) => {
    const c = byId.get(m.competitionId);
    return c && c.format !== 'ranking' && (c.publishedAt || roles.referee) && !m.bye && m.entryA && m.entryB;
  });
  const ids = predictable.map((m) => m.id);
  const [picks, guesses, fals] = await Promise.all([
    ids.length ? db.select().from(eventPredictions).where(inArray(eventPredictions.matchId, ids)) : Promise.resolve([]),
    db.select().from(eventGuesses).where(eq(eventGuesses.eventId, ev.id)).orderBy(asc(eventGuesses.updatedAt)),
    db.select({ employeeId: eventFals.employeeId, verse: eventFals.verse }).from(eventFals).where(eq(eventFals.eventId, ev.id)),
  ]);
  const takingPart = Boolean(viewer && (ev.status === 'active' || roles.referee) && !roles.isJuror);

  const perMatch: Record<
    string,
    { open: boolean; closesAt: string | null; canPick: boolean; mine: string | null; counts: { a: number; b: number; draw: number; total: number } | null }
  > = {};
  const waiting: string[] = [];
  for (const m of predictable) {
    const c = byId.get(m.competitionId)!;
    const own = picks.filter((p) => p.matchId === m.id && pickValid(p.pick, m, c));
    const open = predictionOpen(ev, c, m, now);
    const players = [m.entryA!, m.entryB!].flatMap((e) => membersOf.get(e) ?? []);
    const canPick = open && takingPart && !players.includes(viewer!.id);
    const mine = viewer ? (own.find((p) => p.employeeId === viewer.id)?.pick ?? null) : null;
    if (canPick && !mine) waiting.push(m.id);
    const closes = predictionCloses(ev, m);
    perMatch[m.id] = {
      open,
      closesAt: closes && !Number.isNaN(closes.getTime()) ? closes.toISOString() : null,
      canPick,
      mine,
      // How the others picked shows once one has picked oneself, or once picking is over.
      counts:
        !open || mine || roles.referee
          ? {
              a: own.filter((p) => p.pick === m.entryA).length,
              b: own.filter((p) => p.pick === m.entryB).length,
              draw: own.filter((p) => p.pick === PREDICT_DRAW).length,
              total: own.length,
            }
          : null,
    };
  }

  // The best predictors: right picks of finished matches, fewer misses first.
  const score = new Map<string, { correct: number; total: number }>();
  for (const p of picks) {
    const m = predictable.find((x) => x.id === p.matchId);
    const c = m && byId.get(m.competitionId);
    if (!m || !c || !m.done || !pickValid(p.pick, m, c)) continue;
    const s = score.get(p.employeeId) ?? { correct: 0, total: 0 };
    s.total += 1;
    if (predictionRight(p.pick, m)) s.correct += 1;
    score.set(p.employeeId, s);
  }
  const ranked = [...score.entries()]
    .map(([employeeId, s]) => ({ employeeId, ...s }))
    .filter((s) => s.correct > 0)
    .sort((a, b) => b.correct - a.correct || a.total - b.total || a.employeeId.localeCompare(b.employeeId));
  const leaders = ranked.map((s, i) => {
    const first = ranked.findIndex((x) => x.correct === s.correct && x.total === s.total);
    return { ...s, rank: first === -1 ? i + 1 : first + 1 };
  });

  // «چند دانه؟»
  const phase = phaseOf(ev, now);
  const revealed = Boolean(ev.guessRevealedAt && ev.guessAnswer !== null);
  const guessOpen = Boolean(ev.guessQuestion) && !revealed && (phase === 'signup' || phase === 'brackets' || phase === 'matchday');
  const order = revealed ? guessOrder(guesses.map((g) => ({ employeeId: g.employeeId, value: g.value, at: g.updatedAt.toISOString() })), ev.guessAnswer!) : [];
  const myGuess = viewer ? guesses.find((g) => g.employeeId === viewer.id) : undefined;
  const guess = ev.guessQuestion
    ? {
        question: ev.guessQuestion,
        open: guessOpen,
        closesAt: programStart(ev).toISOString(),
        // Organizers set the game up, so they do not play it.
        canGuess: guessOpen && takingPart && !ev.organizerIds.includes(viewer!.id),
        count: guesses.length,
        mine: myGuess?.value ?? null,
        revealed,
        answer: revealed ? ev.guessAnswer : null,
        winners: order.slice(0, 3).map(({ employeeId, value, diff }) => ({ employeeId, value, diff })),
        myRank: viewer && revealed ? order.findIndex((g) => g.employeeId === viewer.id) + 1 || null : null,
      }
    : null;

  return {
    predictions: {
      matches: perMatch,
      leaders: leaders.slice(0, 10),
      me: viewer ? { ...(score.get(viewer.id) ?? { correct: 0, total: 0 }), waiting: waiting.length } : null,
    },
    guess,
    fal: {
      mine: viewer ? (fals.find((f) => f.employeeId === viewer.id)?.verse ?? null) : null,
      count: fals.length,
      open: falOpen(ev, phase) && Boolean(viewer) && (ev.status === 'active' || roles.referee),
    },
    peopleIds: [...leaders.slice(0, 10).map((l) => l.employeeId), ...(guess?.winners.map((w) => w.employeeId) ?? [])],
  };
}

eventGamesRouter.put(
  '/event_matches/:id/prediction',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [m] = await db.select().from(eventMatches).where(eq(eventMatches.id, req.params.id));
    if (!m) throw new HttpError(404, 'این بازی پیدا نشد.');
    const [c] = await db.select().from(eventCompetitions).where(eq(eventCompetitions.id, m.competitionId));
    const ev = await eventOf(c.eventId);
    const roles = rolesOf(ev, viewer);
    if (ev.status !== 'active' && !roles.referee) throw new HttpError(400, 'رویداد هنوز شروع نشده است.');
    if (roles.isJuror) throw new HttpError(403, 'داوران پیش‌بینی نمی‌کنند.');
    if (!predictionOpen(ev, c, m, new Date())) throw new HttpError(400, 'پیش‌بینی این بازی بسته شده است.');
    const players = await db
      .select({ id: eventEntryMembers.employeeId })
      .from(eventEntryMembers)
      .where(inArray(eventEntryMembers.entryId, [m.entryA!, m.entryB!]));
    if (players.some((p) => p.id === viewer.id)) throw new HttpError(403, 'بازی خودتان را پیش‌بینی نمی‌کنید.');
    const { pick } = parse(z.object({ pick: z.string().max(100).nullable() }), req.body);
    if (pick === null) {
      await db.delete(eventPredictions).where(and(eq(eventPredictions.matchId, m.id), eq(eventPredictions.employeeId, viewer.id)));
    } else {
      if (!pickValid(pick, m, c)) throw new HttpError(400, 'یکی از دو طرف بازی را انتخاب کنید.');
      await db
        .insert(eventPredictions)
        .values({ matchId: m.id, employeeId: viewer.id, pick })
        .onConflictDoUpdate({ target: [eventPredictions.matchId, eventPredictions.employeeId], set: { pick, updatedAt: new Date() } });
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── «چند دانه؟» ─────────────────────────────────────────────────────────────

/** The organizers set the question (an empty one turns the game off). */
eventGamesRouter.put(
  '/special_events/:id/guess_question',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    const { question } = parse(z.object({ question: z.string().trim().max(GUESS_QUESTION_MAX) }), req.body);
    if (!question && ev.guessRevealedAt) throw new HttpError(400, 'جواب این بازی اعلام شده و دیگر خاموش نمی‌شود.');
    await db.update(specialEvents).set({ guessQuestion: question, updatedAt: new Date() }).where(eq(specialEvents.id, ev.id));
    if (question !== ev.guessQuestion) await logAction(ev, viewer.id, question ? 'پرسش «چند دانه؟» تعیین شد' : 'بازی «چند دانه؟» خاموش شد', question);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventGamesRouter.put(
  '/special_events/:id/guess',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    const roles = rolesOf(ev, viewer);
    if (!ev.guessQuestion) throw new HttpError(400, 'این رویداد بازی «چند دانه؟» ندارد.');
    if (ev.status !== 'active' && !roles.referee) throw new HttpError(400, 'رویداد هنوز شروع نشده است.');
    if (roles.isJuror || ev.organizerIds.includes(viewer.id)) throw new HttpError(403, 'برگزارکنندگان و داوران در این بازی شرکت نمی‌کنند.');
    const phase = phaseOf(ev);
    if (ev.guessRevealedAt || !(phase === 'signup' || phase === 'brackets' || phase === 'matchday')) {
      throw new HttpError(400, 'وقت حدس زدن تمام شده است.');
    }
    const { value } = parse(z.object({ value: z.number().int('یک عدد درست بنویسید.').min(0).max(GUESS_MAX).nullable() }), req.body);
    if (value === null) {
      await db.delete(eventGuesses).where(and(eq(eventGuesses.eventId, ev.id), eq(eventGuesses.employeeId, viewer.id)));
    } else {
      await db
        .insert(eventGuesses)
        .values({ eventId: ev.id, employeeId: viewer.id, value })
        .onConflictDoUpdate({ target: [eventGuesses.eventId, eventGuesses.employeeId], set: { value, updatedAt: new Date() } });
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** On stage: the answer is written in and the closest guess wins (null takes the answer back). */
eventGamesRouter.post(
  '/special_events/:id/guess_reveal',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    if (!ev.guessQuestion) throw new HttpError(400, 'این رویداد بازی «چند دانه؟» ندارد.');
    const phase = phaseOf(ev);
    if (phase !== 'live' && phase !== 'memories' && phase !== 'ended') throw new HttpError(400, 'جواب بعد از شروع برنامه اعلام می‌شود.');
    const { answer } = parse(z.object({ answer: z.number().int('یک عدد درست بنویسید.').min(0).max(GUESS_MAX).nullable() }), req.body);
    await db
      .update(specialEvents)
      .set({ guessAnswer: answer, guessRevealedAt: answer === null ? null : (ev.guessRevealedAt ?? new Date()), updatedAt: new Date() })
      .where(eq(specialEvents.id, ev.id));
    if (answer === null) {
      await logAction(ev, viewer.id, 'جواب «چند دانه؟» پس گرفته شد', '');
    } else {
      await logAction(ev, viewer.id, 'جواب «چند دانه؟» اعلام شد', toPersianDigits(answer));
      if (!ev.guessRevealedAt && ev.status === 'active') {
        const guesses = await db.select().from(eventGuesses).where(eq(eventGuesses.eventId, ev.id));
        const [winner] = guessOrder(
          guesses.map((g) => ({ employeeId: g.employeeId, value: g.value, at: g.updatedAt.toISOString() })),
          answer,
        );
        if (winner) {
          await createNotifications([winner.employeeId], {
            ...GUESS_NOTIFY,
            title: 'حدس شما از همه نزدیک‌تر بود 🎉',
            message: `${ev.guessQuestion} جواب: ${toPersianDigits(answer)}؛ حدس شما: ${toPersianDigits(winner.value)}.`,
          });
        }
      }
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── «برنامهٔ امشب» ────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().max(100).optional(),
        time: z.string().regex(TIME_RE, 'ساعت را به شکل ۱۵:۰۰ وارد کنید.'),
        title: z.string().trim().min(1, 'عنوان هر بخش را بنویسید.').max(SCHEDULE_TITLE_MAX),
      }),
    )
    .max(SCHEDULE_MAX, `برنامه حداکثر ${toPersianDigits(SCHEDULE_MAX)} بخش دارد.`),
});

/** The organizers write what happens when on the night. */
eventGamesRouter.put(
  '/special_events/:id/schedule',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    const { items } = parse(scheduleSchema, req.body);
    const schedule = items
      .map((i) => ({ id: i.id && /^[\w-]+$/.test(i.id) ? i.id : newId('slot'), time: i.time, title: i.title }))
      .sort((a, b) => a.time.localeCompare(b.time));
    await db.update(specialEvents).set({ schedule, updatedAt: new Date() }).where(eq(specialEvents.id, ev.id));
    await logAction(ev, viewer.id, 'برنامهٔ امشب به‌روز شد', `${toPersianDigits(schedule.length)} بخش`);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── «فال حافظ» ───────────────────────────────────────────────────────────────

/** A fal from the event's page opens with it and stays until the page goes away after the program. */
const falOpen = (ev: EventRow, phase = phaseOf(ev)) => phase !== 'ended';

/** One fal a night: the verse is drawn once and stays the same when the page is opened again. */
eventGamesRouter.post(
  '/special_events/:id/fal',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (ev.status !== 'active' && !rolesOf(ev, viewer).referee) throw new HttpError(400, 'رویداد هنوز شروع نشده است.');
    if (!falOpen(ev)) throw new HttpError(400, 'وقت فال این رویداد گذشته است.');
    await db.insert(eventFals).values({ eventId: ev.id, employeeId: viewer.id, verse: randomFal() }).onConflictDoNothing();
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── Badges in the phone book ────────────────────────────────────────────────

export interface EventBadge {
  icon: string;
  label: string;
}

/** Champions and award winners of the events of the past year, by colleague. */
export async function eventBadges(now = new Date()) {
  const since = toJalali(new Date(now.getTime() - 365 * 86_400_000));
  const events = (await db.select().from(specialEvents).where(eq(specialEvents.status, 'active'))).filter(
    (ev) => ev.programDate >= since && ['live', 'memories', 'ended'].includes(eventPhase(ev, now)),
  );
  const badges: Record<string, EventBadge[]> = {};
  if (events.length === 0) return badges;
  const add = (id: string, badge: EventBadge) => {
    if (!badges[id]?.some((b) => b.label === badge.label)) badges[id] = [...(badges[id] ?? []), badge];
  };
  const title = new Map(events.map((ev) => [ev.id, ev.title]));
  const eventIds = events.map((ev) => ev.id);
  const competitions = (await db.select().from(eventCompetitions).where(inArray(eventCompetitions.eventId, eventIds))).filter((c) => c.publishedAt);
  if (competitions.length > 0) {
    const ids = competitions.map((c) => c.id);
    const [matches, members] = await Promise.all([
      db.select().from(eventMatches).where(inArray(eventMatches.competitionId, ids)),
      db.select().from(eventEntryMembers).where(inArray(eventEntryMembers.competitionId, ids)),
    ]);
    for (const c of competitions) {
      const { champion } = championInfo(
        c,
        matches.filter((m) => m.competitionId === c.id),
      );
      if (!champion) continue;
      for (const m of members.filter((x) => x.entryId === champion)) add(m.employeeId, { icon: '🏆', label: `قهرمان ${c.title} · ${title.get(c.eventId)}` });
    }
  }
  const awards = await db
    .select()
    .from(eventAwards)
    .where(and(inArray(eventAwards.eventId, eventIds), isNotNull(eventAwards.revealedAt), isNotNull(eventAwards.winnerId)));
  for (const a of awards) add(a.winnerId!, { icon: '🏅', label: `${a.title} · ${title.get(a.eventId)}` });
  return badges;
}

eventGamesRouter.get(
  '/event_badges',
  route(async (req, res) => {
    // Guests see them only when the phone book is open to them.
    if (!viewerOf(req) && !(await guestSettings()).guestDirectory) {
      res.json({});
      return;
    }
    res.json(await eventBadges());
  }),
);
