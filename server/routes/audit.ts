import { and, desc, eq, ilike, lt, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../../shared/audit.js';
import { normalizeForSearch } from '../../shared/search.js';
import { requireAdmin } from '../auth.js';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';
import { parse, route } from '../http.js';

export const auditRouter = Router();

const PAGE_SIZE = 50;

const querySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: z.string().max(100).optional(),
  /** The id of the last entry already shown, for the next page. */
  before: z.coerce.number().int().positive().optional(),
});

// The text an entry is searched by, with Arabic letters and the zero-width joiner unified as in search.
const searchable = sql`translate(lower(${auditLog.title} || ' ' || ${auditLog.detail} || ' ' || ${auditLog.actorName}), 'يكۀ‌', 'یکه ')`;

/** Who created, changed or deleted what, newest first; for the admin. */
auditRouter.get(
  '/audit-log',
  requireAdmin,
  route(async (req, res) => {
    const query = parse(querySchema, req.query);
    const conditions: SQL[] = [];
    const words = normalizeForSearch(query.q).split(/\s+/).filter(Boolean);
    for (const word of words) conditions.push(ilike(searchable, `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
    if (query.entity) conditions.push(eq(auditLog.entity, query.entity));
    if (query.action) conditions.push(eq(auditLog.action, query.action));
    if (query.actorId) conditions.push(eq(auditLog.actorId, query.actorId));
    if (query.before) conditions.push(lt(auditLog.id, query.before));
    const rows = await db
      .select()
      .from(auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(PAGE_SIZE + 1);
    res.json({
      items: rows.slice(0, PAGE_SIZE).map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        title: r.title,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
      hasMore: rows.length > PAGE_SIZE,
    });
  }),
);
