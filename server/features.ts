import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from './auth.js';
import { db } from './db/index.js';
import { settings } from './db/schema.js';
import { type FeatureConfig, type FeatureKey, FEATURES, featureOfNotification, featureVisible } from '../shared/features.js';

/** The switches and the pilot group, read on every request that touches a switchable part. */
export async function featureConfig(): Promise<FeatureConfig> {
  const [row] = await db
    .select({ states: settings.features, pilotRoles: settings.pilotRoles, pilotUserIds: settings.pilotUserIds })
    .from(settings)
    .where(eq(settings.id, 'global'));
  return row ?? { states: {}, pilotRoles: [], pilotUserIds: [] };
}

/** The parts this viewer (null for a guest) does not see. */
export async function hiddenFeatures(viewer: { id: string; role: string } | null) {
  const config = await featureConfig();
  return new Set<FeatureKey>(FEATURES.filter((f) => !featureVisible(config, f.key, viewer)).map((f) => f.key));
}

/** True when the notification belongs to a part this viewer does not see. */
export const hiddenNotification = (hidden: Set<FeatureKey>, type: string) => {
  const key = featureOfNotification(type);
  return Boolean(key && hidden.has(key));
};

// The API of each switchable part. While a part is hidden from someone, the lists the portal loads on
// every page come back empty (so an open page keeps working) and everything else answers "not found".
const FEATURE_ROUTES: { key: FeatureKey; pattern: RegExp; emptyReads: Record<string, unknown> }[] = [
  { key: 'suggestions', pattern: /^\/suggestions(\/|$)/, emptyReads: {} },
  { key: 'polls', pattern: /^\/polls(\/|$)/, emptyReads: { '/polls': [] } },
  { key: 'training', pattern: /^\/trainings(\/|$)/, emptyReads: { '/trainings': [] } },
  { key: 'guides', pattern: /^\/guides(\/|$)/, emptyReads: { '/guides': [] } },
  { key: 'departmentPages', pattern: /^\/department_pages(\/|$)/, emptyReads: { '/department_pages': [] } },
  { key: 'mood', pattern: /^\/moods(\/|$)/, emptyReads: { '/moods/me': [] } },
  { key: 'todos', pattern: /^\/todos(\/|$)/, emptyReads: { '/todos': [] } },
];

/** Keeps a hidden part out of reach even for someone who types its address. */
export async function requireVisibleFeature(req: Request, res: Response, next: NextFunction) {
  try {
    const route = FEATURE_ROUTES.find((r) => r.pattern.test(req.path));
    if (!route) {
      next();
      return;
    }
    const viewer = (req as AuthedRequest).user ?? null;
    if (featureVisible(await featureConfig(), route.key, viewer)) {
      next();
      return;
    }
    if (req.method === 'GET' && req.path in route.emptyReads) {
      res.json(route.emptyReads[req.path]);
      return;
    }
    res.status(404).json({ error: 'مسیر یافت نشد.' });
  } catch (err) {
    next(err);
  }
}
