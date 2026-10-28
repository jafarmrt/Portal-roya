import { and, eq } from 'drizzle-orm';
import { ADMIN_ROLE_ID, coversRole, DEFAULT_ROLE_ID, effectivePermissions, MANAGER_ROLE_ID, type Permission } from '../shared/permissions.js';
import { db } from './db/index.js';
import { employees, roles } from './db/schema.js';

// The built-in access levels (drizzle/0027 renamed them from «ادمین برنامه», «مدیر» and «کارشناس»).
export const BUILT_IN_ROLES = [
  { id: ADMIN_ROLE_ID, name: 'ادمین پرتال', description: 'همهٔ بخش‌ها و تنظیمات پرتال، حساب‌های همکاران و سطح‌های دسترسی', permissions: [] as string[], isSystem: true },
  {
    id: MANAGER_ROLE_ID,
    name: 'ناشر محتوا',
    description: 'انتشار خبر، نظرسنجی، دوره، رویداد و سند، و دیدن گزارش‌ها',
    permissions: ['news.manage', 'polls.manage', 'trainings.manage', 'calendar.manage', 'documents.manage', 'comments.moderate', 'reports.view'],
    isSystem: true,
  },
  { id: DEFAULT_ROLE_ID, name: 'همکار', description: 'دیدن محتوا، شرکت در نظرسنجی‌ها و فرستادن پیام؛ بدون دسترسی مدیریتی', permissions: [] as string[], isSystem: true },
];

/** Recreates any missing built-in role (the migration seeds them; this covers emptied tables). */
export async function ensureRoles() {
  await db.insert(roles).values(BUILT_IN_ROLES).onConflictDoNothing();
}

export async function rolePermissions(roleId: string): Promise<Permission[]> {
  const [role] = await db.select({ permissions: roles.permissions }).from(roles).where(eq(roles.id, roleId)).limit(1);
  return effectivePermissions(roleId, role?.permissions ?? []);
}

/** What the viewer may do with portal accounts; see coversRole. */
export async function accountRules(viewer: { id: string; role: string; permissions: readonly Permission[] }) {
  const stored = new Map((await db.select({ id: roles.id, permissions: roles.permissions }).from(roles)).map((r) => [r.id, r.permissions]));
  return {
    isAdmin: viewer.role === ADMIN_ROLE_ID,
    selfId: viewer.id,
    covers: (roleId: string) => coversRole(viewer, { id: roleId, permissions: stored.get(roleId) ?? [] }),
  };
}
export type AccountRules = Awaited<ReturnType<typeof accountRules>>;

export async function roleExists(roleId: string) {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  return Boolean(role);
}

/** Active colleagues with a portal account whose role grants the permission. */
export async function idsWithPermission(permission: Permission) {
  const granted = new Set(
    (await db.select().from(roles)).filter((r) => effectivePermissions(r.id, r.permissions).includes(permission)).map((r) => r.id),
  );
  const people = await db
    .select({ id: employees.id, role: employees.role })
    .from(employees)
    .where(and(eq(employees.isActive, true), eq(employees.hasAccount, true)));
  return people.filter((p) => granted.has(p.role)).map((p) => p.id);
}
