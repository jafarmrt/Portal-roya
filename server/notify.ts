import { and, eq, inArray } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/index.js';
import { employees, notifications } from './db/schema.js';
import { notifyUsers } from './events.js';
import { sendMail } from './mailer.js';

export type NotificationType = 'birthday' | 'poll' | 'announcement' | 'training' | 'profile' | 'welcome' | 'document';

export interface NotificationInput {
  title: string;
  message: string;
  type: NotificationType;
  linkTab?: string;
  linkId?: string;
}

/** Active employees, optionally limited to departments (an empty list means everyone). */
export async function audienceIds(departments: string[] = [], excludeId?: string) {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      departments.length > 0
        ? and(eq(employees.isActive, true), inArray(employees.department, departments))
        : eq(employees.isActive, true),
    );
  return rows.map((r) => r.id).filter((id) => id !== excludeId);
}

export async function createNotifications(userIds: string[], input: NotificationInput, options: { email?: boolean } = {}) {
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
