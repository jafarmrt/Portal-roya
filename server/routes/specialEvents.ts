import { createHash, randomBytes, randomInt } from 'crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { isValidJalaliDate, jalaliToDate, TIME_RE, toJalali, toPersianDigits } from '../../shared/jalali.js';
import {
  BADGE_PREFIX,
  COMPETITION_TITLE_MAX,
  COMPETITIONS_MAX,
  DEFAULT_SCREEN,
  ENTRIES_MAX,
  ENTRY_KINDS,
  EVENT_PHASES,
  EVENT_TEXT_MAX,
  EVENT_THEMES,
  EVENT_TITLE_MAX,
  type EventPhase,
  FORMATS,
  type Format,
  LEAGUE_MAX,
  RANK_BY,
  RANK_VALUE_MAX,
  WORD_MAX,
  WORDS_MAX,
  MATCH_REMIND_MINUTES,
  MIN_SIGNUP_WORKDAYS,
  OBJECTION_MAX,
  PLACE_MAX,
  PROGRAM_REMIND_MINUTES,
  RESULT_OVERDUE_MINUTES,
  RESULT_UNDO_MS,
  SCORINGS,
  SCREEN_CODE_MINUTES,
  HAFEZ_FAL,
  SCREEN_SCENES,
  SCREEN_SESSION_HOURS,
  type ScreenState,
  STAGE_POLICIES,
  TEAM_BADGES,
  TEAM_NAME_MAX,
  TIE_RULES,
  championOf,
  cleanWords,
  datesProblem,
  formatRankValue,
  leagueTable,
  rankingTable,
  roundRobin,
  tableChampion,
  eventPhase,
  firstRoundPairs,
  juryProblem,
  programStart,
  roundName,
  roundsFor,
  settleBracket,
  suggestedDates,
  timerLeft,
  workdaysBetween,
} from '../../shared/specialEvents.js';
import { addJalaliDays } from '../../shared/todos.js';
import { can, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import {
  employees,
  eventCompetitions,
  eventEntries,
  eventEntryMembers,
  eventLog,
  eventMatches,
  eventObjections,
  eventScreens,
  specialEvents,
} from '../db/schema.js';
import { broadcastChange, signalUser } from '../events.js';
import { HttpError, currentUser, newId, parse, route, viewerOf } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { guestSettings } from '../settings.js';
import { awardsView, processAwards } from './eventAwards.js';
import { gamesView } from './eventGames.js';
import { quizView } from './eventQuiz.js';
import { wishesView } from './eventWishes.js';
import { songsView } from './eventSongs.js';

// «رویداد ویژه»: the page of a company occasion (Yalda night). Who may do what:
// - those with «مدیریت رویدادهای ویژه» create the event, set its dates, organizers and jury, and switch it on;
// - organizers build competitions, run the draw and times, enter results and drive the big screen;
// - jurors oversee every competition: they enter and correct results and decide objections, and take part
//   in nothing themselves;
// - everyone else signs up (alone or as a team), sees the brackets and objects to a result of their own match.

export const specialEventsRouter = Router();

export type EventRow = typeof specialEvents.$inferSelect;
type CompetitionRow = typeof eventCompetitions.$inferSelect;
type EntryRow = typeof eventEntries.$inferSelect;
type MatchRow = typeof eventMatches.$inferSelect;
export type Viewer = Pick<SessionUser, 'id' | 'role' | 'permissions'> | null;

/** The sides of a match: two in a knockout or a points table, the one performing in a ranking. */
const sidesOf = (m: Pick<MatchRow, 'entryA' | 'entryB'>) => [m.entryA, m.entryB].filter((id): id is string => Boolean(id));

/** Whoever plays it is known (both sides, or the performer of a ranking), so it can be played. */
const isReady = (m: Pick<MatchRow, 'entryA' | 'entryB' | 'bye'>, format: Format) =>
  !m.bye && (format === 'ranking' ? Boolean(m.entryA) : Boolean(m.entryA && m.entryB));

/** «فینال»، «دور ۲» or «نوبت ۵», by the competition's format. */
const matchLabel = (m: Pick<MatchRow, 'round' | 'slot' | 'third'>, rounds: number, format: Format) =>
  format === 'league' ? `دور ${toPersianDigits(m.round)}` : format === 'ranking' ? `نوبت ${toPersianDigits(m.slot + 1)}` : roundName(m.round, rounds, m.third);

/** The champion of a competition once it is decided, and who shares first place while the jury has to pick. */
export function championInfo(c: Pick<CompetitionRow, 'format' | 'rankBy' | 'championPickId'>, matches: MatchRow[]) {
  if (c.format === 'knockout') return { champion: championOf(matches), tie: [] as string[] };
  const allDone = matches.length > 0 && matches.every((m) => m.done);
  if (c.format === 'league') {
    const ids = [...new Set(matches.flatMap(sidesOf))];
    return tableChampion(leagueTable(ids, matches), allDone, c.championPickId);
  }
  const performances = matches.filter((m) => m.entryA).map((m) => ({ entryId: m.entryA!, value: m.scoreA, done: m.done }));
  return tableChampion(rankingTable(performances, c.rankBy), allDone, c.championPickId);
}

export const NOTIFY = { type: 'event' as const, linkTab: 'event' };

// ─── Who the viewer is to an event ───────────────────────────────────────────

export function rolesOf(ev: EventRow, viewer: Viewer) {
  const canManage = Boolean(viewer && can(viewer, 'events.manage'));
  const isOrganizer = Boolean(viewer && (canManage || ev.organizerIds.includes(viewer.id)));
  const isJuror = Boolean(viewer && ev.juryIds.includes(viewer.id));
  // Objections go to the jury; an event without one leaves them to its organizers.
  const decides = ev.juryIds.length > 0 ? isJuror : isOrganizer;
  return { canManage, isOrganizer, isJuror, decides, referee: isOrganizer || isJuror };
}

/** The phase the page shows: a draft may be looked at as another phase during the rehearsal. */
export const phaseOf = (ev: EventRow, now = new Date()): EventPhase =>
  ev.status === 'draft' && ev.testPhase ? ev.testPhase : eventPhase(ev, now);

function visibleTo(ev: EventRow, viewer: Viewer, now = new Date()) {
  const { isOrganizer, isJuror } = rolesOf(ev, viewer);
  if (isOrganizer || isJuror) return true;
  return ev.status === 'active' && eventPhase(ev, now) !== 'ended';
}

/** The event this viewer sees in the menu: the nearest one that is not over, or the latest for its organizers. */
async function currentEventFor(viewer: Viewer) {
  const rows = await db.select().from(specialEvents).orderBy(desc(specialEvents.programDate), desc(specialEvents.createdAt));
  const now = new Date();
  const visible = rows.filter((ev) => visibleTo(ev, viewer, now));
  const open = visible.filter((ev) => eventPhase(ev, now) !== 'ended');
  // Of the events not over, the soonest; otherwise the most recent one (for its organizers' archive).
  return open.at(-1) ?? visible[0] ?? null;
}

export async function eventOf(id: string) {
  const [ev] = await db.select().from(specialEvents).where(eq(specialEvents.id, id));
  if (!ev) throw new HttpError(404, 'این رویداد پیدا نشد.');
  return ev;
}

async function competitionOf(id: string) {
  const [competition] = await db.select().from(eventCompetitions).where(eq(eventCompetitions.id, id));
  if (!competition) throw new HttpError(404, 'این مسابقه پیدا نشد.');
  return { competition, ev: await eventOf(competition.eventId) };
}

function requireManager(viewer: SessionUser) {
  if (!can(viewer, 'events.manage')) throw new HttpError(403, 'ساختن و تنظیم رویداد با مدیر پرتال است.');
}

export function requireOrganizer(ev: EventRow, viewer: SessionUser) {
  if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
}

export function requireReferee(ev: EventRow, viewer: SessionUser) {
  if (!rolesOf(ev, viewer).referee) throw new HttpError(403, 'ثبت و اصلاح نتیجه با برگزارکنندگان و داوران است.');
}

/** Everyone who should see a change at once: the whole portal for a public event, else its organizers and jury. */
export function announceChange(ev: EventRow) {
  if (ev.status === 'active') broadcastChange('special_event');
  else for (const id of new Set([...ev.organizerIds, ...ev.juryIds])) signalUser(id, 'special_event');
  // Those who manage events see drafts too; they get the whole-portal signal only when it is public.
}

export async function logAction(ev: EventRow, by: string | null, action: string, detail = '', matchId: string | null = null) {
  await db.insert(eventLog).values({ eventId: ev.id, byId: by, action, detail, matchId });
}

// ─── Reading an event ────────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  department: string;
  position: string;
}

export async function peopleById(ids: Iterable<string>) {
  const list = [...new Set(ids)].filter(Boolean);
  if (list.length === 0) return {} as Record<string, Person>;
  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      avatarUrl: employees.avatarUrl,
      department: employees.department,
      position: employees.position,
    })
    .from(employees)
    .where(inArray(employees.id, list));
  return Object.fromEntries(rows.map((r) => [r.id, { ...r, name: fullName(r) }])) as Record<string, Person>;
}

async function competitionsOf(eventId: string) {
  const competitions = await db
    .select()
    .from(eventCompetitions)
    .where(eq(eventCompetitions.eventId, eventId))
    .orderBy(asc(eventCompetitions.sortOrder), asc(eventCompetitions.createdAt));
  const ids = competitions.map((c) => c.id);
  if (ids.length === 0) return { competitions, entries: [] as EntryRow[], members: [], matches: [] as MatchRow[] };
  const [entries, members, matches] = await Promise.all([
    db.select().from(eventEntries).where(inArray(eventEntries.competitionId, ids)).orderBy(asc(eventEntries.createdAt)),
    db.select().from(eventEntryMembers).where(inArray(eventEntryMembers.competitionId, ids)).orderBy(asc(eventEntryMembers.joinedAt)),
    db
      .select()
      .from(eventMatches)
      .where(inArray(eventMatches.competitionId, ids))
      .orderBy(asc(eventMatches.round), asc(eventMatches.third), asc(eventMatches.slot)),
  ]);
  return { competitions, entries, members, matches };
}

const matchStart = (m: Pick<MatchRow, 'day' | 'time'>) => (m.day && m.time ? jalaliToDate(m.day, m.time) : null);

const serializeMatch = (m: MatchRow, rounds: number, format: Format) => ({
  id: m.id,
  round: m.round,
  slot: m.slot,
  third: m.third,
  roundName: matchLabel(m, rounds, format),
  done: m.done,
  entryA: m.entryA,
  entryB: m.entryB,
  scoreA: m.scoreA,
  scoreB: m.scoreB,
  tieA: m.tieA,
  tieB: m.tieB,
  winnerId: m.winnerId,
  bye: m.bye,
  walkover: m.walkover,
  live: m.live,
  onStage: m.onStage,
  day: m.day,
  time: m.time,
  place: m.place,
  resultById: m.resultById,
  resultAt: m.resultAt?.toISOString() ?? null,
});

/** People who appear in two daytime matches at about the same time (across competitions). */
function timeClashes(
  competitions: CompetitionRow[],
  matches: MatchRow[],
  membersOf: Map<string, string[]>,
  people: Record<string, Person>,
) {
  const slot = new Map(competitions.map((c) => [c.id, c.slotMinutes]));
  const title = new Map(competitions.map((c) => [c.id, c.title]));
  const format = new Map(competitions.map((c) => [c.id, c.format]));
  const timed = matches
    .filter((m) => !m.done && !m.onStage && isReady(m, format.get(m.competitionId) ?? 'knockout') && matchStart(m))
    .map((m) => ({ m, start: matchStart(m)!.getTime(), end: matchStart(m)!.getTime() + (slot.get(m.competitionId) ?? 20) * 60_000 }));
  const warnings: string[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (a.m.competitionId === b.m.competitionId || a.start >= b.end || b.start >= a.end) continue;
      const peopleA = new Set(sidesOf(a.m).flatMap((e) => membersOf.get(e) ?? []));
      const both = sidesOf(b.m)
        .flatMap((e) => membersOf.get(e) ?? [])
        .filter((p) => peopleA.has(p));
      for (const p of both) {
        warnings.push(
          `${people[p]?.name ?? 'یک همکار'} ساعت ${toPersianDigits(a.m.time)} در «${title.get(a.m.competitionId)}» و ساعت ${toPersianDigits(b.m.time)} در «${title.get(b.m.competitionId)}» بازی دارد.`,
        );
      }
    }
  }
  return warnings;
}

export async function eventView(ev: EventRow, viewer: Viewer) {
  const now = new Date();
  const roles = rolesOf(ev, viewer);
  const phase = phaseOf(ev, now);
  const { competitions, entries, members, matches } = await competitionsOf(ev.id);

  const membersOf = new Map<string, string[]>();
  for (const m of members) membersOf.set(m.entryId, [...(membersOf.get(m.entryId) ?? []), m.employeeId]);

  const objectionRows = await db
    .select()
    .from(eventObjections)
    .where(eq(eventObjections.eventId, ev.id))
    .orderBy(desc(eventObjections.createdAt));
  const objections = objectionRows.filter((o) => roles.decides || roles.isOrganizer || o.byId === viewer?.id);

  const log = roles.referee
    ? await db.select().from(eventLog).where(eq(eventLog.eventId, ev.id)).orderBy(desc(eventLog.id)).limit(80)
    : [];

  const awardsPart = await awardsView(ev, viewer);
  const funPart = await songsView(ev, viewer);
  const gamesPart = await gamesView(ev, viewer, { competitions, matches, membersOf });
  const quizPart = await quizView(ev, viewer);
  const wishesPart = await wishesView(ev, viewer);
  const people = await peopleById([
    ...awardsPart.peopleIds,
    ...funPart.peopleIds,
    ...gamesPart.peopleIds,
    ...quizPart.peopleIds,
    ...wishesPart.peopleIds,
    ...ev.juryIds,
    ...ev.organizerIds,
    ...members.map((m) => m.employeeId),
    ...objections.flatMap((o) => [o.byId, o.decidedById ?? '']),
    ...log.map((l) => l.byId ?? ''),
  ]);

  const waitlistPosition = new Map<string, number>();
  for (const c of competitions) {
    entries
      .filter((e) => e.competitionId === c.id && e.status === 'waitlist')
      .forEach((e, i) => waitlistPosition.set(e.id, i + 1));
  }

  const warnings: string[] = [];
  if (roles.isOrganizer) {
    for (const juror of ev.juryIds) {
      const playing = members.filter((m) => m.employeeId === juror);
      for (const m of playing) {
        const c = competitions.find((x) => x.id === m.competitionId);
        warnings.push(`${people[juror]?.name ?? 'یکی از داوران'} داور است ولی در «${c?.title ?? ''}» ثبت‌نام شده؛ او را از مسابقه خارج کنید.`);
      }
    }
    for (const c of competitions) {
      if (c.kind !== 'team' || c.drawnAt) continue;
      for (const e of entries.filter((x) => x.competitionId === c.id && x.status === 'in')) {
        const count = membersOf.get(e.id)?.length ?? 0;
        if (count < c.teamMin) warnings.push(`تیم «${e.name}» در «${c.title}» ${toPersianDigits(c.teamMin - count)} نفر کم دارد.`);
      }
    }
    warnings.push(...timeClashes(competitions, matches, membersOf, people));
  }

  return {
    event: {
      id: ev.id,
      title: ev.title,
      theme: ev.theme,
      intro: ev.intro,
      status: ev.status,
      programDate: ev.programDate,
      programTime: ev.programTime,
      programPlace: ev.programPlace,
      signupEnd: ev.signupEnd,
      showUntil: ev.showUntil,
      testPhase: ev.testPhase,
      phase,
      realPhase: eventPhase(ev, now),
      activatedAt: ev.activatedAt?.toISOString() ?? null,
      organizerIds: ev.organizerIds,
      juryIds: ev.juryIds,
      juryHeadId: ev.juryHeadId,
      juryPhotos: ev.juryPhotos,
      guessQuestion: ev.guessQuestion,
      schedule: [...ev.schedule].sort((a, b) => a.time.localeCompare(b.time)),
      screen: roles.referee ? (ev.screen ?? DEFAULT_SCREEN) : null,
    },
    me: roles,
    competitions: competitions.map((c) => {
      const own = matches.filter((m) => m.competitionId === c.id);
      const inEntries = entries.filter((e) => e.competitionId === c.id && e.status === 'in').length;
      const rounds = Math.max(0, ...own.map((m) => m.round));
      const bracketVisible = Boolean(c.publishedAt) || roles.referee;
      const { champion, tie } = bracketVisible ? championInfo(c, own) : { champion: null, tie: [] };
      return {
        ...c,
        drawnAt: c.drawnAt?.toISOString() ?? null,
        publishedAt: c.publishedAt?.toISOString() ?? null,
        championAnnouncedAt: undefined,
        championPickId: undefined,
        createdAt: undefined,
        // The pantomime's words are for those who run it; players never see them.
        words: roles.referee ? c.words : [],
        usedWords: undefined,
        wordsUsed: roles.referee ? c.usedWords.length : 0,
        rounds,
        bracketVisible,
        champion,
        championTie: tie,
        full: inEntries >= c.capacity,
        entries: entries
          .filter((e) => e.competitionId === c.id)
          .map((e) => ({
            id: e.id,
            name: e.name,
            image: e.image,
            captainId: e.captainId,
            status: e.status,
            members: membersOf.get(e.id) ?? [],
            waitlistPosition: waitlistPosition.get(e.id) ?? null,
          })),
        matches: bracketVisible ? own.map((m) => serializeMatch(m, rounds, c.format)) : [],
      };
    }),
    people,
    objections: objections.map((o) => ({
      id: o.id,
      matchId: o.matchId,
      byId: o.byId,
      // The jury reads who objected; other players never see each other's objections.
      text: o.text,
      status: o.status,
      decidedById: o.decidedById,
      decision: o.decision,
      createdAt: o.createdAt.toISOString(),
      decidedAt: o.decidedAt?.toISOString() ?? null,
    })),
    warnings,
    log: log.map((l) => ({ id: l.id, matchId: l.matchId, byId: l.byId, action: l.action, detail: l.detail, createdAt: l.createdAt.toISOString() })),
    awards: awardsPart.awards,
    awardsInfo: awardsPart.awardsInfo,
    songs: funPart.songs,
    ideas: funPart.ideas,
    predictions: gamesPart.predictions,
    guess: gamesPart.guess,
    fal: gamesPart.fal,
    quiz: quizPart.quiz,
    wishes: wishesPart.wishes,
    wheel: wishesPart.wheel,
    serverNow: now.toISOString(),
  };
}

specialEventsRouter.get(
  '/special_events/current',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const canManage = Boolean(viewer && can(viewer, 'events.manage'));
    // Names of colleagues are part of the page, so guests see it only when the phone book is open to them.
    if (!viewer && !(await guestSettings()).guestDirectory) {
      res.json({ event: null, canManage: false, loginRequired: true });
      return;
    }
    const ev = await currentEventFor(viewer);
    if (!ev) {
      res.json({ event: null, canManage });
      return;
    }
    res.json({ ...(await eventView(ev, viewer)), canManage });
  }),
);

/** Every event, for those who manage them (to pick last year's or start a new one). */
specialEventsRouter.get(
  '/special_events',
  route(async (req, res) => {
    requireManager(currentUser(req));
    const rows = await db.select().from(specialEvents).orderBy(desc(specialEvents.programDate));
    res.json(rows.map((ev) => ({ id: ev.id, title: ev.title, status: ev.status, programDate: ev.programDate, phase: eventPhase(ev) })));
  }),
);

// ─── Creating and setting up an event (those who manage events) ──────────────

const jalali = (message: string) => z.string().refine(isValidJalaliDate, message);
const time = z.string().regex(TIME_RE, 'ساعت را به شکل ۱۵:۰۰ وارد کنید.');
const personId = z.string().min(1).max(100);

const eventSchema = z.object({
  title: z.string().trim().min(1, 'عنوان رویداد را بنویسید.').max(EVENT_TITLE_MAX),
  theme: z.enum(EVENT_THEMES.map((t) => t.id) as [string, ...string[]]).optional(),
  intro: z.string().trim().max(EVENT_TEXT_MAX).optional(),
  programDate: jalali('روز برنامه را درست وارد کنید.'),
  programTime: time.optional(),
  programPlace: z.string().trim().max(PLACE_MAX).optional(),
  signupEnd: jalali('پایان ثبت‌نام را درست وارد کنید.').optional(),
  showUntil: jalali('روز پایان نمایش را درست وارد کنید.').optional(),
});

const eventPatchSchema = eventSchema.partial().extend({
  organizerIds: z.array(personId).max(20).optional(),
  juryIds: z.array(personId).max(5).optional(),
  juryHeadId: personId.nullable().optional(),
  juryPhotos: z.record(z.string(), z.string().max(300)).optional(),
  testPhase: z.enum(EVENT_PHASES.map((p) => p.id) as [string, ...string[]]).nullable().optional(),
});

async function activePeople(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, hasAccount: employees.hasAccount })
    .from(employees)
    .where(and(inArray(employees.id, ids), eq(employees.isActive, true)));
}

specialEventsRouter.post(
  '/special_events',
  route(async (req, res) => {
    const viewer = currentUser(req);
    requireManager(viewer);
    const input = parse(eventSchema, req.body);
    const suggested = suggestedDates(input.programDate);
    const dates = {
      programDate: input.programDate,
      programTime: input.programTime ?? '15:00',
      signupEnd: input.signupEnd ?? suggested.signupEnd,
      showUntil: input.showUntil ?? suggested.showUntil,
    };
    const problem = datesProblem(dates);
    if (problem) throw new HttpError(400, problem);
    const [ev] = await db
      .insert(specialEvents)
      .values({
        id: newId('event'),
        title: input.title,
        theme: (input.theme as EventRow['theme']) ?? 'yalda',
        intro: input.intro ?? '',
        programPlace: input.programPlace ?? '',
        ...dates,
        organizerIds: [viewer.id],
        createdById: viewer.id,
      })
      .returning();
    await logAction(ev, viewer.id, 'رویداد ساخته شد', ev.title);
    signalUser(viewer.id, 'special_event');
    res.status(201).json(await eventView(ev, viewer));
  }),
);

specialEventsRouter.patch(
  '/special_events/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    requireManager(viewer);
    const ev = await eventOf(req.params.id);
    const input = parse(eventPatchSchema, req.body);
    const changes: Partial<EventRow> = {};
    for (const key of ['title', 'intro', 'programDate', 'programTime', 'programPlace', 'signupEnd', 'showUntil'] as const) {
      if (input[key] !== undefined) (changes as Record<string, unknown>)[key] = input[key];
    }
    if (input.theme !== undefined) changes.theme = input.theme as EventRow['theme'];
    const problem = datesProblem({ ...ev, ...changes });
    if (problem) throw new HttpError(400, problem);

    if (input.organizerIds !== undefined) {
      const ids = [...new Set(input.organizerIds)];
      const found = await activePeople(ids);
      if (found.length !== ids.length || found.some((p) => !p.hasAccount)) {
        throw new HttpError(400, 'برگزارکننده باید همکاری با حساب فعال در پرتال باشد.');
      }
      changes.organizerIds = ids;
    }
    if (input.juryIds !== undefined || input.juryHeadId !== undefined) {
      const ids = input.juryIds ?? ev.juryIds;
      const head = input.juryHeadId !== undefined ? input.juryHeadId : ev.juryHeadId;
      const juryIssue = juryProblem(ids, head ?? null);
      if (juryIssue) throw new HttpError(400, juryIssue);
      const found = await activePeople(ids);
      if (found.length !== ids.length || found.some((p) => !p.hasAccount)) {
        throw new HttpError(400, 'داور باید همکاری با حساب فعال در پرتال باشد.');
      }
      changes.juryIds = ids;
      changes.juryHeadId = ids.length > 0 ? head : null;
    }
    if (input.juryPhotos !== undefined) {
      const ids = changes.juryIds ?? ev.juryIds;
      changes.juryPhotos = Object.fromEntries(
        Object.entries(input.juryPhotos).filter(([id, url]) => ids.includes(id) && /^\/uploads\/[\w.-]+$/.test(url)),
      );
    }
    if (input.testPhase !== undefined) changes.testPhase = input.testPhase as EventPhase | null;

    const [updated] = await db
      .update(specialEvents)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(specialEvents.id, ev.id))
      .returning();
    if (changes.juryIds && changes.juryIds.join() !== ev.juryIds.join()) {
      await logAction(updated, viewer.id, 'هیئت داوران تعیین شد', '');
      const added = changes.juryIds.filter((id) => !ev.juryIds.includes(id));
      if (added.length > 0 && updated.status === 'active') {
        await createNotifications(added, {
          ...NOTIFY,
          title: `شما داور «${updated.title}» هستید`,
          message: 'نتیجه‌ها، اصلاح‌ها و اعتراض‌های همهٔ مسابقات با هیئت داوران است. داوران در هیچ مسابقه‌ای شرکت نمی‌کنند.',
        });
      }
    }
    announceChange(updated);
    for (const id of ev.organizerIds) signalUser(id, 'special_event');
    res.json(await eventView(updated, viewer));
  }),
);

/** Switching it on shows the page to everyone and tells them signup has started. */
specialEventsRouter.post(
  '/special_events/:id/activate',
  route(async (req, res) => {
    const viewer = currentUser(req);
    requireManager(viewer);
    const ev = await eventOf(req.params.id);
    const { force } = parse(z.object({ force: z.boolean().optional() }), req.body);
    if (ev.status === 'active') throw new HttpError(400, 'این رویداد همین حالا فعال است.');
    if (eventPhase(ev) === 'ended') throw new HttpError(400, 'تاریخ این رویداد گذشته است؛ اول تاریخ‌ها را درست کنید.');
    const today = toJalali(new Date());
    const workdays = today <= ev.signupEnd ? workdaysBetween(today, ev.signupEnd) : 0;
    if (workdays < MIN_SIGNUP_WORKDAYS && !force) {
      throw new HttpError(
        409,
        `بازهٔ ثبت‌نام فقط ${toPersianDigits(workdays)} روز کاری دارد؛ زودتر فعال کنید یا پایان ثبت‌نام را عقب‌تر ببرید. اگر همین درست است، دوباره «فعال کن» را بزنید.`,
        'FEW_WORKDAYS',
      );
    }
    const [updated] = await db
      .update(specialEvents)
      .set({ status: 'active', testPhase: null, activatedAt: ev.activatedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(specialEvents.id, ev.id))
      .returning();
    await logAction(updated, viewer.id, 'رویداد برای همه فعال شد');
    // Only the first time: switching it off and on again for a fix does not tell everyone twice.
    if (!ev.activatedAt) {
      const phase = eventPhase(updated);
      await createNotifications(await audienceIds(), {
        ...NOTIFY,
        title: phase === 'signup' ? `${updated.title}: ثبت‌نام مسابقات شروع شد 🎉` : `صفحهٔ «${updated.title}» باز شد 🎉`,
        message:
          phase === 'signup'
            ? `تا ${toPersianDigits(updated.signupEnd)} در مسابقات ثبت‌نام کنید، تیم بسازید و جدول را دنبال کنید.`
            : 'جدول مسابقات و برنامهٔ شب را در صفحهٔ رویداد ببینید.',
      });
    }
    broadcastChange('special_event');
    res.json(await eventView(updated, viewer));
  }),
);

specialEventsRouter.post(
  '/special_events/:id/deactivate',
  route(async (req, res) => {
    const viewer = currentUser(req);
    requireManager(viewer);
    const ev = await eventOf(req.params.id);
    const [updated] = await db
      .update(specialEvents)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(specialEvents.id, ev.id))
      .returning();
    await logAction(updated, viewer.id, 'رویداد به پیش‌نویس برگشت');
    broadcastChange('special_event');
    res.json(await eventView(updated, viewer));
  }),
);

specialEventsRouter.delete(
  '/special_events/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    requireManager(viewer);
    const ev = await eventOf(req.params.id);
    if (ev.status === 'active') throw new HttpError(400, 'رویداد فعال را نمی‌توان حذف کرد؛ اول آن را به پیش‌نویس برگردانید.');
    await db.delete(specialEvents).where(eq(specialEvents.id, ev.id));
    for (const id of new Set([viewer.id, ...ev.organizerIds, ...ev.juryIds])) signalUser(id, 'special_event');
    res.status(204).end();
  }),
);

// ─── Competitions (organizers) ───────────────────────────────────────────────

const competitionSchema = z
  .object({
    title: z.string().trim().min(1, 'نام مسابقه را بنویسید.').max(COMPETITION_TITLE_MAX),
    icon: z.string().trim().min(1).max(8).optional(),
    rules: z.string().trim().max(EVENT_TEXT_MAX).optional(),
    kind: z.enum(ENTRY_KINDS.map((k) => k.id) as [string, ...string[]]),
    teamMin: z.number().int().min(1).max(20).optional(),
    teamMax: z.number().int().min(1).max(20).optional(),
    capacity: z.number().int().min(2, 'دست‌کم دو شرکت‌کننده لازم است.').max(ENTRIES_MAX),
    scoring: z.enum(SCORINGS.map((s) => s.id) as [string, ...string[]]),
    tieRule: z.enum(TIE_RULES.map((t) => t.id) as [string, ...string[]]),
    thirdPlace: z.boolean().optional(),
    stagePolicy: z.enum(STAGE_POLICIES.map((s) => s.id) as [string, ...string[]]),
    format: z.enum(FORMATS.map((f) => f.id) as [string, ...string[]]).optional(),
    rankBy: z.enum(RANK_BY.map((r) => r.id) as [string, ...string[]]).optional(),
    words: z.array(z.string().max(WORD_MAX * 2)).max(WORDS_MAX * 2).optional(),
    dayPlace: z.string().trim().max(PLACE_MAX).optional(),
    dayStart: time.optional(),
    slotMinutes: z.number().int().min(5).max(180).optional(),
  });

function competitionValues(input: z.infer<typeof competitionSchema>) {
  const team = input.kind === 'team';
  const teamMin = team ? (input.teamMin ?? 2) : 1;
  const teamMax = team ? Math.max(teamMin, input.teamMax ?? teamMin) : 1;
  if (team && teamMax < 2) throw new HttpError(400, 'تیم دست‌کم دو نفر است.');
  const format = (input.format ?? 'knockout') as Format;
  if (format === 'league' && input.capacity > LEAGUE_MAX) {
    throw new HttpError(400, `در جدول امتیازی همه با هم بازی می‌کنند؛ ظرفیت حداکثر ${toPersianDigits(LEAGUE_MAX)} است.`);
  }
  if (format !== 'knockout' && input.stagePolicy === 'final') {
    throw new HttpError(400, 'جدول امتیازی و رتبه‌بندی فینال جدا ندارد؛ «همه روی صحنه» یا «همه در طول روز» را انتخاب کنید.');
  }
  // A points table has draws instead of tie-breaks; a ranking has one value per entry.
  const scoring = (format === 'ranking' ? 'points' : input.scoring) as CompetitionRow['scoring'];
  return {
    format,
    rankBy: (format === 'ranking' ? (input.rankBy ?? 'high') : 'high') as CompetitionRow['rankBy'],
    ...(input.words ? { words: cleanWords(input.words) } : {}),
    title: input.title,
    icon: input.icon ?? '🏆',
    rules: input.rules ?? '',
    kind: input.kind as CompetitionRow['kind'],
    teamMin,
    teamMax,
    capacity: input.capacity,
    scoring,
    // «فقط برنده» has no draw to break, and only a knockout breaks one.
    tieRule: (scoring === 'winner' || format !== 'knockout' ? 'organizer' : input.tieRule) as CompetitionRow['tieRule'],
    thirdPlace: format === 'knockout' && (input.thirdPlace ?? false),
    stagePolicy: input.stagePolicy as CompetitionRow['stagePolicy'],
    dayPlace: input.dayPlace ?? '',
    dayStart: input.dayStart ?? '10:00',
    slotMinutes: input.slotMinutes ?? 20,
  };
}

specialEventsRouter.post(
  '/special_events/:id/competitions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireOrganizer(ev, viewer);
    const values = competitionValues(parse(competitionSchema, req.body));
    const existing = await db.select({ id: eventCompetitions.id }).from(eventCompetitions).where(eq(eventCompetitions.eventId, ev.id));
    if (existing.length >= COMPETITIONS_MAX) throw new HttpError(400, `بیش از ${toPersianDigits(COMPETITIONS_MAX)} مسابقه در یک رویداد نمی‌شود.`);
    await db.insert(eventCompetitions).values({ id: newId('comp'), eventId: ev.id, sortOrder: existing.length, ...values });
    await logAction(ev, viewer.id, 'مسابقه ساخته شد', values.title);
    announceChange(ev);
    res.status(201).json(await eventView(ev, viewer));
  }),
);

specialEventsRouter.put(
  '/event_competitions/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireOrganizer(ev, viewer);
    const values = competitionValues(parse(competitionSchema, req.body));
    if (competition.drawnAt) {
      // After the draw only what does not change the bracket may change.
      const locked = ['kind', 'teamMin', 'teamMax', 'capacity', 'thirdPlace', 'format', 'rankBy', 'scoring'] as const;
      if (locked.some((k) => values[k] !== competition[k])) {
        throw new HttpError(400, 'بعد از قرعه‌کشی شکل مسابقه، نوع نتیجه، اندازهٔ تیم، ظرفیت و ردهٔ سوم عوض نمی‌شود؛ اول قرعه را پاک کنید.');
      }
    }
    const usedWords = values.words ? competition.usedWords.filter((w) => values.words!.includes(w)) : competition.usedWords;
    await db.update(eventCompetitions).set({ ...values, usedWords }).where(eq(eventCompetitions.id, competition.id));
    if (competition.drawnAt && values.stagePolicy !== competition.stagePolicy) await applyStagePolicy(competition.id);
    await promoteWaitlist(competition.id, ev);
    await logAction(ev, viewer.id, 'مسابقه ویرایش شد', values.title);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

specialEventsRouter.delete(
  '/event_competitions/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireOrganizer(ev, viewer);
    await db.delete(eventCompetitions).where(eq(eventCompetitions.id, competition.id));
    await logAction(ev, viewer.id, 'مسابقه حذف شد', competition.title);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

// ─── Signing up ──────────────────────────────────────────────────────────────

const badge = z
  .string()
  .max(300)
  .refine(
    (v) => v === '' || (TEAM_BADGES as readonly string[]).includes(v.replace(BADGE_PREFIX, '')) || /^\/uploads\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(v),
    'تصویر تیم را از نشان‌های آماده انتخاب کنید یا عکسی بارگذاری کنید.',
  );

const entrySchema = z.object({
  name: z.string().trim().max(TEAM_NAME_MAX).optional(),
  image: badge.optional(),
  // Teammates (the one signing up is the captain). An organizer may sign up anyone, also for a single entry.
  memberIds: z.array(personId).max(20).optional(),
  // An organizer signing up others without being in the team; the first person listed leads it.
  forOthers: z.boolean().optional(),
});

/** Signing up is open until the draw; organizers may still change entries during the signup phase and after. */
function requireSignupOpen(ev: EventRow, competition: CompetitionRow, viewer: SessionUser) {
  if (competition.drawnAt) throw new HttpError(400, 'قرعهٔ این مسابقه کشیده شده و ثبت‌نام بسته است.');
  if (rolesOf(ev, viewer).isOrganizer) return;
  if (ev.status !== 'active' && !rolesOf(ev, viewer).isJuror) throw new HttpError(400, 'ثبت‌نام هنوز شروع نشده است.');
  if (phaseOf(ev) !== 'signup') throw new HttpError(400, 'مهلت ثبت‌نام تمام شده است.');
}

/** Checks the people of an entry: active colleagues, no jurors, nobody already in this competition. */
async function checkMembers(ev: EventRow, competition: CompetitionRow, ids: string[], exceptEntry?: string) {
  const found = await activePeople(ids);
  if (found.length !== ids.length) throw new HttpError(400, 'یکی از همکاران انتخاب‌شده در فهرست همکاران فعال نیست.');
  const jurors = found.filter((p) => ev.juryIds.includes(p.id));
  if (jurors.length > 0) {
    throw new HttpError(400, `${jurors.map(fullName).join('، ')} داور رویداد است و در مسابقات شرکت نمی‌کند.`);
  }
  const taken = await db
    .select({ employeeId: eventEntryMembers.employeeId, entryId: eventEntryMembers.entryId })
    .from(eventEntryMembers)
    .where(and(eq(eventEntryMembers.competitionId, competition.id), inArray(eventEntryMembers.employeeId, ids)));
  const elsewhere = taken.filter((t) => t.entryId !== exceptEntry);
  if (elsewhere.length > 0) {
    const names = found.filter((p) => elsewhere.some((t) => t.employeeId === p.id)).map(fullName);
    throw new HttpError(400, `${names.join('، ')} در این مسابقه ثبت‌نام کرده است.`);
  }
  return found;
}

async function inCount(competitionId: string) {
  const rows = await db
    .select({ id: eventEntries.id })
    .from(eventEntries)
    .where(and(eq(eventEntries.competitionId, competitionId), eq(eventEntries.status, 'in')));
  return rows.length;
}

const entryLabel = (competition: CompetitionRow, entry: Pick<EntryRow, 'name'>, people: { firstName: string; lastName: string }[]) =>
  competition.kind === 'team' ? `تیم «${entry.name}»` : people.map(fullName).join('، ');

/** Places freed before the draw go to the first on the waiting list, who is told. */
async function promoteWaitlist(competitionId: string, ev: EventRow) {
  const [competition] = await db.select().from(eventCompetitions).where(eq(eventCompetitions.id, competitionId));
  if (!competition || competition.drawnAt) return;
  let free = competition.capacity - (await inCount(competitionId));
  if (free <= 0) return;
  const waiting = await db
    .select()
    .from(eventEntries)
    .where(and(eq(eventEntries.competitionId, competitionId), eq(eventEntries.status, 'waitlist')))
    .orderBy(asc(eventEntries.createdAt));
  for (const entry of waiting) {
    if (free <= 0) break;
    await db.update(eventEntries).set({ status: 'in' }).where(eq(eventEntries.id, entry.id));
    free--;
    const members = await db.select({ id: eventEntryMembers.employeeId }).from(eventEntryMembers).where(eq(eventEntryMembers.entryId, entry.id));
    await createNotifications(members.map((m) => m.id), {
      ...NOTIFY,
      title: `جا باز شد؛ شما در «${competition.title}» هستید`,
      message: `${competition.kind === 'team' ? `تیم «${entry.name}»` : 'شما'} از فهرست انتظار به مسابقه آمد.`,
      linkId: competition.id,
    });
    await logAction(ev, null, 'از فهرست انتظار به مسابقه آمد', `${competition.title}: ${entry.name || 'فردی'}`);
  }
}

specialEventsRouter.post(
  '/event_competitions/:id/entries',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireSignupOpen(ev, competition, viewer);
    const input = parse(entrySchema, req.body);
    const organizer = rolesOf(ev, viewer).isOrganizer;
    const team = competition.kind === 'team';

    let memberIds: string[];
    if (team) {
      // The one signing up leads the team, unless an organizer signs up a team they are not in.
      const others = [...new Set(input.memberIds ?? [])];
      memberIds = organizer && input.forOthers && others.length > 0 ? others : [viewer.id, ...others.filter((id) => id !== viewer.id)];
      if (!input.name) throw new HttpError(400, 'نام تیم را بنویسید.');
    } else {
      const requested = input.memberIds?.[0];
      if (requested && requested !== viewer.id && !organizer) throw new HttpError(403, 'هر کس فقط خودش را ثبت‌نام می‌کند.');
      memberIds = [requested ?? viewer.id];
    }
    if (memberIds.length > competition.teamMax) {
      throw new HttpError(400, `تیم این مسابقه حداکثر ${toPersianDigits(competition.teamMax)} نفر است.`);
    }
    const people = await checkMembers(ev, competition, memberIds);
    if (team) {
      const sameName = await db
        .select({ id: eventEntries.id })
        .from(eventEntries)
        .where(and(eq(eventEntries.competitionId, competition.id), eq(eventEntries.name, input.name!)));
      if (sameName.length > 0) throw new HttpError(400, 'تیمی با همین نام در این مسابقه هست؛ نام دیگری انتخاب کنید.');
    }
    const all = await db.select({ id: eventEntries.id }).from(eventEntries).where(eq(eventEntries.competitionId, competition.id));
    if (all.length >= ENTRIES_MAX) throw new HttpError(400, 'ظرفیت فهرست انتظار هم پر است.');
    const status = (await inCount(competition.id)) < competition.capacity ? 'in' : 'waitlist';
    const entryId = newId('entry');
    const ordered = memberIds.map((id) => people.find((p) => p.id === id)!);
    await db.transaction(async (tx) => {
      await tx.insert(eventEntries).values({
        id: entryId,
        competitionId: competition.id,
        name: team ? input.name! : '',
        image: team ? (input.image ?? `${BADGE_PREFIX}${TEAM_BADGES[0]}`) : '',
        captainId: memberIds[0],
        status,
      });
      // One after another, so the order they were added is the order on the card.
      const base = Date.now();
      await tx.insert(eventEntryMembers).values(
        memberIds.map((employeeId, i) => ({ competitionId: competition.id, employeeId, entryId, joinedAt: new Date(base + i) })),
      );
    });
    const others = memberIds.filter((id) => id !== viewer.id);
    if (others.length > 0) {
      await createNotifications(others, {
        ...NOTIFY,
        title: team ? `شما در تیم «${input.name}» هستید` : `شما در «${competition.title}» ثبت‌نام شدید`,
        message: team
          ? `${fullName(viewer)} شما را به تیم «${input.name}» در «${competition.title}» اضافه کرد. اگر نمی‌خواهید، در صفحهٔ رویداد «خروج از تیم» را بزنید.`
          : `${fullName(viewer)} شما را در «${competition.title}» ثبت‌نام کرد.`,
        linkId: competition.id,
      });
    }
    await logAction(ev, viewer.id, status === 'in' ? 'ثبت‌نام' : 'ثبت‌نام در فهرست انتظار', `${competition.title}: ${entryLabel(competition, { name: input.name ?? '' }, ordered)}`);
    announceChange(ev);
    res.status(201).json({ status, view: await eventView(ev, viewer) });
  }),
);

async function entryOf(id: string) {
  const [entry] = await db.select().from(eventEntries).where(eq(eventEntries.id, id));
  if (!entry) throw new HttpError(404, 'این ثبت‌نام پیدا نشد.');
  const { competition, ev } = await competitionOf(entry.competitionId);
  const members = await db.select().from(eventEntryMembers).where(eq(eventEntryMembers.entryId, entry.id)).orderBy(asc(eventEntryMembers.joinedAt));
  return { entry, competition, ev, memberIds: members.map((m) => m.employeeId) };
}

/** The captain (or an organizer) renames the team, changes its picture or its members. */
specialEventsRouter.patch(
  '/event_entries/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { entry, competition, ev, memberIds } = await entryOf(req.params.id);
    const organizer = rolesOf(ev, viewer).isOrganizer;
    if (entry.captainId !== viewer.id && !organizer) throw new HttpError(403, 'تیم را سرپرست آن تغییر می‌دهد.');
    if (competition.drawnAt && !organizer) throw new HttpError(400, 'قرعهٔ این مسابقه کشیده شده و تیم دیگر تغییر نمی‌کند.');
    if (!competition.drawnAt) requireSignupOpen(ev, competition, viewer);
    const input = parse(entrySchema, req.body);
    const changes: Partial<EntryRow> = {};
    if (competition.kind === 'team' && input.name !== undefined) {
      if (!input.name) throw new HttpError(400, 'نام تیم را بنویسید.');
      if (input.name !== entry.name) {
        const sameName = await db
          .select({ id: eventEntries.id })
          .from(eventEntries)
          .where(and(eq(eventEntries.competitionId, competition.id), eq(eventEntries.name, input.name), ne(eventEntries.id, entry.id)));
        if (sameName.length > 0) throw new HttpError(400, 'تیمی با همین نام در این مسابقه هست؛ نام دیگری انتخاب کنید.');
        changes.name = input.name;
      }
    }
    if (competition.kind === 'team' && input.image !== undefined) changes.image = input.image;
    let added: string[] = [];
    if (input.memberIds !== undefined && competition.kind === 'team') {
      // The captain stays first; an organizer may replace the whole team.
      const next = [...new Set(organizer && !input.memberIds.includes(entry.captainId) ? input.memberIds : [entry.captainId, ...input.memberIds])];
      if (next.length === 0) throw new HttpError(400, 'تیم بدون عضو نمی‌ماند.');
      if (next.length > competition.teamMax) throw new HttpError(400, `تیم این مسابقه حداکثر ${toPersianDigits(competition.teamMax)} نفر است.`);
      await checkMembers(ev, competition, next, entry.id);
      added = next.filter((id) => !memberIds.includes(id));
      const removed = memberIds.filter((id) => !next.includes(id));
      await db.transaction(async (tx) => {
        if (removed.length > 0) {
          await tx.delete(eventEntryMembers).where(and(eq(eventEntryMembers.entryId, entry.id), inArray(eventEntryMembers.employeeId, removed)));
        }
        if (added.length > 0) {
          const base = Date.now();
          await tx.insert(eventEntryMembers).values(added.map((employeeId, i) => ({ competitionId: competition.id, employeeId, entryId: entry.id, joinedAt: new Date(base + i) })));
        }
        if (!next.includes(entry.captainId)) await tx.update(eventEntries).set({ captainId: next[0] }).where(eq(eventEntries.id, entry.id));
      });
      if (removed.length > 0) {
        await createNotifications(removed.filter((id) => id !== viewer.id), {
          ...NOTIFY,
          title: `از تیم «${changes.name ?? entry.name}» برداشته شدید`,
          message: `${fullName(viewer)} شما را از تیم «${changes.name ?? entry.name}» در «${competition.title}» برداشت.`,
          linkId: competition.id,
        });
      }
    }
    if (Object.keys(changes).length > 0) await db.update(eventEntries).set(changes).where(eq(eventEntries.id, entry.id));
    if (added.length > 0) {
      await createNotifications(added.filter((id) => id !== viewer.id), {
        ...NOTIFY,
        title: `شما در تیم «${changes.name ?? entry.name}» هستید`,
        message: `${fullName(viewer)} شما را به تیم «${changes.name ?? entry.name}» در «${competition.title}» اضافه کرد. اگر نمی‌خواهید، در صفحهٔ رویداد «خروج از تیم» را بزنید.`,
        linkId: competition.id,
      });
    }
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

/** A member leaves (a captain who leaves hands the team to the next member); the last one out removes the entry. */
specialEventsRouter.post(
  '/event_entries/:id/leave',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { entry, competition, ev, memberIds } = await entryOf(req.params.id);
    if (!memberIds.includes(viewer.id)) throw new HttpError(404, 'شما در این ثبت‌نام نیستید.');
    if (competition.drawnAt) throw new HttpError(400, 'قرعهٔ این مسابقه کشیده شده؛ برای انصراف با برگزارکننده هماهنگ کنید.');
    const rest = memberIds.filter((id) => id !== viewer.id);
    if (rest.length === 0) {
      await db.delete(eventEntries).where(eq(eventEntries.id, entry.id));
    } else {
      await db.delete(eventEntryMembers).where(and(eq(eventEntryMembers.entryId, entry.id), eq(eventEntryMembers.employeeId, viewer.id)));
      if (entry.captainId === viewer.id) await db.update(eventEntries).set({ captainId: rest[0] }).where(eq(eventEntries.id, entry.id));
      await createNotifications(rest, {
        ...NOTIFY,
        title: `${fullName(viewer)} از تیم «${entry.name}» خارج شد`,
        message:
          entry.captainId === viewer.id
            ? 'سرپرستی تیم به نفر بعدی رسید. اگر تیم کم‌نفر شده، همکار دیگری اضافه کنید.'
            : 'اگر تیم کم‌نفر شده، سرپرست می‌تواند همکار دیگری اضافه کند.',
        linkId: competition.id,
      });
    }
    await logAction(ev, viewer.id, 'انصراف', `${competition.title}: ${entry.name || fullName(viewer)}`);
    if (entry.status === 'in' && rest.length === 0) await promoteWaitlist(competition.id, ev);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

/** The captain (or an organizer) withdraws the whole entry. */
specialEventsRouter.delete(
  '/event_entries/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { entry, competition, ev, memberIds } = await entryOf(req.params.id);
    const organizer = rolesOf(ev, viewer).isOrganizer;
    if (entry.captainId !== viewer.id && !organizer) throw new HttpError(403, 'انصراف تیم با سرپرست آن است.');
    if (competition.drawnAt) throw new HttpError(400, 'قرعهٔ این مسابقه کشیده شده؛ به‌جای حذف، برای بازی‌اش «برد فنی» ثبت کنید.');
    await db.delete(eventEntries).where(eq(eventEntries.id, entry.id));
    const others = memberIds.filter((id) => id !== viewer.id);
    if (others.length > 0) {
      await createNotifications(others, {
        ...NOTIFY,
        title: `ثبت‌نام ${competition.kind === 'team' ? `تیم «${entry.name}»` : 'شما'} در «${competition.title}» لغو شد`,
        message: `${fullName(viewer)} ${competition.kind === 'team' ? 'تیم را از مسابقه خارج کرد' : 'ثبت‌نام شما را لغو کرد'}.`,
        linkId: competition.id,
      });
    }
    await logAction(ev, viewer.id, 'لغو ثبت‌نام', `${competition.title}: ${entry.name || 'فردی'}`);
    if (entry.status === 'in') await promoteWaitlist(competition.id, ev);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

// ─── The draw and the bracket ────────────────────────────────────────────────

/** A fair shuffle (Fisher–Yates) with the system's random numbers. */
function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Writes the result of settling a bracket back to its matches. */
async function settleCompetition(competition: Pick<CompetitionRow, 'id' | 'format'>) {
  // Only a knockout moves winners on; a points table and a ranking are all known from the draw.
  if (competition.format !== 'knockout') return [];
  const matches = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, competition.id));
  const changes = settleBracket(matches);
  for (const c of changes) {
    const before = matches.find((m) => m.id === c.id)!;
    const sidesChanged = before.entryA !== c.entryA || before.entryB !== c.entryB;
    await db
      .update(eventMatches)
      .set({
        entryA: c.entryA,
        entryB: c.entryB,
        winnerId: c.winnerId,
        done: Boolean(c.winnerId),
        bye: c.bye,
        ...(c.cleared || sidesChanged || c.bye
          ? { scoreA: null, scoreB: null, tieA: null, tieB: null, walkover: false, live: false, resultAt: c.bye ? new Date() : null, resultById: null }
          : {}),
        // A new pairing gets its reminders again.
        ...(sidesChanged ? { remindedAt: null, overdueRemindedAt: null } : {}),
      })
      .where(eq(eventMatches.id, c.id));
  }
  return changes;
}

/** Which matches are played on stage, from the competition's setting. */
async function applyStagePolicy(competitionId: string) {
  const [competition] = await db.select().from(eventCompetitions).where(eq(eventCompetitions.id, competitionId));
  const matches = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, competitionId));
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  for (const m of matches) {
    const onStage = competition.stagePolicy === 'all' || (competition.format === 'knockout' && competition.stagePolicy === 'final' && m.round === rounds && !m.third);
    if (m.onStage !== onStage) await db.update(eventMatches).set({ onStage }).where(eq(eventMatches.id, m.id));
  }
}

/** Suggested times for the daytime matches: one after another from the start, round by round. */
async function scheduleDaytime(competition: CompetitionRow, ev: EventRow) {
  const matches = await db
    .select()
    .from(eventMatches)
    .where(eq(eventMatches.competitionId, competition.id))
    .orderBy(asc(eventMatches.round), asc(eventMatches.third), asc(eventMatches.slot));
  const start = jalaliToDate(ev.programDate, competition.dayStart) ?? programStart(ev);
  let index = 0;
  for (const m of matches) {
    if (m.bye) continue;
    if (m.onStage) {
      await db.update(eventMatches).set({ day: ev.programDate, time: '', place: ev.programPlace }).where(eq(eventMatches.id, m.id));
      continue;
    }
    const at = new Date(start.getTime() + index * competition.slotMinutes * 60_000);
    index++;
    await db
      .update(eventMatches)
      .set({ day: toJalali(at), time: toJalali(at, 'HH:mm'), place: competition.dayPlace })
      .where(eq(eventMatches.id, m.id));
  }
}

async function draw(competition: CompetitionRow, ev: EventRow, by: string | null) {
  const entries = await db
    .select()
    .from(eventEntries)
    .where(and(eq(eventEntries.competitionId, competition.id), eq(eventEntries.status, 'in')));
  if (entries.length < 2) throw new HttpError(400, 'برای قرعه‌کشی دست‌کم دو شرکت‌کننده لازم است.');
  const order = shuffle(entries.map((e) => e.id));
  const rows: (typeof eventMatches.$inferInsert)[] = [];
  if (competition.format === 'league') {
    // Everyone plays everyone, round by round.
    roundRobin(order).forEach((pairs, r) =>
      pairs.forEach(([a, b], slot) => rows.push({ id: newId('match'), competitionId: competition.id, round: r + 1, slot, entryA: a, entryB: b })),
    );
  } else if (competition.format === 'ranking') {
    // The draw is the order of performing.
    order.forEach((entryId, slot) => rows.push({ id: newId('match'), competitionId: competition.id, round: 1, slot, entryA: entryId }));
  } else {
    const pairs = firstRoundPairs(order);
    const rounds = roundsFor(order.length);
    pairs.forEach(([a, b], slot) => rows.push({ id: newId('match'), competitionId: competition.id, round: 1, slot, entryA: a, entryB: b }));
    for (let round = 2; round <= rounds; round++) {
      for (let slot = 0; slot < 2 ** (rounds - round); slot++) rows.push({ id: newId('match'), competitionId: competition.id, round, slot });
    }
    if (competition.thirdPlace && rounds >= 2) rows.push({ id: newId('match'), competitionId: competition.id, round: rounds, slot: 1, third: true });
  }
  await db.transaction(async (tx) => {
    await tx.delete(eventMatches).where(eq(eventMatches.competitionId, competition.id));
    await tx.insert(eventMatches).values(rows);
    await tx.update(eventCompetitions).set({ drawnAt: new Date(), publishedAt: null, championPickId: null }).where(eq(eventCompetitions.id, competition.id));
  });
  await applyStagePolicy(competition.id);
  await settleCompetition(competition);
  await scheduleDaytime(competition, ev);
  // The waiting list did not get in; they are told when the bracket is published.
  await logAction(ev, by, 'قرعه‌کشی', `${competition.title}: ${toPersianDigits(entries.length)} شرکت‌کننده`);
}

/** Played results (not empty places) make a new draw impossible. */
async function hasPlayed(competitionId: string) {
  const played = await db
    .select({ id: eventMatches.id })
    .from(eventMatches)
    .where(and(eq(eventMatches.competitionId, competitionId), eq(eventMatches.bye, false), eq(eventMatches.done, true)))
    .limit(1);
  return played.length > 0;
}

specialEventsRouter.post(
  '/event_competitions/:id/draw',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireOrganizer(ev, viewer);
    if (await hasPlayed(competition.id)) throw new HttpError(400, 'نتیجهٔ بازی‌ای ثبت شده و دوباره قرعه‌کشی نمی‌شود.');
    const jurorsIn = await db
      .select({ id: eventEntryMembers.employeeId })
      .from(eventEntryMembers)
      .where(and(eq(eventEntryMembers.competitionId, competition.id), inArray(eventEntryMembers.employeeId, ev.juryIds.length ? ev.juryIds : ['-'])));
    if (jurorsIn.length > 0) throw new HttpError(400, 'یکی از داوران در این مسابقه ثبت‌نام شده است؛ اول او را خارج کنید.');
    await draw(competition, ev, viewer.id);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

/** Takes the draw back (before any match is played), so signup can change again. */
specialEventsRouter.delete(
  '/event_competitions/:id/draw',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireOrganizer(ev, viewer);
    if (await hasPlayed(competition.id)) throw new HttpError(400, 'نتیجهٔ بازی‌ای ثبت شده و قرعه پاک نمی‌شود.');
    await db.transaction(async (tx) => {
      await tx.delete(eventMatches).where(eq(eventMatches.competitionId, competition.id));
      await tx.update(eventCompetitions).set({ drawnAt: null, publishedAt: null }).where(eq(eventCompetitions.id, competition.id));
    });
    await logAction(ev, viewer.id, 'قرعه پاک شد', competition.title);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

/** Everyone sees the bracket; each player is told whom they play, when and where. */
async function publish(competition: CompetitionRow, ev: EventRow, by: string | null) {
  await db.update(eventCompetitions).set({ publishedAt: new Date() }).where(eq(eventCompetitions.id, competition.id));
  await logAction(ev, by, 'جدول منتشر شد', competition.title);
  if (ev.status !== 'active') return;
  await announcePairs({ ...competition, publishedAt: new Date() }, ev);
  const waiting = await db
    .select({ id: eventEntryMembers.employeeId })
    .from(eventEntryMembers)
    .innerJoin(eventEntries, eq(eventEntries.id, eventEntryMembers.entryId))
    .where(and(eq(eventEntryMembers.competitionId, competition.id), eq(eventEntries.status, 'waitlist')));
  if (waiting.length > 0) {
    await createNotifications(waiting.map((w) => w.id), {
      ...NOTIFY,
      title: `جدول «${competition.title}» منتشر شد`,
      message: 'جا برای شما باز نشد و در فهرست انتظار ماندید. اگر کسی نیاید، برگزارکننده خبرتان می‌کند.',
      linkId: competition.id,
    });
  }
}

specialEventsRouter.post(
  '/event_competitions/:id/publish',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireOrganizer(ev, viewer);
    if (!competition.drawnAt) throw new HttpError(400, 'اول قرعه‌کشی کنید.');
    if (competition.publishedAt) throw new HttpError(400, 'این جدول منتشر شده است.');
    await publish(competition, ev, viewer.id);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

const memberIdsOf = async (entryIds: (string | null)[]) => {
  const ids = entryIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map<string, string[]>();
  const rows = await db.select().from(eventEntryMembers).where(inArray(eventEntryMembers.entryId, ids));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.entryId, [...(map.get(r.entryId) ?? []), r.employeeId]);
  return map;
};

async function entryNames(entryIds: (string | null)[]) {
  const ids = entryIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map<string, string>();
  const entries = await db.select().from(eventEntries).where(inArray(eventEntries.id, ids));
  const members = await memberIdsOf(ids);
  const people = await peopleById([...members.values()].flat());
  return new Map(
    entries.map((e) => [e.id, e.name || (members.get(e.id) ?? []).map((p) => people[p]?.name ?? '').join('، ')]),
  );
}

const whenWhere = (m: Pick<MatchRow, 'onStage' | 'time' | 'place' | 'day'>, ev: EventRow) =>
  m.onStage
    ? `روی صحنهٔ برنامه${ev.programTime ? ` (از ساعت ${toPersianDigits(ev.programTime)})` : ''}`
    : m.time
      ? `ساعت ${toPersianDigits(m.time)}${m.day && m.day !== ev.programDate ? ` روز ${toPersianDigits(m.day)}` : ''}${m.place ? `، ${m.place}` : ''}`
      : 'ساعتش را برگزارکننده اعلام می‌کند';

/** Tells both sides of every pairing they have not heard about whom they play next. */
const pairKey = (m: Pick<MatchRow, 'entryA' | 'entryB'>) => `${m.entryA}|${m.entryB ?? ''}`;

async function announcePairs(competition: CompetitionRow, ev: EventRow) {
  if (!competition.publishedAt || ev.status !== 'active') return;
  const matches = await db
    .select()
    .from(eventMatches)
    .where(eq(eventMatches.competitionId, competition.id))
    .orderBy(asc(eventMatches.round), asc(eventMatches.slot));
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  const fresh = matches.filter((m) => isReady(m, competition.format) && !m.done && m.announcedPair !== pairKey(m));
  if (fresh.length === 0) return;
  const names = await entryNames(fresh.flatMap((m) => [m.entryA, m.entryB]));
  const members = await memberIdsOf(fresh.flatMap((m) => [m.entryA, m.entryB]));
  const markAnnounced = async (list: MatchRow[]) => {
    for (const m of list) await db.update(eventMatches).set({ announcedPair: pairKey(m) }).where(eq(eventMatches.id, m.id));
  };

  if (competition.format === 'ranking') {
    for (const m of fresh) {
      await createNotifications(members.get(m.entryA!) ?? [], {
        ...NOTIFY,
        title: `${competition.title}: نوبت ${toPersianDigits(m.slot + 1)} از ${toPersianDigits(matches.length)} با شماست`,
        message: `اجرای شما ${whenWhere(m, ev)}.`,
        linkId: competition.id,
      });
    }
    await markAnnounced(fresh);
    return;
  }

  if (competition.format === 'league') {
    // One note per entry with all its matches, rather than one per match.
    for (const entryId of new Set(fresh.flatMap(sidesOf))) {
      const own = fresh.filter((m) => m.entryA === entryId || m.entryB === entryId);
      const first = own[0];
      const rival = first.entryA === entryId ? first.entryB : first.entryA;
      await createNotifications(members.get(entryId) ?? [], {
        ...NOTIFY,
        title: `${competition.title}: ${toPersianDigits(own.length)} بازی جدول امتیازی برای شما`,
        message: `اولی ${whenWhere(first, ev)}، مقابل ${names.get(rival!) ?? ''}. همهٔ بازی‌ها و جدول را در صفحهٔ رویداد ببینید.`,
        linkId: competition.id,
      });
    }
    await markAnnounced(fresh);
    return;
  }

  for (const m of fresh) {
    for (const [own, other] of [
      [m.entryA!, m.entryB!],
      [m.entryB!, m.entryA!],
    ]) {
      await createNotifications(members.get(own) ?? [], {
        ...NOTIFY,
        title: `${competition.title}، ${matchLabel(m, rounds, competition.format)}: حریف شما ${names.get(other) ?? ''}`,
        message: `بازی شما ${whenWhere(m, ev)}.`,
        linkId: competition.id,
      });
    }
    await markAnnounced([m]);
  }
}

/** Once the final is decided, everyone hears who won (once). */
async function announceChampion(competition: CompetitionRow, ev: EventRow) {
  if (competition.championAnnouncedAt || ev.status !== 'active') return;
  const matches = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, competition.id));
  const { champion } = championInfo(competition, matches);
  if (!champion) return;
  const claimed = await db
    .update(eventCompetitions)
    .set({ championAnnouncedAt: new Date() })
    .where(and(eq(eventCompetitions.id, competition.id), isNull(eventCompetitions.championAnnouncedAt)))
    .returning({ id: eventCompetitions.id });
  if (claimed.length === 0) return;
  const names = await entryNames([champion]);
  await createNotifications(await audienceIds(), {
    ...NOTIFY,
    title: `🏆 قهرمان ${competition.title}: ${names.get(champion) ?? ''}`,
    message: `${ev.title}: جدول کامل «${competition.title}» را در صفحهٔ رویداد ببینید.`,
    linkId: competition.id,
  });
}

/** Moves every daytime match of a competition not yet played by some minutes (when the day runs late). */
specialEventsRouter.post(
  '/event_competitions/:id/shift',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireReferee(ev, viewer);
    const { minutes } = parse(z.object({ minutes: z.number().int().min(-120).max(240).refine((v) => v !== 0) }), req.body);
    const matches = await db
      .select()
      .from(eventMatches)
      .where(and(eq(eventMatches.competitionId, competition.id), eq(eventMatches.onStage, false), eq(eventMatches.done, false)));
    const moved: MatchRow[] = [];
    for (const m of matches) {
      const start = matchStart(m);
      if (!start) continue;
      const at = new Date(start.getTime() + minutes * 60_000);
      const [row] = await db
        .update(eventMatches)
        .set({ day: toJalali(at), time: toJalali(at, 'HH:mm'), remindedAt: null, overdueRemindedAt: null })
        .where(eq(eventMatches.id, m.id))
        .returning();
      moved.push(row);
    }
    if (competition.publishedAt && ev.status === 'active') {
      const ready = moved.filter((x) => isReady(x, competition.format));
      const members = await memberIdsOf(ready.flatMap(sidesOf));
      for (const m of ready) {
        await createNotifications(sidesOf(m).flatMap((e) => members.get(e) ?? []), {
          ...NOTIFY,
          title: `ساعت بازی شما در «${competition.title}» عوض شد`,
          message: `بازی شما حالا ${whenWhere(m, ev)}.`,
          linkId: competition.id,
        });
      }
    }
    await logAction(ev, viewer.id, 'جابه‌جایی ساعت بازی‌ها', `${competition.title}: ${toPersianDigits(Math.abs(minutes))} دقیقه ${minutes > 0 ? 'دیرتر' : 'زودتر'}`);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

/** First place of a finished points table or ranking is shared: the jury (or the organizers) pick the champion. */
specialEventsRouter.post(
  '/event_competitions/:id/champion',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    if (!rolesOf(ev, viewer).decides) throw new HttpError(403, ev.juryIds.length > 0 ? 'انتخاب قهرمان با هیئت داوران است.' : 'انتخاب قهرمان با برگزارکنندگان است.');
    const { entryId } = parse(z.object({ entryId: z.string().min(1) }), req.body);
    const matches = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, competition.id));
    const { tie } = championInfo({ ...competition, championPickId: null }, matches);
    if (!tie.includes(entryId)) throw new HttpError(400, 'قهرمان را از میان کسانی که رتبهٔ اول مشترک دارند انتخاب کنید.');
    await db.update(eventCompetitions).set({ championPickId: entryId }).where(eq(eventCompetitions.id, competition.id));
    const names = await entryNames([entryId]);
    await logAction(ev, viewer.id, 'انتخاب قهرمان از میان برابرها', `${competition.title}: ${names.get(entryId) ?? ''}`);
    await announceChampion({ ...competition, championPickId: entryId }, ev);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

/**
 * «کارت کلمه» of a pantomime: the organizer's phone shows the next word nobody has had yet (players and
 * the big screen never see the list), or starts the list again.
 */
specialEventsRouter.post(
  '/event_competitions/:id/word',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { competition, ev } = await competitionOf(req.params.id);
    requireReferee(ev, viewer);
    const { action } = parse(z.object({ action: z.enum(['next', 'reset']) }), req.body);
    const total = competition.words.length;
    if (total === 0) throw new HttpError(400, 'برای این مسابقه کلمه‌ای وارد نشده است؛ در ویرایش مسابقه کلمه‌ها را بنویسید.');
    if (action === 'reset') {
      await db.update(eventCompetitions).set({ usedWords: [] }).where(eq(eventCompetitions.id, competition.id));
      res.json({ word: null, left: total, total });
      return;
    }
    const unused = competition.words.filter((w) => !competition.usedWords.includes(w));
    if (unused.length === 0) throw new HttpError(400, 'کلمه‌ها تمام شد؛ «از اول» را بزنید یا کلمهٔ تازه اضافه کنید.');
    const word = unused[randomInt(unused.length)];
    await db
      .update(eventCompetitions)
      .set({ usedWords: [...competition.usedWords, word] })
      .where(eq(eventCompetitions.id, competition.id));
    res.json({ word, left: unused.length - 1, total });
  }),
);

// ─── Matches: times, results, corrections ────────────────────────────────────

async function matchOf(id: string) {
  const [match] = await db.select().from(eventMatches).where(eq(eventMatches.id, id));
  if (!match) throw new HttpError(404, 'این بازی پیدا نشد.');
  const { competition, ev } = await competitionOf(match.competitionId);
  return { match, competition, ev };
}

const matchPatchSchema = z.object({
  day: z.string().refine((v) => v === '' || isValidJalaliDate(v), 'روز بازی را درست وارد کنید.').optional(),
  time: z.string().refine((v) => v === '' || TIME_RE.test(v), 'ساعت را به شکل ۱۰:۲۰ وارد کنید.').optional(),
  place: z.string().trim().max(PLACE_MAX).optional(),
  onStage: z.boolean().optional(),
});

specialEventsRouter.patch(
  '/event_matches/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { match, competition, ev } = await matchOf(req.params.id);
    requireReferee(ev, viewer);
    const input = parse(matchPatchSchema, req.body);
    const timeChanged = (input.day !== undefined && input.day !== match.day) || (input.time !== undefined && input.time !== match.time);
    const [updated] = await db
      .update(eventMatches)
      .set({ ...input, ...(timeChanged ? { remindedAt: null, overdueRemindedAt: null } : {}) })
      .where(eq(eventMatches.id, match.id))
      .returning();
    if (timeChanged && competition.publishedAt && ev.status === 'active' && isReady(updated, competition.format) && !updated.done) {
      const members = await memberIdsOf(sidesOf(updated));
      await createNotifications(sidesOf(updated).flatMap((e) => members.get(e) ?? []), {
        ...NOTIFY,
        title: `ساعت بازی شما در «${competition.title}» عوض شد`,
        message: `بازی شما حالا ${whenWhere(updated, ev)}.`,
        linkId: competition.id,
      });
    }
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

const score = z.number().int().min(0).max(999);
const resultSchema = z.object({
  scoreA: score.nullable().optional(),
  scoreB: score.nullable().optional(),
  tieA: score.nullable().optional(),
  tieB: score.nullable().optional(),
  winnerId: z.string().nullable().optional(),
  // The other side did not come: the winner goes through without a score (in a ranking: did not perform).
  walkover: z.boolean().optional(),
  // A ranking's score, or its time in tenths of a second.
  value: z.number().int().min(0).max(RANK_VALUE_MAX).nullable().optional(),
  // Needed when a result already entered is changed; kept in the history.
  reason: z.string().trim().max(300).optional(),
});

/** Works out the winner of a played match from the scores and the competition's tie rule. */
interface Decided {
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  tieA: number | null;
  tieB: number | null;
  walkover: boolean;
  done: true;
}

function decide(competition: CompetitionRow, match: MatchRow, input: z.infer<typeof resultSchema>): Decided {
  const sides = [match.entryA, match.entryB];
  const none = { scoreA: null, scoreB: null, tieA: null, tieB: null, done: true as const };
  if (competition.format === 'ranking') {
    if (input.walkover) return { ...none, winnerId: null, walkover: true };
    if (input.value === null || input.value === undefined) throw new HttpError(400, competition.rankBy === 'time' ? 'زمان را وارد کنید.' : 'امتیاز را وارد کنید.');
    return { ...none, winnerId: null, scoreA: input.value, walkover: false };
  }
  if (input.walkover) {
    if (!input.winnerId || !sides.includes(input.winnerId)) throw new HttpError(400, 'برندهٔ برد فنی را انتخاب کنید.');
    return { ...none, winnerId: input.winnerId, walkover: true };
  }
  if (competition.scoring === 'winner') {
    if (!input.winnerId || !sides.includes(input.winnerId)) throw new HttpError(400, 'برنده را انتخاب کنید.');
    return { ...none, winnerId: input.winnerId, walkover: false };
  }
  const a = input.scoreA;
  const b = input.scoreB;
  if (a === null || a === undefined || b === null || b === undefined) throw new HttpError(400, 'نتیجهٔ هر دو طرف را وارد کنید.');
  if (a !== b) return { winnerId: a > b ? match.entryA : match.entryB, scoreA: a, scoreB: b, tieA: null, tieB: null, walkover: false, done: true };
  // A draw counts as a draw in a points table.
  if (competition.format === 'league') return { winnerId: null, scoreA: a, scoreB: b, tieA: null, tieB: null, walkover: false, done: true };
  if (competition.tieRule === 'penalties') {
    const ta = input.tieA;
    const tb = input.tieB;
    if (ta === null || ta === undefined || tb === null || tb === undefined || ta === tb) {
      throw new HttpError(400, 'بازی مساوی است؛ نتیجهٔ پنالتی را وارد کنید (مساوی نباشد).');
    }
    return { winnerId: ta > tb ? match.entryA : match.entryB, scoreA: a, scoreB: b, tieA: ta, tieB: tb, walkover: false, done: true };
  }
  if (!input.winnerId || !sides.includes(input.winnerId)) {
    throw new HttpError(400, competition.tieRule === 'extra' ? 'بازی مساوی است؛ بعد از دور اضافه نتیجهٔ نهایی را وارد کنید یا برنده را انتخاب کنید.' : 'بازی مساوی است؛ برنده را انتخاب کنید.');
  }
  return { winnerId: input.winnerId, scoreA: a, scoreB: b, tieA: null, tieB: null, walkover: false, done: true };
}

const scoreText = (r: { scoreA: number | null; scoreB: number | null; tieA: number | null; tieB: number | null; walkover: boolean }) =>
  r.walkover
    ? 'برد فنی'
    : r.scoreA === null || r.scoreB === null
      ? ''
      : `${toPersianDigits(r.scoreA)} – ${toPersianDigits(r.scoreB)}${r.tieA !== null && r.tieB !== null ? ` (پنالتی ${toPersianDigits(r.tieA)} – ${toPersianDigits(r.tieB)})` : ''}`;

specialEventsRouter.post(
  '/event_matches/:id/result',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { match, competition, ev } = await matchOf(req.params.id);
    requireReferee(ev, viewer);
    if (!isReady(match, competition.format)) throw new HttpError(400, 'دو طرف این بازی هنوز مشخص نیستند.');
    const input = parse(resultSchema, req.body);
    const correction = match.done;
    if (correction && (!input.reason || input.reason.length < 3)) throw new HttpError(400, 'برای اصلاح نتیجه، دلیل آن را بنویسید (در تاریخچه می‌ماند).');
    const result = decide(competition, match, input);

    // A changed winner clears the later matches that were played with the old one.
    const before = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, competition.id));
    await db
      .update(eventMatches)
      .set({ ...result, live: false, resultById: viewer.id, resultAt: new Date() })
      .where(eq(eventMatches.id, match.id));
    const changes = await settleCompetition(competition);
    const cleared = changes.filter((c) => c.cleared).map((c) => before.find((m) => m.id === c.id)!.id);

    const names = await entryNames([match.entryA, match.entryB]);
    const ranking = competition.format === 'ranking';
    const line = ranking
      ? `${names.get(match.entryA!)}: ${result.walkover ? 'اجرا نکرد' : formatRankValue(result.scoreA, competition.rankBy)}`
      : `${names.get(match.entryA!)} ${scoreText(result)} ${names.get(match.entryB!)}`.replace(/\s+/g, ' ');
    const outcome = ranking ? '' : result.winnerId ? `؛ برنده ${names.get(result.winnerId) ?? ''}` : '؛ مساوی';
    await logAction(
      ev,
      viewer.id,
      correction ? 'اصلاح نتیجه' : result.walkover ? (ranking ? 'غیبت' : 'برد فنی') : 'ثبت نتیجه',
      `${competition.title}: ${line}${outcome}${correction ? `. دلیل: ${input.reason}` : ''}${cleared.length > 0 ? `. ${toPersianDigits(cleared.length)} بازی بعدی پاک شد.` : ''}`,
      match.id,
    );

    // First place shared once everything is played: the jury (or the organizers) pick the champion.
    const after = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, competition.id));
    const { tie } = championInfo(competition, after);
    if (tie.length > 0) {
      const tied = await entryNames(tie);
      await createNotifications(ev.juryIds.length > 0 ? ev.juryIds : ev.organizerIds, {
        ...NOTIFY,
        title: `رتبهٔ اول «${competition.title}» مساوی شد`,
        message: `${tie.map((id) => tied.get(id)).join('، ')} برابرند؛ قهرمان را در صفحهٔ رویداد انتخاب کنید.`,
        linkId: competition.id,
      });
    }

    if (competition.publishedAt && ev.status === 'active') {
      const members = await memberIdsOf(sidesOf(match));
      await createNotifications(sidesOf(match).flatMap((e) => members.get(e) ?? []), {
        ...NOTIFY,
        title: correction ? `نتیجهٔ بازی شما در «${competition.title}» اصلاح شد` : `نتیجهٔ بازی شما در «${competition.title}» ثبت شد`,
        message: `${line}. ${correction ? `دلیل: ${input.reason}. ` : ''}اگر به نتیجه اعتراض دارید، در صفحهٔ رویداد «اعتراض به نتیجه» را بزنید.`,
        linkId: competition.id,
      });
      const fresh = await db.select().from(eventCompetitions).where(eq(eventCompetitions.id, competition.id));
      await announcePairs(fresh[0], ev);
      await announceChampion(fresh[0], ev);
    }
    announceChange(ev);
    res.json({ cleared, view: await eventView(ev, viewer) });
  }),
);

/** The score of a match being played on stage, as the remote moves it (no winner yet). */
specialEventsRouter.post(
  '/event_matches/:id/live',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { match, competition, ev } = await matchOf(req.params.id);
    requireReferee(ev, viewer);
    if (!isReady(match, competition.format) || match.done) throw new HttpError(400, 'این بازی در جریان نیست.');
    const input = parse(z.object({ scoreA: score, scoreB: score, live: z.boolean().optional() }), req.body);
    await db
      .update(eventMatches)
      .set({ scoreA: input.scoreA, scoreB: input.scoreB, live: input.live ?? true })
      .where(eq(eventMatches.id, match.id));
    announceChange(ev);
    res.json({ ok: true });
  }),
);

/** «برگردان»: the one who just entered a result takes it back within a few seconds. */
specialEventsRouter.post(
  '/event_matches/:id/undo',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { match, competition, ev } = await matchOf(req.params.id);
    requireReferee(ev, viewer);
    if (!match.done || match.bye || match.resultById !== viewer.id || !match.resultAt || Date.now() - match.resultAt.getTime() > RESULT_UNDO_MS + 5000) {
      throw new HttpError(400, 'وقت برگرداندن گذشته است؛ برای تغییر نتیجه «اصلاح نتیجه» را بزنید.');
    }
    await db
      .update(eventMatches)
      .set({ winnerId: null, done: false, scoreA: null, scoreB: null, tieA: null, tieB: null, walkover: false, resultAt: null, resultById: null })
      .where(eq(eventMatches.id, match.id));
    await settleCompetition(competition);
    await logAction(ev, viewer.id, 'نتیجه برگردانده شد', competition.title, match.id);
    announceChange(ev);
    res.json(await eventView(ev, viewer));
  }),
);

// ─── Objections (players → jury) ─────────────────────────────────────────────

specialEventsRouter.post(
  '/event_matches/:id/objections',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { match, competition, ev } = await matchOf(req.params.id);
    const { text } = parse(z.object({ text: z.string().trim().min(3, 'دلیل اعتراض را بنویسید.').max(OBJECTION_MAX) }), req.body);
    const members = await memberIdsOf([match.entryA, match.entryB]);
    const playing = [...(members.get(match.entryA ?? '') ?? []), ...(members.get(match.entryB ?? '') ?? [])];
    if (!playing.includes(viewer.id)) throw new HttpError(403, 'فقط بازیکنان همین بازی می‌توانند به نتیجه‌اش اعتراض کنند.');
    if (!match.done || match.bye) throw new HttpError(400, 'نتیجهٔ این بازی هنوز ثبت نشده است.');
    if (phaseOf(ev) === 'ended') throw new HttpError(400, 'رویداد تمام شده است.');
    const open = await db
      .select({ id: eventObjections.id })
      .from(eventObjections)
      .where(and(eq(eventObjections.matchId, match.id), eq(eventObjections.byId, viewer.id), eq(eventObjections.status, 'open')));
    if (open.length > 0) throw new HttpError(400, 'اعتراض قبلی شما به همین بازی هنوز بررسی نشده است.');
    await db.insert(eventObjections).values({ id: newId('objection'), eventId: ev.id, matchId: match.id, byId: viewer.id, text });
    const deciders = ev.juryIds.length > 0 ? ev.juryIds : ev.organizerIds;
    await createNotifications(deciders, {
      ...NOTIFY,
      title: `اعتراض به نتیجه در «${competition.title}»`,
      message: `${fullName(viewer)}: ${text.length > 120 ? `${text.slice(0, 119)}…` : text}`,
      linkId: 'objections',
    });
    await logAction(ev, viewer.id, 'اعتراض به نتیجه', `${competition.title}: ${text}`, match.id);
    for (const id of new Set([...deciders, ...ev.organizerIds, viewer.id])) signalUser(id, 'special_event');
    res.status(201).json(await eventView(ev, viewer));
  }),
);

specialEventsRouter.post(
  '/event_objections/:id/decide',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [objection] = await db.select().from(eventObjections).where(eq(eventObjections.id, req.params.id));
    if (!objection) throw new HttpError(404, 'این اعتراض پیدا نشد.');
    const ev = await eventOf(objection.eventId);
    if (!rolesOf(ev, viewer).decides) throw new HttpError(403, 'رسیدگی به اعتراض با هیئت داوران است.');
    if (objection.status !== 'open') throw new HttpError(400, 'به این اعتراض قبلاً رسیدگی شده است.');
    const input = parse(
      z.object({ status: z.enum(['accepted', 'rejected']), decision: z.string().trim().min(2, 'پاسخ داوران را بنویسید.').max(OBJECTION_MAX) }),
      req.body,
    );
    // Whoever takes it first decides it; a second tap at the same moment finds it decided.
    const claimed = await db
      .update(eventObjections)
      .set({ status: input.status, decision: input.decision, decidedById: viewer.id, decidedAt: new Date() })
      .where(and(eq(eventObjections.id, objection.id), eq(eventObjections.status, 'open')))
      .returning({ id: eventObjections.id });
    if (claimed.length === 0) throw new HttpError(400, 'به این اعتراض قبلاً رسیدگی شده است.');
    await createNotifications([objection.byId], {
      ...NOTIFY,
      title: input.status === 'accepted' ? 'اعتراض شما پذیرفته شد' : 'اعتراض شما رد شد',
      message: `پاسخ داوران: ${input.decision}`,
    });
    await logAction(ev, viewer.id, input.status === 'accepted' ? 'اعتراض پذیرفته شد' : 'اعتراض رد شد', input.decision, objection.matchId);
    for (const id of new Set([...ev.juryIds, ...ev.organizerIds, objection.byId])) signalUser(id, 'special_event');
    res.json(await eventView(ev, viewer));
  }),
);

// ─── The big screen and the remote ───────────────────────────────────────────

const screenSchema = z.object({
  scene: z.enum(SCREEN_SCENES.map((s) => s.id) as [string, ...string[]]),
  competitionId: z.string().nullable().optional(),
  matchId: z.string().nullable().optional(),
  caption: z.string().trim().max(120).optional(),
  awardId: z.string().max(100).nullable().optional(),
  falIndex: z.number().int().min(0).max(HAFEZ_FAL.length - 1).nullable().optional(),
});

export async function saveScreen(ev: EventRow, screen: ScreenState) {
  await db.update(specialEvents).set({ screen }).where(eq(specialEvents.id, ev.id));
  for (const id of new Set([...ev.organizerIds, ...ev.juryIds])) signalUser(id, 'special_event');
}

specialEventsRouter.put(
  '/special_events/:id/screen',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    const input = parse(screenSchema, req.body);
    const current = ev.screen ?? DEFAULT_SCREEN;
    const screen: ScreenState = {
      ...current,
      scene: input.scene as ScreenState['scene'],
      competitionId: input.competitionId ?? null,
      matchId: input.matchId ?? null,
      caption: input.caption ?? '',
      awardId: input.awardId ?? null,
      falIndex: input.falIndex ?? null,
      version: current.version + 1,
    };
    await saveScreen(ev, screen);
    res.json(screen);
  }),
);

specialEventsRouter.post(
  '/special_events/:id/screen/timer',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    const input = parse(
      z.object({ action: z.enum(['start', 'stop', 'reset']), durationSec: z.number().int().min(5).max(3600).optional() }),
      req.body,
    );
    const current = ev.screen ?? DEFAULT_SCREEN;
    const left = timerLeft(current.timer);
    const duration = input.durationSec ?? current.timer.durationSec;
    const timer =
      input.action === 'start'
        ? { durationSec: duration, endsAt: new Date(Date.now() + (left > 0 ? left : duration) * 1000).toISOString(), remainingSec: left > 0 ? left : duration }
        : input.action === 'stop'
          ? { durationSec: duration, endsAt: null, remainingSec: left }
          : { durationSec: duration, endsAt: null, remainingSec: duration };
    const screen = { ...current, timer, version: current.version };
    await saveScreen(ev, screen);
    res.json(screen);
  }),
);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** An organizer types the code a big screen shows; from then on that screen shows this event. */
specialEventsRouter.post(
  '/special_events/:id/screens/pair',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    const { code } = parse(z.object({ code: z.string().regex(/^\d{4}$/, 'کد ۴ رقمی روی صفحهٔ بزرگ را وارد کنید.') }), req.body);
    const now = new Date();
    const paired = await db
      .update(eventScreens)
      .set({ eventId: ev.id, pairedById: viewer.id, pairedAt: now, expiresAt: new Date(now.getTime() + SCREEN_SESSION_HOURS * 3600_000) })
      .where(and(eq(eventScreens.code, code), isNull(eventScreens.pairedAt), gt(eventScreens.expiresAt, now)))
      .returning({ id: eventScreens.id });
    if (paired.length === 0) throw new HttpError(400, 'این کد پیدا نشد یا وقتش گذشته است؛ کدی را که الان روی صفحهٔ بزرگ است وارد کنید.');
    await logAction(ev, viewer.id, 'صفحهٔ بزرگ وصل شد');
    res.json({ ok: true });
  }),
);

// ─── Scheduled work (every minute) ───────────────────────────────────────────

/** The day signup's last reminder goes out: the last working day before signup closes. */
function signupReminderDay(signupEnd: string) {
  let day = addJalaliDays(signupEnd, -1);
  for (let guard = 0; guard < 7 && workdaysBetween(day, day) === 0; guard++) day = addJalaliDays(day, -1);
  return day;
}

export async function claimReminder(ev: EventRow, key: string) {
  if (ev.sentReminders.includes(key)) return false;
  const [row] = await db.select({ sent: specialEvents.sentReminders }).from(specialEvents).where(eq(specialEvents.id, ev.id));
  if (!row || row.sent.includes(key)) return false;
  await db.update(specialEvents).set({ sentReminders: [...row.sent, key] }).where(eq(specialEvents.id, ev.id));
  return true;
}

/**
 * Everything that happens on its own: the reminder before signup closes, the draw at the start of the
 * bracket days (published at 10:00 if no organizer did), reminders before daytime matches, a nudge to
 * organizers when a result is late, and the reminder before the program.
 */
export async function processSpecialEvents(now = new Date()) {
  const events = await db.select().from(specialEvents).where(eq(specialEvents.status, 'active'));
  let changed = false;
  for (const ev of events) {
    const phase = eventPhase(ev, now);
    if (phase === 'ended') continue;
    await processAwards(ev, now);
    const today = toJalali(now);
    const hour = now.getHours();

    if (phase === 'signup' && today >= signupReminderDay(ev.signupEnd) && hour >= 10 && (await claimReminder(ev, 'signup'))) {
      await createNotifications(await audienceIds(), {
        ...NOTIFY,
        title: `${ev.title}: ثبت‌نام به‌زودی بسته می‌شود`,
        message: `مهلت ثبت‌نام در مسابقات تا ${toPersianDigits(ev.signupEnd)} است.`,
      });
      const { competitions, entries, members } = await competitionsOf(ev.id);
      for (const c of competitions.filter((x) => x.kind === 'team' && !x.drawnAt)) {
        for (const e of entries.filter((x) => x.competitionId === c.id && x.status === 'in')) {
          const count = members.filter((m) => m.entryId === e.id).length;
          if (count >= c.teamMin) continue;
          await createNotifications([e.captainId], {
            ...NOTIFY,
            title: `تیم «${e.name}» ${toPersianDigits(c.teamMin - count)} نفر کم دارد`,
            message: `تا پایان ثبت‌نام (${toPersianDigits(ev.signupEnd)}) همکاران تیم «${c.title}» را کامل کنید؛ وگرنه برگزارکننده تصمیم می‌گیرد.`,
            linkId: c.id,
          });
        }
      }
    }

    if (phase !== 'signup') {
      const competitions = await db.select().from(eventCompetitions).where(eq(eventCompetitions.eventId, ev.id));
      for (const c of competitions) {
        if (!c.drawnAt) {
          if ((await inCount(c.id)) < 2) continue;
          await draw(c, ev, null);
          changed = true;
        }
        // The organizers have until 10:00 of the first bracket day to look the draw over.
        if (!c.publishedAt && (hour >= 10 || phase !== 'brackets')) {
          await publish(c, ev, null);
          changed = true;
        }
      }
    }

    if (phase === 'brackets' || phase === 'matchday' || phase === 'live') {
      const { competitions, matches } = await competitionsOf(ev.id);
      const byId = new Map(competitions.map((c) => [c.id, c]));
      for (const m of matches) {
        const c = byId.get(m.competitionId);
        if (!c?.publishedAt || m.onStage || m.done || !isReady(m, c.format)) continue;
        const start = matchStart(m);
        if (!start) continue;
        const startMs = start.getTime();
        if (!m.remindedAt && now.getTime() >= startMs - MATCH_REMIND_MINUTES * 60_000 && now.getTime() < startMs + c.slotMinutes * 60_000) {
          const claimed = await db
            .update(eventMatches)
            .set({ remindedAt: now })
            .where(and(eq(eventMatches.id, m.id), isNull(eventMatches.remindedAt)))
            .returning({ id: eventMatches.id });
          if (claimed.length > 0) {
            const names = await entryNames([m.entryA, m.entryB]);
            const members = await memberIdsOf(sidesOf(m));
            if (c.format === 'ranking') {
              await createNotifications(members.get(m.entryA!) ?? [], {
                ...NOTIFY,
                title: `نوبت اجرای شما در «${c.title}» ساعت ${toPersianDigits(m.time)}`,
                message: m.place ? `${m.place}.` : 'محل را برگزارکننده اعلام می‌کند.',
                linkId: c.id,
              });
            }
            for (const [own, other] of c.format === 'ranking'
              ? []
              : [
                  [m.entryA!, m.entryB!],
                  [m.entryB!, m.entryA!],
                ]) {
              await createNotifications(members.get(own) ?? [], {
                ...NOTIFY,
                title: `بازی شما در «${c.title}» ساعت ${toPersianDigits(m.time)}`,
                message: `${m.place ? `${m.place}، ` : ''}مقابل ${names.get(other) ?? ''}.`,
                linkId: c.id,
              });
            }
          }
        }
        if (!m.overdueRemindedAt && now.getTime() >= startMs + (c.slotMinutes + RESULT_OVERDUE_MINUTES) * 60_000) {
          const claimed = await db
            .update(eventMatches)
            .set({ overdueRemindedAt: now })
            .where(and(eq(eventMatches.id, m.id), isNull(eventMatches.overdueRemindedAt)))
            .returning({ id: eventMatches.id });
          if (claimed.length > 0) {
            const names = await entryNames([m.entryA, m.entryB]);
            await createNotifications(ev.organizerIds, {
              ...NOTIFY,
              title: `نتیجهٔ بازی ساعت ${toPersianDigits(m.time)} «${c.title}» ثبت نشده`,
              message: `${sidesOf(m)
                .map((e) => names.get(e))
                .join(' و ')}. اگر بازی عقب افتاده، ساعت‌ها را جلو ببرید.`,
              linkId: 'console',
            });
          }
        }
      }
    }

    const start = programStart(ev).getTime();
    if (
      today === ev.programDate &&
      now.getTime() >= start - PROGRAM_REMIND_MINUTES * 60_000 &&
      now.getTime() < start + 60 * 60_000 &&
      (await claimReminder(ev, 'program'))
    ) {
      await createNotifications(await audienceIds(), {
        ...NOTIFY,
        title: `${ev.title} تا ${toPersianDigits(PROGRAM_REMIND_MINUTES)} دقیقهٔ دیگر`,
        message: `ساعت ${toPersianDigits(ev.programTime)}${ev.programPlace ? `، ${ev.programPlace}` : ''}. منتظرتان هستیم!`,
      });
    }
  }
  if (changed) broadcastChange('special_event');
}

/** Screens whose code or session ran out are forgotten. */
export async function removeStaleScreens(now = new Date()) {
  await db.delete(eventScreens).where(or(lt(eventScreens.expiresAt, now), and(isNull(eventScreens.pairedAt), lt(eventScreens.createdAt, new Date(now.getTime() - 24 * 3600_000)))));
}

// ─── The screen's own API (no account; a cookie from pairing) ────────────────

export const SCREEN_COOKIE = 'roya_screen';

export function newScreenToken() {
  return randomBytes(32).toString('hex');
}

/** A 4-digit code not shown on another waiting screen. */
export async function newScreenCode() {
  const waiting = await db
    .select({ code: eventScreens.code })
    .from(eventScreens)
    .where(and(isNull(eventScreens.pairedAt), gt(eventScreens.expiresAt, new Date())));
  const taken = new Set(waiting.map((w) => w.code));
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(1000, 10000));
    if (!taken.has(code)) return code;
  }
  throw new HttpError(503, 'الان صفحه‌های زیادی منتظر وصل شدن هستند؛ چند دقیقهٔ دیگر دوباره امتحان کنید.');
}

export async function createScreen() {
  const token = newScreenToken();
  const code = await newScreenCode();
  const expiresAt = new Date(Date.now() + SCREEN_CODE_MINUTES * 60_000);
  await db.insert(eventScreens).values({ id: newId('screen'), tokenHash: hashToken(token), code, expiresAt });
  return { token, code, expiresAt };
}

export async function screenOf(token: string | undefined) {
  if (!token) return null;
  const [screen] = await db.select().from(eventScreens).where(eq(eventScreens.tokenHash, hashToken(token)));
  return screen ?? null;
}

/** What a paired screen shows: the public parts of the event and the scene the organizers chose. */
export async function screenView(eventId: string) {
  const ev = await eventOf(eventId);
  const view = await eventView(ev, null);
  return {
    ...view,
    // The screen sees published brackets only, like everyone in the hall.
    objections: [],
    warnings: [],
    log: [],
    screen: ev.screen ?? DEFAULT_SCREEN,
  };
}
