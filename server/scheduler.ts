import { and, isNull, lte } from 'drizzle-orm';
import { db } from './db/index.js';
import { news } from './db/schema.js';
import { broadcastChange } from './events.js';
import { announceNews } from './routes/news.js';

const INTERVAL_MS = 60_000;

/** Announces scheduled news once their publish time has passed. */
export async function publishDueNews() {
  const due = await db
    .select()
    .from(news)
    .where(and(isNull(news.notifiedAt), lte(news.publishAt, new Date())));
  for (const item of due) await announceNews(item);
  if (due.length > 0) broadcastChange('news');
  return due.length;
}

export function startScheduler() {
  const timer = setInterval(() => {
    publishDueNews().catch((err) => console.error('Scheduler error:', err));
  }, INTERVAL_MS);
  timer.unref();
}
