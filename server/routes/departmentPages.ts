import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { can } from '../auth.js';
import { db } from '../db/index.js';
import { departmentPages, employees } from '../db/schema.js';
import { departmentList, requireDepartment } from '../departments.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, parse, route } from '../http.js';
import { sanitizeRichText } from '../richText.js';
import { fullName } from '../serializers.js';

export const departmentPagesRouter = Router();

/** The page of every department in the list that has one; departments without a page show only their people. */
departmentPagesRouter.get(
  '/department_pages',
  route(async (_req, res) => {
    const [rows, list, people] = await Promise.all([db.select().from(departmentPages), departmentList(), db.select().from(employees)]);
    const byId = new Map(people.map((p) => [p.id, p]));
    res.json(
      rows
        .filter((r) => list.includes(r.department))
        .map((r) => {
          const editor = r.updatedById ? byId.get(r.updatedById) : undefined;
          return {
            department: r.department,
            headId: r.headId,
            about: r.about,
            updatedBy: editor ? fullName(editor) : '',
            updatedAt: r.updatedAt.toISOString(),
          };
        }),
    );
  }),
);

const pageSchema = z.object({
  headId: z.string().max(100).nullable().optional(),
  about: z.string().max(30000).default(''),
});

/**
 * Portal admins (settings.manage) choose who leads a department and may edit any page; the head of
 * a department keeps its "what to come to us for" text current.
 */
departmentPagesRouter.put(
  '/department_pages/:department',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const department = await requireDepartment(req.params.department);
    const body = parse(pageSchema, req.body);
    const [existing] = await db.select().from(departmentPages).where(eq(departmentPages.department, department));
    const isAdmin = can(viewer, 'settings.manage');
    if (!isAdmin && existing?.headId !== viewer.id) throw new HttpError(403, 'فقط مسئول واحد یا ادمین پرتال می‌تواند صفحهٔ واحد را ویرایش کند.');

    let headId = existing?.headId ?? null;
    if (isAdmin && body.headId !== undefined) {
      headId = body.headId;
      if (headId) {
        const [head] = await db.select().from(employees).where(eq(employees.id, headId));
        if (!head?.isActive || !head.hasAccount) throw new HttpError(400, 'مسئول واحد باید همکار فعال با حساب پرتال باشد.');
      }
    }
    const values = { headId, about: sanitizeRichText(body.about), updatedById: viewer.id, updatedAt: new Date() };
    await db
      .insert(departmentPages)
      .values({ department, ...values })
      .onConflictDoUpdate({ target: departmentPages.department, set: values });
    const headChanged = headId !== (existing?.headId ?? null);
    const [head] = headChanged && headId ? await db.select().from(employees).where(eq(employees.id, headId)) : [];
    await audit(viewer, {
      action: 'update',
      entity: 'department_page',
      id: department,
      title: department,
      detail: headChanged ? `مسئول واحد: ${head ? fullName(head) : 'بدون مسئول'}` : 'معرفی واحد',
    });
    broadcastChange('department_pages');
    res.json({ department, ...values, updatedAt: values.updatedAt.toISOString(), updatedBy: fullName(viewer) });
  }),
);
