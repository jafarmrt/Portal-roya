import { desc, eq, gte, sql } from 'drizzle-orm';
import { Router } from 'express';
import moment from 'moment-jalaali';
import { z } from 'zod';
import { todayJalali } from '../../shared/jalali.js';
import { goodShare, MOOD_MIN_ANSWERS, MOOD_TEAM_DAYS, MOOD_VALUES, type Mood, type MoodTeam } from '../../shared/mood.js';
import { requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { moods } from '../db/schema.js';
import { currentUser, parse, route } from '../http.js';

export const moodsRouter = Router();

const FORMAT = 'jYYYY/jMM/jDD';

type DayCounts = Map<string, Partial<Record<Mood, number>>>;

/** How many colleagues chose each answer on each day since `since` (a Jalali date). */
async function countsSince(since: string): Promise<DayCounts> {
  const rows = await db
    .select({ date: moods.date, mood: moods.mood, count: sql<number>`count(*)::int` })
    .from(moods)
    .where(gte(moods.date, since))
    .groupBy(moods.date, moods.mood);
  const days: DayCounts = new Map();
  for (const row of rows) {
    const day = days.get(row.date) ?? {};
    day[row.mood as Mood] = row.count;
    days.set(row.date, day);
  }
  return days;
}

// «حال‌وهوای ما» is the same for everyone and is asked for by every dashboard that opens, so it is
// worked out at most once a minute. A new answer clears it: the colleague who just answered sees
// themselves counted.
const TEAM_TTL_MS = 60_000;
let teamCache: { at: number; value: MoodTeam } | null = null;

export function clearMoodTeamCache() {
  teamCache = null;
}

async function moodTeam(): Promise<MoodTeam> {
  const date = todayJalali();
  if (teamCache && teamCache.value.date === date && Date.now() - teamCache.at < TEAM_TTL_MS) return teamCache.value;
  const first = moment().subtract(MOOD_TEAM_DAYS - 1, 'days');
  const counts = await countsSince(first.format(FORMAT));
  const days = Array.from({ length: MOOD_TEAM_DAYS }, (_, i) => {
    const day = first.clone().add(i, 'days').format(FORMAT);
    return { date: day, good: goodShare(counts.get(day) ?? {}).good };
  });
  const today = goodShare(counts.get(date) ?? {});
  const value: MoodTeam = { date, answers: today.good === null ? null : today.answers, good: today.good, days };
  teamCache = { at: Date.now(), value };
  return value;
}

moodsRouter.post(
  '/moods',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { mood } = parse(z.object({ mood: z.enum(MOOD_VALUES) }), req.body);
    const date = todayJalali();
    const [row] = await db
      .insert(moods)
      .values({ userId: viewer.id, date, mood })
      .onConflictDoUpdate({ target: [moods.userId, moods.date], set: { mood, submittedAt: new Date() } })
      .returning();
    clearMoodTeamCache();
    res.json({ mood: { id: String(row.id), userId: row.userId, date: row.date, mood: row.mood } });
  }),
);

moodsRouter.get(
  '/moods/me',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db.select().from(moods).where(eq(moods.userId, viewer.id)).orderBy(desc(moods.date)).limit(60);
    res.json(rows.map((r) => ({ id: String(r.id), userId: r.userId, date: r.date, mood: r.mood })));
  }),
);

// What comes back to every colleague after answering: shares only, and nothing below the minimum.
moodsRouter.get(
  '/moods/team',
  route(async (req, res) => {
    currentUser(req);
    res.json(await moodTeam());
  }),
);

// Aggregated counts only: managers never see an individual's mood. A day with fewer answers than the
// minimum is left out altogether, so nobody's answer can be read off a nearly empty day.
moodsRouter.get(
  '/moods/summary',
  requirePermission('reports.view'),
  route(async (_req, res) => {
    const counts = await countsSince(moment().subtract(30, 'days').format(FORMAT));
    const rows: { date: string; mood: Mood; count: number }[] = [];
    for (const [date, day] of counts) {
      if (goodShare(day).answers < MOOD_MIN_ANSWERS) continue;
      for (const mood of MOOD_VALUES) if (day[mood]) rows.push({ date, mood, count: day[mood] });
    }
    res.json(rows);
  }),
);
