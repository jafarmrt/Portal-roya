import { type AnyColumn, and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Audience } from '../shared/audience.js';
import { type SessionUser } from './auth.js';
import { db } from './db/index.js';
import { employees, roles } from './db/schema.js';
import { requireDepartments, requireLocations } from './departments.js';
import { HttpError } from './http.js';

/** The four audience columns of a table (news, documents). */
export interface AudienceColumns {
  departments: AnyColumn;
  locations: AnyColumn;
  roles: AnyColumn;
  userIds: AnyColumn;
}

/**
 * "The row is meant for this viewer", in SQL, with the rules of shared/audience.ts. Visitors who
 * are not signed in only match rows addressed to everyone.
 */
export function audienceIncludes(columns: AudienceColumns, viewer: SessionUser | null): SQL {
  const empty = (column: AnyColumn) => sql`cardinality(${column}) = 0`;
  const forEveryone = and(empty(columns.departments), empty(columns.locations), empty(columns.roles), empty(columns.userIds))!;
  if (!viewer) return forEveryone;
  return or(
    forEveryone,
    sql`${viewer.id} = any(${columns.userIds})`,
    and(
      sql`cardinality(${columns.departments}) + cardinality(${columns.locations}) + cardinality(${columns.roles}) > 0`,
      or(empty(columns.departments), sql`${viewer.department} = any(${columns.departments})`),
      or(empty(columns.locations), sql`${viewer.location} = any(${columns.locations})`),
      or(empty(columns.roles), sql`${viewer.role} = any(${columns.roles})`),
    ),
  )!;
}

/** The audience stored on a row. */
export const audienceOfRow = (row: { targetDepartments: string[]; targetLocations: string[]; targetRoles: string[]; targetUserIds: string[] }): Audience => ({
  departments: row.targetDepartments,
  locations: row.targetLocations,
  roles: row.targetRoles,
  userIds: row.targetUserIds,
});

/** Checks a chosen audience against the lists of departments, locations, roles and colleagues. */
export async function checkAudience(input: { targetDepartments: string[]; targetLocations: string[]; targetRoles: string[]; targetUserIds: string[] }): Promise<Audience> {
  const departments = await requireDepartments(input.targetDepartments);
  const locations = await requireLocations(input.targetLocations);
  const roleIds = [...new Set(input.targetRoles)];
  if (roleIds.length > 0) {
    const found = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds));
    if (found.length !== roleIds.length) throw new HttpError(400, 'یکی از سطح‌های دسترسی انتخاب‌شده در پرتال نیست.');
  }
  const userIds = [...new Set(input.targetUserIds)];
  if (userIds.length > 0) {
    const found = await db.select({ id: employees.id }).from(employees).where(and(inArray(employees.id, userIds), eq(employees.hasAccount, true)));
    if (found.length !== userIds.length) throw new HttpError(400, 'یکی از همکاران انتخاب‌شده پیدا نشد یا حساب پرتال ندارد.');
  }
  return { departments, locations, roles: roleIds, userIds };
}
