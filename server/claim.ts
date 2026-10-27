import { and, eq, isNull, sql } from 'drizzle-orm';
import { departmentKey } from '../shared/departments.js';
import type { Employee } from './auth.js';
import { db } from './db/index.js';
import { employees } from './db/schema.js';

/** Same rules as department names: ي/ی, ك/ک, half-spaces and spaces do not make a different name. */
const nameKey = (firstName: string, lastName: string) => departmentKey(`${firstName}${lastName}`);

/**
 * Phone-book-only people (no portal account and no username) with this name. A colleague who signs in
 * with AD for the first time may be one of them, entered earlier by hand or from Excel without a username.
 */
export async function phoneBookMatches(firstName: string, lastName: string) {
  const key = nameKey(firstName, lastName);
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.hasAccount, false), eq(employees.isActive, true), isNull(employees.username)));
  return rows.filter((e) => nameKey(e.firstName, e.lastName) === key);
}

/**
 * Joins the AD account `account` into the phone-book entry `person`, which keeps its details (position,
 * department, manager, wishes received) and takes over the account. Whatever the account already did
 * in the portal moves along with it; the account's own row is then removed.
 */
export async function claimPhoneBookEntry(account: Employee, person: Employee, profile: Partial<Employee>) {
  return db.transaction(async (tx) => {
    // The username is unique, so the account lets go of it before the entry takes it.
    await tx
      .update(employees)
      .set({ username: null, hasAccount: false, isActive: false })
      .where(eq(employees.id, account.id));
    const [joined] = await tx
      .update(employees)
      .set({
        ...profile,
        username: account.username,
        hasAccount: true,
        authSource: account.authSource,
        passwordHash: account.passwordHash,
        mustChangePassword: account.mustChangePassword,
        role: account.role,
        email: person.email || account.email,
        extension: person.extension || account.extension,
        mobile: person.mobile || account.mobile,
        lastSeenAt: account.lastSeenAt,
        failedLogins: 0,
        lockedUntil: null,
      })
      .where(eq(employees.id, person.id))
      .returning();

    // Every column that points at a colleague, found from the schema so new tables are covered too.
    const { rows } = await tx.execute<{ tbl: string; col: string }>(sql`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = 'employees'::regclass`);
    for (const { tbl, col } of rows) {
      // A row the entry already has (e.g. both marked the same item read) stays with the account and goes with it.
      await tx.execute(sql`savepoint repoint`);
      try {
        await tx.execute(sql`update ${sql.raw(tbl)} set ${sql.identifier(col)} = ${person.id} where ${sql.identifier(col)} = ${account.id}`);
        await tx.execute(sql`release savepoint repoint`);
      } catch {
        await tx.execute(sql`rollback to savepoint repoint`);
      }
    }
    // The org chart's manager link has no foreign key, so it is moved by hand.
    await tx.update(employees).set({ directManagerId: person.id }).where(eq(employees.directManagerId, account.id));
    // Audiences that named the account by id (news, polls, events, documents) now name the entry.
    const { rows: lists } = await tx.execute<{ tbl: string }>(sql`
      select table_name as tbl from information_schema.columns where table_schema = 'public' and column_name = 'target_user_ids'`);
    for (const { tbl } of lists) {
      await tx.execute(
        sql`update ${sql.identifier(tbl)} set target_user_ids = array_replace(target_user_ids, ${account.id}, ${person.id}) where ${account.id} = any(target_user_ids)`,
      );
    }
    await tx.delete(employees).where(eq(employees.id, account.id));
    return joined;
  });
}
