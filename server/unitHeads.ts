import { and, eq } from 'drizzle-orm';
import { audit } from './audit.js';
import type { SessionUser } from './auth.js';
import { db } from './db/index.js';
import { departmentPages, employees } from './db/schema.js';
import { broadcastChange } from './events.js';
import { HttpError } from './http.js';
import { fullName } from './serializers.js';

/**
 * Makes someone (or nobody) the head of a unit, the «مسئول واحد» of its page. Set from the unit's page
 * by a portal admin, or from staff management for a colleague of that unit.
 */
export async function setUnitHead(viewer: SessionUser, department: string, headId: string | null) {
  const [existing] = await db.select().from(departmentPages).where(eq(departmentPages.department, department));
  if ((existing?.headId ?? null) === headId) return;
  const [head] = headId ? await db.select().from(employees).where(eq(employees.id, headId)) : [];
  if (headId && (!head?.isActive || !head.hasAccount)) throw new HttpError(400, 'مسئول واحد باید همکار فعال با حساب پرتال باشد.');
  const values = { headId, updatedById: viewer.id, updatedAt: new Date() };
  await db.insert(departmentPages).values({ department, ...values }).onConflictDoUpdate({ target: departmentPages.department, set: values });
  await audit(viewer, {
    action: 'update',
    entity: 'department_page',
    id: department,
    title: department,
    detail: `مسئول واحد: ${head ? fullName(head) : 'بدون مسئول'}`,
  });
  broadcastChange('department_pages');
}

/** Ends someone's headship of a unit, e.g. when they move to another unit or leave. */
export async function clearUnitHead(viewer: SessionUser, personId: string, department?: string) {
  const pages = await db
    .select({ department: departmentPages.department })
    .from(departmentPages)
    .where(department ? and(eq(departmentPages.headId, personId), eq(departmentPages.department, department)) : eq(departmentPages.headId, personId));
  for (const page of pages) await setUnitHead(viewer, page.department, null);
}
