import { and, eq, inArray } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/index.js';
import { employees, notifications } from './db/schema.js';
import { notifyUsers } from './events.js';
import { sendMail } from './mailer.js';
import { type Audience, EVERYONE, inAudience } from '../shared/audience.js';

export type NotificationType = 'birthday' | 'poll' | 'announcement' | 'training' | 'calendar' | 'profile' | 'welcome' | 'document' | 'system' | 'suggestion';

export interface NotificationInput {
  title: string;
  message: string;
  type: NotificationType;
  linkTab?: string;
  linkId?: string;
}

/** Active employees who can sign in, optionally limited to departments (an empty list means everyone). */
export async function audienceIds(departments: string[] = [], excludeId?: string) {
  return audienceIdsFor({ ...EVERYONE, departments }, excludeId);
}

/** Active employees who can sign in and are in the audience (e.g. of a news item). */
export async function audienceIdsFor(audience: Audience, excludeId?: string) {
  const rows = await db
    .select({ id: employees.id, department: employees.department, location: employees.location, role: employees.role })
    .from(employees)
    .where(and(eq(employees.isActive, true), eq(employees.hasAccount, true)));
  return rows.filter((r) => r.id !== excludeId && inAudience(r, audience)).map((r) => r.id);
}

export async function createNotifications(requested: string[], input: NotificationInput, options: { email?: boolean } = {}) {
  if (requested.length === 0) return;
  // People without a portal account would never read them (e.g. a birthday wish to a workshop colleague).
  const withAccount = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(inArray(employees.id, requested), eq(employees.hasAccount, true)));
  const userIds = withAccount.map((r) => r.id);
  if (userIds.length === 0) return;
  await db.insert(notifications).values(
    userIds.map((userId) => ({
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      linkTab: input.linkTab ?? null,
      linkId: input.linkId ?? null,
    })),
  );
  notifyUsers(userIds);

  if (options.email) {
    const recipients = await db
      .select({ email: employees.email })
      .from(employees)
      .where(inArray(employees.id, userIds));
    const link = input.linkTab ? `${config.appUrl}/#${input.linkTab}${input.linkId ? `/${input.linkId}` : ''}` : undefined;
    void sendMail(
      recipients.map((r) => r.email).filter(Boolean),
      input.title,
      input.message,
      link,
    );
  }
}
