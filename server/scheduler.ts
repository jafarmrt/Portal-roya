import { and, eq, isNull, lte, ne } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { db } from './db/index.js';
import { birthdayAnnouncements, employees, news } from './db/schema.js';
import { broadcastChange } from './events.js';
import { runNightlyMaintenance } from './maintenance.js';
import { audienceIds, createNotifications } from './notify.js';
import { processDocumentReviews } from './routes/documents.js';
import { processGuideReviews } from './routes/guides.js';
import { processPollDeadlines } from './routes/polls.js';
import { processEventReminders } from './routes/calendar.js';
import { processTrainingReminders } from './routes/trainings.js';
import { indexMissingDocumentTexts } from './textExtract.js';
import { announceNews, processAckDeadlines } from './routes/news.js';
import { processMonthlySummary } from './reports.js';
import { fullName } from './serializers.js';

const INTERVAL_MS = 60_000;
/** Birthday notifications go out from this hour (server local time) so they greet people in the morning. */
export const BIRTHDAY_NOTIFY_HOUR = 8;

/** Announces scheduled news once their publish time has passed. */
export async function publishDueNews() {
  const due = await db
    .select()
    .from(news)
    .where(and(eq(news.isDraft, false), isNull(news.notifiedAt), lte(news.publishAt, new Date())));
  for (const item of due) await announceNews(item);
  if (due.length > 0) broadcastChange('news');
  return due.length;
}

/** The 'MM/DD' birthdays that fall on the given day; Esfand 30 birthdays move to the 29th in common years. */
export function birthdayKeysFor(now: Date) {
  const today = moment(now);
  const key = today.format('jMM/jDD');
  if (key === '12/29' && !moment.jIsLeapYear(today.jYear())) return [key, '12/30'];
  return [key];
}

/**
 * Tells everyone whose birthday it is today, once per colleague and year. Colleagues who hid
 * their birthday are skipped. Returns how many birthdays were announced.
 */
export async function announceBirthdays(now = new Date()) {
  if (now.getHours() < BIRTHDAY_NOTIFY_HOUR) return 0;
  const keys = birthdayKeysFor(now);
  const year = moment(now).jYear();
  const candidates = await db
    .select()
    .from(employees)
    .where(and(eq(employees.isActive, true), eq(employees.hideBirthday, false), ne(employees.birthDate, '')));
  let announced = 0;
  for (const emp of candidates.filter((e) => keys.includes(e.birthDate.slice(5)))) {
    const claimed = await db
      .insert(birthdayAnnouncements)
      .values({ employeeId: emp.id, jalaliYear: year })
      .onConflictDoNothing()
      .returning();
    if (claimed.length === 0) continue;
    const name = fullName(emp);
    await createNotifications([emp.id], {
      title: 'تولدتان مبارک! 🎉',
      message: `${name} عزیز، خانوادهٔ رویا زادروزتان را تبریک می‌گوید.`,
      type: 'birthday',
      linkTab: 'dashboard',
    });
    await createNotifications(await audienceIds([], emp.id), {
      title: 'امروز تولد همکارمان است 🎂',
      message: `امروز زادروز ${name} (${emp.position}) است. از داشبورد برایش پیام تبریک بفرستید.`,
      type: 'birthday',
      linkTab: 'dashboard',
    });
    announced++;
  }
  return announced;
}

export function startScheduler() {
  // Documents uploaded before search looked inside files are read once, in the background.
  setTimeout(() => indexMissingDocumentTexts().catch((err) => console.error('Document text error:', err)), 10_000).unref();
  const timer = setInterval(() => {
    publishDueNews().catch((err) => console.error('Scheduler error:', err));
    announceBirthdays().catch((err) => console.error('Birthday scheduler error:', err));
    processAckDeadlines().catch((err) => console.error('Circular deadline error:', err));
    processDocumentReviews().catch((err) => console.error('Document review error:', err));
    processGuideReviews().catch((err) => console.error('Guide review error:', err));
    processPollDeadlines().catch((err) => console.error('Poll reminder error:', err));
    processEventReminders().catch((err) => console.error('Event reminder error:', err));
    processTrainingReminders().catch((err) => console.error('Training reminder error:', err));
    processMonthlySummary().catch((err) => console.error('Monthly summary error:', err));
    runNightlyMaintenance().catch((err) => console.error('Maintenance error:', err));
  }, INTERVAL_MS);
  timer.unref();
}
