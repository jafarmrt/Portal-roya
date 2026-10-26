import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Router } from 'express';
import moment from 'moment-jalaali';
import { z } from 'zod';
import { todayJalali } from '../../shared/jalali.js';
import { requireManager } from '../auth.js';
import { db } from '../db/index.js';
import { moods } from '../db/schema.js';
import { currentUser, parse, route } from '../http.js';

export const moodsRouter = Router();

export const MOOD_VALUES = ['عالی', 'خوب', 'معمولی', 'بد', 'خیلی بد'] as const;

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

// Aggregated counts only: managers never see an individual's mood.
moodsRouter.get(
  '/moods/summary',
  requireManager,
  route(async (_req, res) => {
    const since = moment().subtract(30, 'days').format('jYYYY/jMM/jDD');
    const rows = await db
      .select({ date: moods.date, mood: moods.mood, count: sql<number>`count(*)::int` })
      .from(moods)
      .where(and(gte(moods.date, since)))
      .groupBy(moods.date, moods.mood);
    res.json(rows);
  }),
);
