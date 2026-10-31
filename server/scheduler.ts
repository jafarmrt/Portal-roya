import { and, eq, isNull, lte, ne } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { db } from './db/index.js';
import { birthdayAnnouncements, employees, news, occasionAnnouncements } from './db/schema.js';
import { defaultFoundingMessage, yearsLabel, yearsSince } from '../shared/celebrations.js';
import { broadcastChange } from './events.js';
import { runNightlyMaintenance } from './maintenance.js';
import { audienceIds, createNotifications } from './notify.js';
import { processDocumentReviews } from './routes/documents.js';
import { processGuideReviews } from './routes/guides.js';
import { processPollDeadlines } from './routes/polls.js';
import { processEventReminders } from './routes/calendar.js';
import { processTrainingReminders } from './routes/trainings.js';
import { processTodoReminders } from './routes/todos.js';
import { startDueNotices } from './routes/notices.js';
import { releaseAnonymousSuggestions } from './routes/suggestions.js';
import { indexMissingDocumentTexts } from './textExtract.js';
import { announceNews, processAckDeadlines } from './routes/news.js';
import { processMonthlySummary } from './reports.js';
import { fullName } from './serializers.js';
import { ensureSettings } from './settings.js';

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

/** Claims an announcement for this year; false when it already went out (e.g. after a restart). */
async function claimOccasion(kind: 'anniversary' | 'founding', subjectId: string, year: number) {
  const claimed = await db.insert(occasionAnnouncements).values({ kind, subjectId, jalaliYear: year }).onConflictDoNothing().returning();
  return claimed.length > 0;
}

/**
 * Congratulates colleagues on the anniversary of their hire date, once a year from 08:00, and lets
 * their own department know so they can send a card. Colleagues who opted out are skipped.
 */
export async function announceWorkAnniversaries(now = new Date()) {
  if (now.getHours() < BIRTHDAY_NOTIFY_HOUR) return 0;
  const keys = birthdayKeysFor(now);
  const year = moment(now).jYear();
  const candidates = await db
    .select()
    .from(employees)
    .where(and(eq(employees.isActive, true), eq(employees.hideAnniversary, false), ne(employees.hireDate, '')));
  let announced = 0;
  for (const emp of candidates.filter((e) => keys.includes(e.hireDate.slice(5)))) {
    const years = yearsSince(emp.hireDate, now);
    if (years < 1 || !(await claimOccasion('anniversary', emp.id, year))) continue;
    const name = fullName(emp);
    await createNotifications([emp.id], {
      title: 'سالگرد همکاری‌تان مبارک! 🎉',
      message: `${name} عزیز، ${yearsLabel(years)} همراهی‌تان با رویا را تبریک می‌گوییم و از تلاش‌هایتان سپاسگزاریم.`,
      type: 'birthday',
      linkTab: 'dashboard',
    });
    await createNotifications(await audienceIds([emp.department], emp.id), {
      title: 'سالگرد همکاری همکارمان 🎉',
      message: `امروز ${yearsLabel(years)} از همکاری ${name} با رویا می‌گذرد. از داشبورد برایش کارت تبریک بفرستید.`,
      type: 'birthday',
      linkTab: 'dashboard',
    });
    announced++;
  }
  return announced;
}

/** On the company's founding day everyone gets the founding message, once a year from 08:00. */
export async function announceFoundingDay(now = new Date()) {
  if (now.getHours() < BIRTHDAY_NOTIFY_HOUR) return false;
  const { foundingDate, foundingMessage } = await ensureSettings();
  const years = yearsSince(foundingDate, now);
  if (years < 1 || !birthdayKeysFor(now).includes(foundingDate.slice(5))) return false;
  if (!(await claimOccasion('founding', 'company', moment(now).jYear()))) return false;
  await createNotifications(await audienceIds(), {
    title: `${yearsLabel(years)} با رویا؛ سالگرد تأسیس مبارک! 🎉`,
    message: foundingMessage || defaultFoundingMessage(years),
    type: 'birthday',
    linkTab: 'dashboard',
  });
  return true;
}

export function startScheduler() {
  // Documents uploaded before search looked inside files are read once, in the background.
  setTimeout(() => indexMissingDocumentTexts().catch((err) => console.error('Document text error:', err)), 10_000).unref();
  const timer = setInterval(() => {
    publishDueNews().catch((err) => console.error('Scheduler error:', err));
    announceBirthdays().catch((err) => console.error('Birthday scheduler error:', err));
    announceWorkAnniversaries().catch((err) => console.error('Work anniversary error:', err));
    announceFoundingDay().catch((err) => console.error('Founding day error:', err));
    processAckDeadlines().catch((err) => console.error('Circular deadline error:', err));
    processDocumentReviews().catch((err) => console.error('Document review error:', err));
    processGuideReviews().catch((err) => console.error('Guide review error:', err));
    processPollDeadlines().catch((err) => console.error('Poll reminder error:', err));
    processEventReminders().catch((err) => console.error('Event reminder error:', err));
    processTrainingReminders().catch((err) => console.error('Training reminder error:', err));
    processTodoReminders().catch((err) => console.error('To-do reminder error:', err));
    startDueNotices().catch((err) => console.error('Notice board error:', err));
    releaseAnonymousSuggestions().catch((err) => console.error('Suggestion release error:', err));
    processMonthlySummary().catch((err) => console.error('Monthly summary error:', err));
    runNightlyMaintenance().catch((err) => console.error('Maintenance error:', err));
  }, INTERVAL_MS);
  timer.unref();
}
