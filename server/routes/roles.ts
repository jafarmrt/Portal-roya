import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLE_ID, effectivePermissions, isPermission, PERMISSIONS } from '../../shared/permissions.js';
import { audit } from '../audit.js';
import { requireAdmin } from '../auth.js';
import { db } from '../db/index.js';
import { employees, roles } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import { optionalText, requiredText, textValue } from '../validation.js';

export const rolesRouter = Router();

type RoleRow = typeof roles.$inferSelect;

function serializeRole(role: RoleRow, memberCount: number) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: effectivePermissions(role.id, role.permissions),
    isSystem: role.isSystem,
    isAdmin: role.id === ADMIN_ROLE_ID,
    memberCount,
  };
}

async function memberCounts() {
  const rows = await db
    .select({ role: employees.role, count: sql<number>`count(*)::int` })
    .from(employees)
    .groupBy(employees.role);
  return new Map(rows.map((r) => [r.role, r.count]));
}

async function loadRole(id: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) throw new HttpError(404, 'نقش یافت نشد.');
  return role;
}

async function assertNameFree(name: string, exceptId?: string) {
  const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (existing && existing.id !== exceptId) throw new HttpError(409, `نقشی با نام «${name}» وجود دارد.`);
}

// Every signed-in user may read roles: names are shown on profiles and in the phone book.
rolesRouter.get(
  '/roles',
  route(async (_req, res) => {
    const [rows, counts] = await Promise.all([db.select().from(roles).orderBy(roles.createdAt, roles.name), memberCounts()]);
    // Built-in roles first, in the order admin, manager, employee.
    const order = (r: RoleRow) => (r.isSystem ? ['admin', 'manager', 'employee'].indexOf(r.id) : 10);
    rows.sort((a, b) => order(a) - order(b));
    res.json(rows.map((r) => serializeRole(r, counts.get(r.id) ?? 0)));
  }),
);

const permissionList = z
  .array(z.string())
  .max(50)
  .transform((list) => [...new Set(list)])
  .refine((list) => list.every(isPermission), 'دسترسی نامعتبر است');

/** "مدیریت نظرسنجی‌ها، مشاهدهٔ گزارش‌ها" for the change history. */
const permissionNames = (keys: string[]) => PERMISSIONS.filter((p) => keys.includes(p.key)).map((p) => p.label).join('، ');

const createSchema = z.object({
  name: requiredText(60),
  description: optionalText(300),
  permissions: permissionList.default([]),
});
// No defaults here: a PATCH changes only the fields it sends.
const updateSchema = z.object({ name: requiredText(60), description: textValue(300), permissions: permissionList }).partial();

rolesRouter.post(
  '/roles',
  requireAdmin,
  route(async (req, res) => {
    const body = parse(createSchema, req.body);
    await assertNameFree(body.name);
    const [role] = await db
      .insert(roles)
      .values({ id: newId('role'), name: body.name, description: body.description, permissions: body.permissions })
      .returning();
    await audit(currentUser(req), { action: 'create', entity: 'role', id: role.id, title: role.name, detail: permissionNames(role.permissions) || 'بدون دسترسی مدیریتی' });
    broadcastChange('roles');
    res.status(201).json(serializeRole(role, 0));
  }),
);

rolesRouter.patch(
  '/roles/:id',
  requireAdmin,
  route(async (req, res) => {
    const role = await loadRole(req.params.id);
    const body = parse(updateSchema, req.body);
    if (body.permissions !== undefined && role.id === ADMIN_ROLE_ID) {
      throw new HttpError(400, 'ادمین برنامه همیشه همهٔ دسترسی‌ها را دارد.');
    }
    if (body.name !== undefined) await assertNameFree(body.name, role.id);
    const [updated] = await db.update(roles).set(body).where(eq(roles.id, role.id)).returning();
    const granted = updated.permissions.filter((p) => !role.permissions.includes(p));
    const taken = role.permissions.filter((p) => !updated.permissions.includes(p));
    const detail = [
      role.name !== updated.name ? `نام قبلی: ${role.name}` : '',
      granted.length > 0 ? `داده شد: ${permissionNames(granted)}` : '',
      taken.length > 0 ? `گرفته شد: ${permissionNames(taken)}` : '',
      role.description !== updated.description ? 'توضیح' : '',
    ].filter(Boolean);
    if (detail.length > 0) await audit(currentUser(req), { action: 'update', entity: 'role', id: role.id, title: updated.name, detail: detail.join('؛ ') });
    // Clients refetch their own permissions when roles change.
    broadcastChange('roles');
    res.json(serializeRole(updated, (await memberCounts()).get(role.id) ?? 0));
  }),
);

rolesRouter.delete(
  '/roles/:id',
  requireAdmin,
  route(async (req, res) => {
    const role = await loadRole(req.params.id);
    if (role.isSystem) throw new HttpError(400, 'نقش‌های پایهٔ پرتال حذف نمی‌شوند.');
    const members = (await memberCounts()).get(role.id) ?? 0;
    if (members > 0) {
      throw new HttpError(409, `${members} همکار این نقش را دارند. ابتدا نقش آن‌ها را تغییر دهید.`);
    }
    await db.delete(roles).where(eq(roles.id, role.id));
    await audit(currentUser(req), { action: 'delete', entity: 'role', id: role.id, title: role.name });
    broadcastChange('roles');
    res.json({ success: true });
  }),
);
