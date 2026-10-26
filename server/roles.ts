import { eq } from 'drizzle-orm';
import { ADMIN_ROLE_ID, DEFAULT_ROLE_ID, effectivePermissions, MANAGER_ROLE_ID, type Permission } from '../shared/permissions.js';
import { db } from './db/index.js';
import { roles } from './db/schema.js';

export const BUILT_IN_ROLES = [
  { id: ADMIN_ROLE_ID, name: 'ادمین برنامه', description: 'دسترسی کامل به همهٔ بخش‌ها، کاربران و تنظیم نقش‌ها', permissions: [] as string[], isSystem: true },
  {
    id: MANAGER_ROLE_ID,
    name: 'مدیر',
    description: 'انتشار محتوا و مشاهدهٔ گزارش‌ها',
    permissions: ['news.manage', 'polls.manage', 'trainings.manage', 'calendar.manage', 'documents.manage', 'comments.moderate', 'reports.view'],
    isSystem: true,
  },
  { id: DEFAULT_ROLE_ID, name: 'کارشناس', description: 'مشاهدهٔ محتوا و مشارکت در نظرسنجی‌ها', permissions: [] as string[], isSystem: true },
];

/** Recreates any missing built-in role (the migration seeds them; this covers emptied tables). */
export async function ensureRoles() {
  await db.insert(roles).values(BUILT_IN_ROLES).onConflictDoNothing();
}

export async function rolePermissions(roleId: string): Promise<Permission[]> {
  const [role] = await db.select({ permissions: roles.permissions }).from(roles).where(eq(roles.id, roleId)).limit(1);
  return effectivePermissions(roleId, role?.permissions ?? []);
}

export async function roleExists(roleId: string) {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  return Boolean(role);
}
