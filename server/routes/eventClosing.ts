import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { toPersianDigits } from '../../shared/jalali.js';
import { audit } from '../audit.js';
import { can } from '../auth.js';
import { db } from '../db/index.js';
import { news, specialEvents } from '../db/schema.js';
import { HttpError, currentUser, newId, route } from '../http.js';
import { broadcastChange } from '../events.js';
import { sanitizeRichText } from '../richText.js';
import { ensureSettings } from '../settings.js';
import { type EventRow, eventOf, eventView, logAction, phaseOf, rolesOf } from './specialEvents.js';

// «خبر پایانی»: after the program an organizer turns the night into a news draft (champions, the
// winners of the awards and of the games for everyone, a few wishes, thanks to those who ran it). The
// news publishers read it, add photos and publish it from «اخبار» as usual.

export const eventClosingRouter = Router();

type View = Awaited<ReturnType<typeof eventView>>;

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');
const MEDALS = ['🥇', '🥈', '🥉'];

/** The report of the night as news HTML, from what the page shows. */
export function closingReport(ev: Pick<EventRow, 'title' | 'programDate' | 'programPlace'>, view: View) {
  const name = (id: string | null | undefined) => esc((id && view.people[id]?.name) || 'همکار');
  const names = (ids: string[]) => ids.map(name).join('، ');
  const parts: string[] = [];

  const intro = `«${esc(ev.title)}» ${toPersianDigits(ev.programDate)}${ev.programPlace ? ` در ${esc(ev.programPlace)}` : ''} برگزار شد. از همهٔ همکارانی که آمدند، بازی کردند، حدس زدند و آرزو نوشتند ممنونیم.`;
  parts.push(`<p>${intro}</p>`);

  const champions = view.competitions
    .filter((c) => c.champion)
    .map((c) => {
      const entry = c.entries.find((e) => e.id === c.champion);
      const who = entry ? (entry.name ? `${esc(entry.name)} (${names(entry.members)})` : names(entry.members)) : '';
      return `${esc(c.icon)} <strong>${esc(c.title)}</strong>: ${who}`;
    });
  if (champions.length) parts.push(`<h3>قهرمان‌ها</h3>${list(champions)}`);

  const awards = view.awards.filter((a) => a.stage === 'revealed' && a.winnerId).map((a) => `${esc(a.icon)} <strong>${esc(a.title)}</strong>: ${name(a.winnerId)}`);
  if (awards.length) parts.push(`<h3>انتخاب‌های یلدا</h3>${list(awards)}`);

  const games: string[] = [];
  const quizTop = view.quiz.leaders.slice(0, 3);
  if (quizTop.length) games.push(`<strong>مسابقهٔ همه:</strong> ${quizTop.map((l) => `${MEDALS[l.rank - 1] ?? ''} ${name(l.employeeId)}`).join('، ')}`);
  const predictTop = view.predictions.leaders.filter((l) => l.rank === 1);
  if (predictTop.length) games.push(`<strong>بهترین پیش‌بین:</strong> ${names(predictTop.map((l) => l.employeeId))}`);
  if (view.guess?.revealed && view.guess.answer !== null) {
    const first = view.guess.winners[0];
    games.push(
      `<strong>${esc(view.guess.question)}</strong> جواب: ${toPersianDigits(view.guess.answer)}${first ? `؛ نزدیک‌ترین حدس: ${name(first.employeeId)} (${toPersianDigits(first.value)})` : ''}`,
    );
  }
  const kidTop = view.kid.leaders.filter((l) => l.rank === 1);
  if (view.kid.gallery.length) {
    games.push(
      `<strong>این بچه کیه؟</strong> ${toPersianDigits(view.kid.gallery.length)} عکس کودکی${kidTop.length ? `؛ بهترین حدس: ${names(kidTop.map((l) => l.employeeId))}` : ''}`,
    );
  }
  const wheel = view.wheel.spins.filter((s) => !s.absent);
  if (wheel.length) games.push(`<strong>گردونهٔ شانس:</strong> ${wheel.map((s) => `${name(s.winnerId)}${s.prize ? ` (${esc(s.prize)})` : ''}`).join('، ')}`);
  if (games.length) parts.push(`<h3>بازی‌های همه</h3>${list(games)}`);

  const wishes = [...view.wishes.wall].reverse().slice(0, 3);
  if (wishes.length) {
    parts.push(`<h3>از دیوار آرزوها</h3>${wishes.map((w) => `<blockquote>«${esc(w.text)}»${w.byId ? ` (${name(w.byId)})` : ''}</blockquote>`).join('')}`);
  }

  const thanks = [...new Set([...view.event.organizerIds, ...view.event.juryIds])];
  if (thanks.length) parts.push(`<p>با تشکر از برگزارکنندگان و داوران: ${names(thanks)}.</p>`);

  return sanitizeRichText(parts.join(''));
}

/** Makes the draft (or refreshes the one made before, while it is still a draft). */
eventClosingRouter.post(
  '/special_events/:id/closing_news',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    if (!['live', 'memories', 'ended'].includes(phaseOf(ev))) throw new HttpError(400, 'خبر پایانی بعد از شروع برنامه نوشته می‌شود.');
    const view = await eventView(ev, viewer);
    const content = closingReport(ev, view);
    const title = `گزارش ${ev.title}`;
    const summary = `قهرمان‌ها، برنده‌ها و لحظه‌های «${ev.title}».`;

    const [existing] = ev.closingNewsId ? await db.select().from(news).where(eq(news.id, ev.closingNewsId)) : [];
    if (existing && !existing.isDraft) throw new HttpError(400, 'خبر پایانی منتشر شده است؛ تغییرش از بخش اخبار است.');
    let id: string;
    if (existing) {
      id = existing.id;
      await db.update(news).set({ title, summary, content, contentFormat: 'html', updatedAt: new Date() }).where(eq(news.id, id));
    } else {
      const categories = (await ensureSettings()).newsCategories;
      const category = categories.find((c) => c.includes('رویداد') || c.includes('جشن')) ?? categories[0] ?? 'اخبار سازمان';
      id = newId('news');
      await db.insert(news).values({ id, title, summary, content, contentFormat: 'html', category, authorId: viewer.id, isDraft: true, tags: ['یلدا'] });
      await db.update(specialEvents).set({ closingNewsId: id }).where(eq(specialEvents.id, ev.id));
      await audit(viewer, { action: 'create', entity: 'news', id, title, detail: 'پیش‌نویس خبر پایانی رویداد' });
    }
    await logAction(ev, viewer.id, existing ? 'پیش‌نویس خبر پایانی به‌روز شد' : 'پیش‌نویس خبر پایانی ساخته شد', '');
    broadcastChange('news');
    res.json({ newsId: id, refreshed: Boolean(existing), canPublish: can(viewer, 'news.manage') });
  }),
);
