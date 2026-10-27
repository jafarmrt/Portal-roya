import { and, desc, gt, ilike, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { normalizeForSearch } from '../../shared/search.js';
import { requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { documents, searchMisses } from '../db/schema.js';
import { currentUser, parse, route, viewerOf } from '../http.js';
import { visibleTo as documentsVisibleTo } from './documents.js';

export const searchRouter = Router();

const queryOf = (value: string) => normalizeForSearch(value).replace(/\s+/g, ' ').trim();

/** About a line of text around the first place the words appear. */
function snippetOf(text: string, query: string) {
  const at = text.indexOf(query);
  if (at < 0) return '';
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + query.length + 90);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/**
 * What the search box cannot find in the data it already has: words inside document files. Titles
 * and descriptions are searched in the browser.
 */
searchRouter.get(
  '/search',
  route(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().max(100).default('') }), req.query);
    const query = queryOf(q);
    if (query.length < 2) {
      res.json({ documents: [] });
      return;
    }
    const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await db
      .select({ id: documents.id, text: documents.contentText })
      .from(documents)
      .where(and(documentsVisibleTo(viewerOf(req)), ilike(documents.contentText, pattern)))
      .orderBy(desc(documents.updatedAt))
      .limit(20);
    res.json({ documents: rows.map((r) => ({ id: r.id, snippet: snippetOf(r.text ?? '', query) })) });
  }),
);

/** A search that found nothing; counted so the people who write guides see what colleagues miss. */
searchRouter.post(
  '/search/misses',
  route(async (req, res) => {
    currentUser(req);
    const { q } = parse(z.object({ q: z.string().max(100) }), req.body);
    const query = queryOf(q);
    if (query.length >= 3) {
      await db
        .insert(searchMisses)
        .values({ query })
        .onConflictDoUpdate({ target: searchMisses.query, set: { count: sql`${searchMisses.count} + 1`, lastAt: new Date() } });
    }
    res.json({ success: true });
  }),
);

const MISS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

searchRouter.get(
  '/search/misses',
  requirePermission('reports.view'),
  route(async (_req, res) => {
    const rows = await db
      .select()
      .from(searchMisses)
      .where(gt(searchMisses.lastAt, new Date(Date.now() - MISS_WINDOW_MS)))
      .orderBy(desc(searchMisses.count), desc(searchMisses.lastAt))
      .limit(30);
    res.json(rows.map((r) => ({ query: r.query, count: r.count, lastAt: r.lastAt.toISOString() })));
  }),
);
