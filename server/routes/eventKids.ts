import { randomInt } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_SCREEN, KID_OPTIONS, KID_PHOTO_RE } from '../../shared/specialEvents.js';
import type { SessionUser } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { eventKidGuesses, eventKidPhotos } from '../db/schema.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { type EventRow, type Viewer, announceChange, eventOf, eventView, logAction, phaseOf, requireReferee, rolesOf, saveScreen } from './specialEvents.js';
import { wheelPool } from './eventWishes.js';

// «این بچه کیه؟»: volunteers send a childhood photo. Until it is shown on the big screen only those who
// run the night see it (with whose it is). On the night each photo goes on the screen, everyone else picks
// a name on their phone among a few, then the answer is shown with today's face. The photos (rows and
// files) are deleted when the event's page closes.

export const eventKidsRouter = Router();

type PhotoRow = typeof eventKidPhotos.$inferSelect;

const freshView = async (eventId: string, viewer: SessionUser) => eventView(await eventOf(eventId), viewer);

/** Photos are sent until the program is over (one that was already shown stays as it is). */
const sendingOpen = (ev: EventRow) => !['memories', 'ended'].includes(phaseOf(ev));

/** Those who run the night see every photo with its owner, so they do not guess. */
const guesses = (ev: EventRow, viewer: Viewer, photo: PhotoRow) => Boolean(viewer && ev.status === 'active' && !rolesOf(ev, viewer).referee && photo.employeeId !== viewer.id);

async function removeFile(url: string) {
  if (!KID_PHOTO_RE.test(url)) return;
  await fs.unlink(path.join(config.uploadDir, path.basename(url))).catch(() => undefined);
}

export async function kidView(ev: EventRow, viewer: Viewer) {
  const roles = rolesOf(ev, viewer);
  const photos = await db.select().from(eventKidPhotos).where(eq(eventKidPhotos.eventId, ev.id));
  const ids = photos.map((p) => p.id);
  const picks = ids.length ? await db.select().from(eventKidGuesses).where(inArray(eventKidGuesses.photoId, ids)) : [];
  const ofPhoto = (p: PhotoRow) => picks.filter((g) => g.photoId === p.id);

  // The best guessers: right names over the photos already answered.
  const tally = new Map<string, number>();
  for (const p of photos.filter((x) => x.revealedAt)) {
    for (const g of ofPhoto(p)) if (g.pick === p.employeeId) tally.set(g.employeeId, (tally.get(g.employeeId) ?? 0) + 1);
  }
  const ranked = [...tally.entries()].map(([employeeId, correct]) => ({ employeeId, correct })).sort((a, b) => b.correct - a.correct || a.employeeId.localeCompare(b.employeeId));
  const rankOf = (i: number) => ranked.findIndex((r) => r.correct === ranked[i].correct) + 1;
  const leaders = ranked.slice(0, 10).map((r, i) => ({ ...r, rank: rankOf(i) }));
  const myIndex = viewer ? ranked.findIndex((r) => r.employeeId === viewer.id) : -1;

  // The photo on the big screen (the phones offer its names while the screen shows it).
  const onScreen = ev.screen?.scene === 'kid' ? photos.find((p) => p.id === ev.screen?.kidPhotoId && p.shownAt) : undefined;
  const current = onScreen
    ? (() => {
        const own = ofPhoto(onScreen);
        const revealed = Boolean(onScreen.revealedAt);
        const myPick = viewer ? (own.find((g) => g.employeeId === viewer.id)?.pick ?? null) : null;
        return {
          id: onScreen.id,
          url: onScreen.url,
          options: onScreen.options,
          revealed,
          ownerId: revealed || roles.referee ? onScreen.employeeId : null,
          guessed: own.length,
          right: revealed ? own.filter((g) => g.pick === onScreen.employeeId).length : null,
          // How the hall picked shows with the answer.
          counts: revealed || roles.referee ? onScreen.options.map((o) => own.filter((g) => g.pick === o).length) : null,
          myPick,
          canGuess: !revealed && guesses(ev, viewer, onScreen),
          isMine: Boolean(viewer && onScreen.employeeId === viewer.id),
        };
      })()
    : null;

  const mine = viewer ? photos.find((p) => p.employeeId === viewer.id) : undefined;
  const gallery = photos
    .filter((p) => p.revealedAt)
    .sort((a, b) => a.revealedAt!.getTime() - b.revealedAt!.getTime())
    .map((p) => ({ id: p.id, url: p.url, employeeId: p.employeeId }));
  const all = roles.referee
    ? photos
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({ id: p.id, url: p.url, employeeId: p.employeeId, shown: Boolean(p.shownAt), revealed: Boolean(p.revealedAt), guessed: ofPhoto(p).length }))
    : [];

  return {
    kid: {
      count: photos.length,
      mine: mine ? { id: mine.id, url: mine.url, shown: Boolean(mine.shownAt) } : null,
      canSend: Boolean(viewer && (ev.status === 'active' || roles.referee) && sendingOpen(ev)),
      photos: all,
      current,
      gallery,
      leaders,
      me: viewer && myIndex >= 0 ? { correct: ranked[myIndex].correct, rank: rankOf(myIndex) } : null,
      live: phaseOf(ev) === 'live',
    },
    peopleIds: [...(current?.options ?? []), ...gallery.map((g) => g.employeeId), ...leaders.map((l) => l.employeeId), ...all.map((p) => p.employeeId)],
  };
}

// ─── Volunteers ──────────────────────────────────────────────────────────────

/** Sends (or changes, until it is shown) one's childhood photo. */
eventKidsRouter.put(
  '/special_events/:id/kid_photo',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    if (ev.status !== 'active' && !rolesOf(ev, viewer).referee) throw new HttpError(400, 'رویداد هنوز شروع نشده است.');
    if (!sendingOpen(ev)) throw new HttpError(400, 'وقت فرستادن عکس کودکی تمام شده است.');
    const { url } = parse(z.object({ url: z.string().regex(KID_PHOTO_RE, 'یک عکس بفرستید.') }), req.body);
    const [existing] = await db.select().from(eventKidPhotos).where(and(eq(eventKidPhotos.eventId, ev.id), eq(eventKidPhotos.employeeId, viewer.id)));
    if (existing?.shownAt) throw new HttpError(400, 'عکس شما روی صفحهٔ بزرگ رفته و دیگر عوض نمی‌شود.');
    if (existing) {
      await db.update(eventKidPhotos).set({ url }).where(eq(eventKidPhotos.id, existing.id));
      if (existing.url !== url) await removeFile(existing.url);
    } else {
      await db.insert(eventKidPhotos).values({ id: newId('kid'), eventId: ev.id, employeeId: viewer.id, url });
    }
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** Takes one's photo back, until it is shown. */
eventKidsRouter.delete(
  '/special_events/:id/kid_photo',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    const [existing] = await db.select().from(eventKidPhotos).where(and(eq(eventKidPhotos.eventId, ev.id), eq(eventKidPhotos.employeeId, viewer.id)));
    if (!existing) throw new HttpError(404, 'عکسی نفرستاده‌اید.');
    if (existing.shownAt) throw new HttpError(400, 'عکس شما روی صفحهٔ بزرگ رفته است؛ به برگزارکننده بگویید.');
    await db.delete(eventKidPhotos).where(eq(eventKidPhotos.id, existing.id));
    await removeFile(existing.url);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

async function photoOf(id: string) {
  const [photo] = await db.select().from(eventKidPhotos).where(eq(eventKidPhotos.id, id));
  if (!photo) throw new HttpError(404, 'این عکس پیدا نشد.');
  return photo;
}

/** An organizer takes a photo out of the game (unclear, or not a childhood photo). */
eventKidsRouter.delete(
  '/event_kid_photos/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const photo = await photoOf(req.params.id);
    const ev = await eventOf(photo.eventId);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    await db.delete(eventKidPhotos).where(eq(eventKidPhotos.id, photo.id));
    await removeFile(photo.url);
    if (ev.screen?.kidPhotoId === photo.id) await saveScreen(ev, { ...ev.screen, kidPhotoId: null });
    await logAction(ev, viewer.id, 'عکس کودکی برداشته شد', '');
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── On the night ────────────────────────────────────────────────────────────

/** The names on the phones: the owner and others who sent a photo, filled up from those who took part. */
async function optionsFor(ev: EventRow, photo: PhotoRow) {
  const volunteers = (await db.select({ id: eventKidPhotos.employeeId }).from(eventKidPhotos).where(eq(eventKidPhotos.eventId, ev.id))).map((r) => r.id);
  const pick = (from: string[], n: number) => {
    const left = [...from];
    const out: string[] = [];
    while (out.length < n && left.length > 0) out.push(left.splice(randomInt(left.length), 1)[0]);
    return out;
  };
  const others = pick(
    volunteers.filter((id) => id !== photo.employeeId),
    KID_OPTIONS - 1,
  );
  if (others.length < KID_OPTIONS - 1) {
    const taken = new Set([photo.employeeId, ...others]);
    others.push(...pick((await wheelPool(ev)).filter((id) => !taken.has(id)), KID_OPTIONS - 1 - others.length));
  }
  const options = [photo.employeeId, ...others];
  // Shuffled, so the right one is not always first.
  for (let i = options.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

/** A photo goes on the big screen; the phones offer its names. */
eventKidsRouter.post(
  '/event_kid_photos/:id/show',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const photo = await photoOf(req.params.id);
    const ev = await eventOf(photo.eventId);
    requireReferee(ev, viewer);
    if (phaseOf(ev) !== 'live') throw new HttpError(400, 'عکس‌ها بعد از شروع برنامه روی صفحه می‌روند.');
    if (!photo.shownAt) {
      const options = await optionsFor(ev, photo);
      if (options.length < 2) throw new HttpError(400, 'برای حدس زدن دست‌کم دو اسم لازم است؛ هنوز کسی جز صاحب عکس در صفحه شرکت نکرده.');
      await db.update(eventKidPhotos).set({ shownAt: new Date(), options }).where(eq(eventKidPhotos.id, photo.id));
    }
    const screen = ev.screen ?? DEFAULT_SCREEN;
    await saveScreen(ev, { ...screen, scene: 'kid', kidPhotoId: photo.id, version: screen.version + 1 });
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** Whose it was: shown on the screen and the phones; guessing on it is over. */
eventKidsRouter.post(
  '/event_kid_photos/:id/reveal',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const photo = await photoOf(req.params.id);
    const ev = await eventOf(photo.eventId);
    requireReferee(ev, viewer);
    if (!photo.shownAt) throw new HttpError(400, 'اول عکس را روی صفحه ببرید.');
    if (!photo.revealedAt) await db.update(eventKidPhotos).set({ revealedAt: new Date() }).where(eq(eventKidPhotos.id, photo.id));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** A colleague's guess for the photo on now (changeable until the answer). */
eventKidsRouter.put(
  '/event_kid_photos/:id/guess',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const photo = await photoOf(req.params.id);
    const ev = await eventOf(photo.eventId);
    if (!guesses(ev, viewer, photo)) {
      throw new HttpError(403, photo.employeeId === viewer.id ? 'این عکس خود شماست!' : 'برگزارکنندگان و داوران عکس‌ها را از قبل دیده‌اند و حدس نمی‌زنند.');
    }
    if (!photo.shownAt || photo.revealedAt) throw new HttpError(400, 'وقت حدس زدن این عکس نیست.');
    const { pick } = parse(z.object({ pick: z.string() }), req.body);
    if (!photo.options.includes(pick)) throw new HttpError(400, 'یکی از اسم‌ها را انتخاب کنید.');
    await db
      .insert(eventKidGuesses)
      .values({ photoId: photo.id, employeeId: viewer.id, pick })
      .onConflictDoUpdate({ target: [eventKidGuesses.photoId, eventKidGuesses.employeeId], set: { pick, updatedAt: new Date() } });
    // No announcement: the screen polls, and forty phones need not refetch on every tap.
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The photos go once the event's page has closed (rows and files). */
export async function clearKidPhotos(ev: EventRow) {
  const photos = await db.select().from(eventKidPhotos).where(eq(eventKidPhotos.eventId, ev.id));
  if (photos.length === 0) return false;
  await db.delete(eventKidPhotos).where(eq(eventKidPhotos.eventId, ev.id));
  for (const p of photos) await removeFile(p.url);
  console.log(`Removed ${photos.length} childhood photos of «${ev.title}».`);
  return true;
}
