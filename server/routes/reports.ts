import { desc } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { ReportOverview, StoredMonthlySummary } from '../../shared/reports.js';
import { requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { reportSummaries } from '../db/schema.js';
import { parse, route } from '../http.js';
import { idlePeople, newsReport, participationReport, rangeOf } from '../reports.js';
import { jalaliDate } from '../validation.js';

export const reportsRouter = Router();

const rangeSchema = z.object({ from: jalaliDate, to: jalaliDate });

/** How far announcements reached and how colleagues took part in a date range, plus who has been away. */
reportsRouter.get(
  '/reports/overview',
  requirePermission('reports.view'),
  route(async (req, res) => {
    const { from, to } = parse(rangeSchema, req.query);
    rangeOf(from, to);
    const now = new Date();
    const overview: ReportOverview = {
      from,
      to,
      news: await newsReport(from, to, now),
      participation: await participationReport(from, to, now),
      idle: await idlePeople(now),
    };
    res.json(overview);
  }),
);

/** The monthly summaries kept so far, newest first. */
reportsRouter.get(
  '/reports/summaries',
  requirePermission('reports.view'),
  route(async (_req, res) => {
    const rows = await db.select().from(reportSummaries).orderBy(desc(reportSummaries.month)).limit(24);
    const list: StoredMonthlySummary[] = rows.map((r) => ({ ...r.data, createdAt: r.createdAt.toISOString() }));
    res.json(list);
  }),
);
