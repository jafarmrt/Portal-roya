import { and, eq, sql } from 'drizzle-orm';
import { DISCOVER_PARTS, type DiscoverPart, type DiscoverStatus } from '../shared/discover.js';
import { featureVisible } from '../shared/features.js';
import { db } from './db/index.js';
import { assignedTasks, employees, pushSubscriptions } from './db/schema.js';
import { featureConfig } from './features.js';
import { ensureSettings } from './settings.js';

type Viewer = typeof employees.$inferSelect;

/**
 * «کشف پرتال»: the parts the colleague can use, and whether they have, read from what really happened.
 * A part hidden from them (switched off, in preview outside the pilot group, or with nothing to show
 * them, like a unit without a page) is not listed.
 */
export async function discoverStatus(viewer: Viewer): Promise<DiscoverStatus[]> {
  const config = await featureConfig();
  const visible = (key: Parameters<typeof featureVisible>[1]) => featureVisible(config, key, viewer);
  const tried = new Set(viewer.portalTried);
  const used: Partial<Record<DiscoverPart, () => Promise<boolean> | boolean>> = {};

  if (visible('tasks')) {
    used.tasks = async () => {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(assignedTasks).where(eq(assignedTasks.assignerId, viewer.id));
      return (row?.n ?? 0) > 0;
    };
  }
  if (visible('guides')) used.guides = () => tried.has('guides');
  if (visible('pushNotifications')) {
    used.push = async () => {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, viewer.id)));
      return (row?.n ?? 0) > 0;
    };
  }
  if (visible('dashboardLayout')) used.layout = () => viewer.dashboardOrder.length > 0;
  if (visible('departmentPages') && viewer.department) {
    const { departments } = await ensureSettings();
    if (departments.includes(viewer.department)) used.unit = () => tried.has('unit');
  }

  const parts: DiscoverStatus[] = [];
  for (const part of DISCOVER_PARTS) {
    const check = used[part];
    if (check) parts.push({ part, used: await check() });
  }
  return parts;
}
