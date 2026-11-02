import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import {
  DEFAULT_SCREEN,
  IDEA_KINDS,
  IDEA_MAX,
  IDEA_REPLY_MAX,
  IDEAS_PER_PERSON,
  SONG_ARTIST_MAX,
  SONG_NOTE_MAX,
  SONG_TITLE_MAX,
  SONGS_PER_PERSON,
  ideasOpen,
  songKey,
  songsOpen,
} from '../../shared/specialEvents.js';
import { toPersianDigits } from '../../shared/jalali.js';
import type { SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { eventIdeaLikes, eventIdeas, eventSongs, eventSongVotes } from '../db/schema.js';
import { HttpError, currentUser, newId, parse, route } from '../http.js';
import { createNotifications } from '../notify.js';
import { type EventRow, type Viewer, announceChange, eventOf, eventView, logAction, phaseOf, requireReferee, rolesOf, saveScreen } from './specialEvents.js';

// «آهنگ‌ها و ایده‌ها»: everyone takes part, not only the players. Songs for the night (up to three each,
// with «من هم» votes; the same song written twice is caught) and ideas for the program («امسال چه
// کنیم؟», liked by others and answered by the organizers). Either may be sent without one's name; the
// organizers hide what does not belong and pick the song playing now for the big screen.

export const eventSongsRouter = Router();

// A literal (not built from NOTIFY at load time: specialEvents.ts imports this file too).
const FUN_NOTIFY = { type: 'event' as const, linkTab: 'event', linkId: 'fun' };

const freshView = async (eventId: string, viewer: SessionUser) => eventView(await eventOf(eventId), viewer);

/** Colleagues take part once the event is on (organizers and jurors already in its rehearsal). */
function requireTakingPart(ev: EventRow, viewer: SessionUser, open: boolean, closed: string) {
  const roles = rolesOf(ev, viewer);
  if (ev.status !== 'active' && !roles.referee) throw new HttpError(400, 'رویداد هنوز شروع نشده است.');
  if (!open) throw new HttpError(400, closed);
}

/** The songs and ideas of an event as this viewer sees them: names only when not sent anonymously. */
export async function songsView(ev: EventRow, viewer: Viewer) {
  const roles = rolesOf(ev, viewer);
  const [songs, ideas] = await Promise.all([
    db.select().from(eventSongs).where(eq(eventSongs.eventId, ev.id)).orderBy(asc(eventSongs.createdAt)),
    db.select().from(eventIdeas).where(eq(eventIdeas.eventId, ev.id)).orderBy(asc(eventIdeas.createdAt)),
  ]);
  const songIds = songs.map((s) => s.id);
  const ideaIds = ideas.map((i) => i.id);
  const [votes, likes] = await Promise.all([
    songIds.length ? db.select().from(eventSongVotes).where(inArray(eventSongVotes.songId, songIds)) : Promise.resolve([]),
    ideaIds.length ? db.select().from(eventIdeaLikes).where(inArray(eventIdeaLikes.ideaId, ideaIds)) : Promise.resolve([]),
  ]);
  const shown = <T extends { hidden: boolean; byId: string }>(row: T) => !row.hidden || roles.isOrganizer || row.byId === viewer?.id;
  const author = (row: { anonymous: boolean; byId: string }) => (row.anonymous ? null : row.byId);

  const songList = songs
    .filter(shown)
    .map((s) => {
      const voters = votes.filter((v) => v.songId === s.id);
      return {
        id: s.id,
        title: s.title,
        artist: s.artist,
        note: s.note,
        byId: author(s),
        mine: s.byId === viewer?.id,
        anonymous: s.anonymous,
        hidden: s.hidden,
        playedAt: s.playedAt?.toISOString() ?? null,
        // The one who suggested it counts too.
        votes: voters.length + 1,
        myVote: Boolean(viewer && voters.some((v) => v.employeeId === viewer.id)),
        createdAt: s.createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt));

  const ideaList = ideas
    .filter(shown)
    .map((i) => {
      const likers = likes.filter((l) => l.ideaId === i.id);
      return {
        id: i.id,
        kind: i.kind,
        text: i.text,
        byId: author(i),
        mine: i.byId === viewer?.id,
        anonymous: i.anonymous,
        hidden: i.hidden,
        doing: i.doing,
        reply: i.reply,
        likes: likers.length,
        myLike: Boolean(viewer && likers.some((l) => l.employeeId === viewer.id)),
        createdAt: i.createdAt.toISOString(),
      };
    })
    .sort((a, b) => Number(b.doing) - Number(a.doing) || b.likes - a.likes || a.createdAt.localeCompare(b.createdAt));

  return {
    songs: songList,
    ideas: ideaList,
    peopleIds: [...songList, ...ideaList].map((x) => x.byId).filter((id): id is string => Boolean(id)),
  };
}

// ─── Songs ───────────────────────────────────────────────────────────────────

async function songOf(id: string) {
  const [song] = await db.select().from(eventSongs).where(eq(eventSongs.id, id));
  if (!song) throw new HttpError(404, 'این آهنگ پیدا نشد.');
  return { song, ev: await eventOf(song.eventId) };
}

const songSchema = z.object({
  title: z.string().trim().min(1, 'نام آهنگ را بنویسید.').max(SONG_TITLE_MAX),
  artist: z.string().trim().max(SONG_ARTIST_MAX).optional(),
  note: z.string().trim().max(SONG_NOTE_MAX).optional(),
  anonymous: z.boolean().optional(),
});

eventSongsRouter.post(
  '/special_events/:id/songs',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireTakingPart(ev, viewer, songsOpen(phaseOf(ev)), 'پیشنهاد آهنگ تمام شده است.');
    const input = parse(songSchema, req.body);
    const key = songKey(input.title, input.artist ?? '');
    if (key === '|') throw new HttpError(400, 'نام آهنگ را بنویسید.');
    const [same] = await db.select().from(eventSongs).where(and(eq(eventSongs.eventId, ev.id), eq(eventSongs.key, key)));
    if (same) {
      // The same song is already on the list: vote for it instead.
      res.status(409).json({ error: `«${same.title}» قبلاً پیشنهاد شده است؛ به همان «من هم» بدهید.`, code: 'SAME_SONG', songId: same.id });
      return;
    }
    const [{ mine }] = await db.select({ mine: count() }).from(eventSongs).where(and(eq(eventSongs.eventId, ev.id), eq(eventSongs.byId, viewer.id)));
    if (mine >= SONGS_PER_PERSON) throw new HttpError(400, `هر نفر تا ${toPersianDigits(SONGS_PER_PERSON)} آهنگ پیشنهاد می‌دهد؛ اگر می‌خواهید، یکی از قبلی‌ها را حذف کنید.`);
    await db.insert(eventSongs).values({
      id: newId('song'),
      eventId: ev.id,
      title: input.title,
      artist: input.artist ?? '',
      note: input.note ?? '',
      key,
      byId: viewer.id,
      anonymous: input.anonymous ?? false,
    });
    announceChange(ev);
    res.status(201).json(await freshView(ev.id, viewer));
  }),
);

/** «من هم»: a vote for someone else's song, or taking it back. */
eventSongsRouter.put(
  '/event_songs/:id/vote',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { song, ev } = await songOf(req.params.id);
    requireTakingPart(ev, viewer, songsOpen(phaseOf(ev)), 'رأی به آهنگ‌ها تمام شده است.');
    if (song.byId === viewer.id) throw new HttpError(400, 'این آهنگ را خودتان پیشنهاد داده‌اید.');
    if (song.hidden) throw new HttpError(400, 'این آهنگ از فهرست برداشته شده است.');
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    if (on) await db.insert(eventSongVotes).values({ songId: song.id, employeeId: viewer.id }).onConflictDoNothing();
    else await db.delete(eventSongVotes).where(and(eq(eventSongVotes.songId, song.id), eq(eventSongVotes.employeeId, viewer.id)));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventSongsRouter.delete(
  '/event_songs/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { song, ev } = await songOf(req.params.id);
    if (song.byId !== viewer.id) throw new HttpError(403, 'فقط کسی که آهنگ را پیشنهاد داده آن را حذف می‌کند؛ برگزارکننده می‌تواند پنهانش کند.');
    if (song.playedAt) throw new HttpError(400, 'این آهنگ پخش شده و دیگر حذف نمی‌شود.');
    await db.delete(eventSongs).where(eq(eventSongs.id, song.id));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The organizers take a song off the list (or put it back). */
eventSongsRouter.post(
  '/event_songs/:id/hide',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { song, ev } = await songOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    const { hidden } = parse(z.object({ hidden: z.boolean() }), req.body);
    await db.update(eventSongs).set({ hidden }).where(eq(eventSongs.id, song.id));
    await logAction(ev, viewer.id, hidden ? 'آهنگ پنهان شد' : 'آهنگ برگشت', song.title);
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** «در حال پخش»: the song playing now, shown at the bottom of the big screen (null stops it). */
eventSongsRouter.post(
  '/special_events/:id/now_playing',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireReferee(ev, viewer);
    const { songId } = parse(z.object({ songId: z.string().nullable() }), req.body);
    if (songId) {
      const { song, ev: own } = await songOf(songId);
      if (own.id !== ev.id || song.hidden) throw new HttpError(400, 'این آهنگ در فهرست این رویداد نیست.');
      if (!song.playedAt) await db.update(eventSongs).set({ playedAt: new Date() }).where(eq(eventSongs.id, song.id));
    }
    const current = ev.screen ?? DEFAULT_SCREEN;
    await saveScreen(ev, { ...current, songId });
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

// ─── Ideas ───────────────────────────────────────────────────────────────────

async function ideaOf(id: string) {
  const [idea] = await db.select().from(eventIdeas).where(eq(eventIdeas.id, id));
  if (!idea) throw new HttpError(404, 'این ایده پیدا نشد.');
  return { idea, ev: await eventOf(idea.eventId) };
}

eventSongsRouter.post(
  '/special_events/:id/ideas',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const ev = await eventOf(req.params.id);
    requireTakingPart(ev, viewer, ideasOpen(phaseOf(ev)), 'وقت ایده دادن برای امسال تمام شده است.');
    const input = parse(
      z.object({
        kind: z.enum(IDEA_KINDS.map((k) => k.id) as [string, ...string[]]),
        text: z.string().trim().min(3, 'ایده را بنویسید.').max(IDEA_MAX),
        anonymous: z.boolean().optional(),
      }),
      req.body,
    );
    const [{ mine }] = await db.select({ mine: count() }).from(eventIdeas).where(and(eq(eventIdeas.eventId, ev.id), eq(eventIdeas.byId, viewer.id)));
    if (mine >= IDEAS_PER_PERSON) throw new HttpError(400, `هر نفر تا ${toPersianDigits(IDEAS_PER_PERSON)} ایده می‌نویسد.`);
    await db.insert(eventIdeas).values({
      id: newId('idea'),
      eventId: ev.id,
      kind: input.kind as (typeof eventIdeas.$inferInsert)['kind'],
      text: input.text,
      byId: viewer.id,
      anonymous: input.anonymous ?? false,
    });
    announceChange(ev);
    res.status(201).json(await freshView(ev.id, viewer));
  }),
);

eventSongsRouter.put(
  '/event_ideas/:id/like',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { idea, ev } = await ideaOf(req.params.id);
    requireTakingPart(ev, viewer, ideasOpen(phaseOf(ev)), 'وقت ایده‌ها تمام شده است.');
    if (idea.byId === viewer.id) throw new HttpError(400, 'این ایدهٔ خودتان است.');
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    if (on) await db.insert(eventIdeaLikes).values({ ideaId: idea.id, employeeId: viewer.id }).onConflictDoNothing();
    else await db.delete(eventIdeaLikes).where(and(eq(eventIdeaLikes.ideaId, idea.id), eq(eventIdeaLikes.employeeId, viewer.id)));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

eventSongsRouter.delete(
  '/event_ideas/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { idea, ev } = await ideaOf(req.params.id);
    if (idea.byId !== viewer.id) throw new HttpError(403, 'فقط نویسندهٔ ایده آن را حذف می‌کند؛ برگزارکننده می‌تواند پنهانش کند.');
    await db.delete(eventIdeas).where(eq(eventIdeas.id, idea.id));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);

/** The organizers answer an idea: «انجام می‌دهیم» with a line, hide it, or put it back. */
eventSongsRouter.post(
  '/event_ideas/:id/answer',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { idea, ev } = await ideaOf(req.params.id);
    if (!rolesOf(ev, viewer).isOrganizer) throw new HttpError(403, 'این کار با برگزارکنندگان رویداد است.');
    const input = parse(
      z.object({ doing: z.boolean().optional(), reply: z.string().trim().max(IDEA_REPLY_MAX).optional(), hidden: z.boolean().optional() }),
      req.body,
    );
    const doing = input.doing ?? idea.doing;
    const reply = input.reply ?? idea.reply;
    await db
      .update(eventIdeas)
      .set({ doing, reply, hidden: input.hidden ?? idea.hidden, repliedById: input.doing !== undefined || input.reply !== undefined ? viewer.id : idea.repliedById })
      .where(eq(eventIdeas.id, idea.id));
    if (doing && !idea.doing && ev.status === 'active') {
      await createNotifications([idea.byId], {
        ...FUN_NOTIFY,
        title: 'ایدهٔ شما در برنامهٔ امسال انجام می‌شود 🎉',
        message: `${idea.text.length > 80 ? `${idea.text.slice(0, 79)}…` : idea.text}${reply ? ` · ${reply}` : ''}`,
      });
    }
    if (input.hidden !== undefined && input.hidden !== idea.hidden) await logAction(ev, viewer.id, input.hidden ? 'ایده پنهان شد' : 'ایده برگشت', idea.text.slice(0, 80));
    announceChange(ev);
    res.json(await freshView(ev.id, viewer));
  }),
);
