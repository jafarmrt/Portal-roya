import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications } from '../server/db/schema';
import { songKey } from '../shared/specialEvents';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface Song {
  id: string;
  title: string;
  artist: string;
  byId: string | null;
  mine: boolean;
  hidden: boolean;
  votes: number;
  myVote: boolean;
  playedAt: string | null;
}
interface Idea {
  id: string;
  text: string;
  byId: string | null;
  mine: boolean;
  hidden: boolean;
  doing: boolean;
  reply: string;
  likes: number;
  myLike: boolean;
}
interface View {
  event: { screen: { songId?: string | null } | null };
  songs: Song[];
  ideas: Idea[];
}

describe('«رویداد ویژه»: songs for the night and ideas for the program', () => {
  let admin: Agent;
  let organizer: Person;
  let ali: Person;
  let sara: Person;
  let eventId: string;

  const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'sg.organizer' });
    ali = await createEmployee(admin, { username: 'sg.ali' });
    sara = await createEmployee(admin, { username: 'sg.sara' });
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin.patch(`/api/special_events/${eventId}`).send({ organizerIds: [organizer.id] }).expect(200);
  });
  afterAll(() => pool.end());

  it('treats the same song written another way as the same song', () => {
    expect(songKey('گل سنگم', 'بنان')).toBe(songKey(' گلِ‌سنگم! ', 'بنان'));
    expect(songKey('Shab e Yalda', '')).toBe(songKey('shab-e yalda', ''));
    expect(songKey('يلدا', 'كيان')).toBe(songKey('یلدا', 'کیان'));
    expect(songKey('یلدا', 'الف')).not.toBe(songKey('یلدا', 'ب'));
  });

  it('takes songs only once the event is on, three each, and catches the same song twice', async () => {
    await ali.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'شب یلدا' }).expect(400);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);

    const first = (await ali.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'گل سنگم', artist: 'بنان', note: 'برای همه' }).expect(201)).body as View;
    expect(first.songs[0]).toMatchObject({ title: 'گل سنگم', byId: ali.id, mine: true, votes: 1 });
    const same = await sara.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'گلِ سنگم', artist: 'بنان' }).expect(409);
    expect(same.body).toMatchObject({ code: 'SAME_SONG', songId: first.songs[0].id });

    await ali.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'آهنگ دوم', anonymous: true }).expect(201);
    await ali.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'آهنگ سوم' }).expect(201);
    const fourth = await ali.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'آهنگ چهارم' }).expect(400);
    expect(fourth.body.error).toContain('۳');

    // An anonymous song shows no name, not even to the organizers.
    const seen = await view(organizer.agent);
    expect(seen.songs.find((s) => s.title === 'آهنگ دوم')?.byId).toBeNull();
    expect((await view(ali.agent)).songs.find((s) => s.title === 'آهنگ دوم')?.mine).toBe(true);
  });

  it('counts «من هم» votes, most wanted first, but not for one\'s own song', async () => {
    const songs = (await view(sara.agent)).songs;
    const third = songs.find((s) => s.title === 'آهنگ سوم')!;
    await ali.agent.put(`/api/event_songs/${third.id}/vote`).send({ on: true }).expect(400);
    const voted = (await sara.agent.put(`/api/event_songs/${third.id}/vote`).send({ on: true }).expect(200)).body as View;
    expect(voted.songs[0]).toMatchObject({ title: 'آهنگ سوم', votes: 2, myVote: true });
    await organizer.agent.put(`/api/event_songs/${third.id}/vote`).send({ on: true }).expect(200);
    await organizer.agent.put(`/api/event_songs/${third.id}/vote`).send({ on: false }).expect(200);
    expect((await view(ali.agent)).songs[0].votes).toBe(2);
  });

  it('lets the organizers hide a song and put one on the big screen as playing now', async () => {
    const songs = (await view(organizer.agent)).songs;
    const second = songs.find((s) => s.title === 'آهنگ دوم')!;
    await ali.agent.post(`/api/event_songs/${second.id}/hide`).send({ hidden: true }).expect(403);
    await organizer.agent.post(`/api/event_songs/${second.id}/hide`).send({ hidden: true }).expect(200);
    expect((await view(sara.agent)).songs.some((s) => s.id === second.id)).toBe(false);
    // Its author still sees it, marked hidden.
    expect((await view(ali.agent)).songs.find((s) => s.id === second.id)?.hidden).toBe(true);
    await organizer.agent.post(`/api/special_events/${eventId}/now_playing`).send({ songId: second.id }).expect(400);

    const first = songs.find((s) => s.title === 'گل سنگم')!;
    await ali.agent.post(`/api/special_events/${eventId}/now_playing`).send({ songId: first.id }).expect(403);
    const playing = (await organizer.agent.post(`/api/special_events/${eventId}/now_playing`).send({ songId: first.id }).expect(200)).body as View;
    expect(playing.event.screen?.songId).toBe(first.id);
    expect(playing.songs.find((s) => s.id === first.id)?.playedAt).toBeTruthy();
    // A song played stays on the list.
    await ali.agent.delete(`/api/event_songs/${first.id}`).expect(400);
    const third = songs.find((s) => s.title === 'آهنگ سوم')!;
    await sara.agent.delete(`/api/event_songs/${third.id}`).expect(403);
    await ali.agent.delete(`/api/event_songs/${third.id}`).expect(200);
    await organizer.agent.post(`/api/special_events/${eventId}/now_playing`).send({ songId: null }).expect(200);
    // Guests see the list only when the phone book is open to them, and cannot add to it.
    await request(app).post(`/api/special_events/${eventId}/songs`).send({ title: 'x' }).expect(401);
  });

  it('collects ideas, likes them, and tells the author when the organizers will do it', async () => {
    const made = (await sara.agent.post(`/api/special_events/${eventId}/ideas`).send({ kind: 'game', text: 'مسابقهٔ شعرخوانی حافظ' }).expect(201)).body as View;
    const idea = made.ideas[0];
    expect(idea).toMatchObject({ byId: sara.id, likes: 0, doing: false });
    await sara.agent.put(`/api/event_ideas/${idea.id}/like`).send({ on: true }).expect(400);
    await ali.agent.put(`/api/event_ideas/${idea.id}/like`).send({ on: true }).expect(200);
    await sara.agent.post(`/api/special_events/${eventId}/ideas`).send({ kind: 'nope', text: 'xxx' }).expect(400);

    await ali.agent.post(`/api/event_ideas/${idea.id}/answer`).send({ doing: true }).expect(403);
    const answered = (await organizer.agent.post(`/api/event_ideas/${idea.id}/answer`).send({ doing: true, reply: 'ساعت ۱۶ روی صحنه' }).expect(200)).body as View;
    expect(answered.ideas[0]).toMatchObject({ doing: true, reply: 'ساعت ۱۶ روی صحنه', likes: 1 });
    const notes = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, sara.id), eq(notifications.type, 'event')))
      .orderBy(asc(notifications.id));
    expect(notes.at(-1)?.title).toContain('ایدهٔ شما');

    const other = (await ali.agent.post(`/api/special_events/${eventId}/ideas`).send({ kind: 'food', text: 'آش رشته', anonymous: true }).expect(201)).body as View;
    const soup = other.ideas.find((i) => i.text === 'آش رشته')!;
    expect(soup.byId).toBeNull();
    await organizer.agent.post(`/api/event_ideas/${soup.id}/answer`).send({ hidden: true }).expect(200);
    expect((await view(sara.agent)).ideas.some((i) => i.id === soup.id)).toBe(false);
    await ali.agent.delete(`/api/event_ideas/${soup.id}`).expect(200);
  });

  it('closes ideas once the program day comes, while songs stay open until the night', async () => {
    await admin.patch(`/api/special_events/${eventId}`).send({ signupEnd: day(-3), programDate: day(0), programTime: '23:59' }).expect(200);
    const late = await sara.agent.post(`/api/special_events/${eventId}/ideas`).send({ kind: 'game', text: 'یک ایدهٔ دیر' }).expect(400);
    expect(late.body.error).toContain('تمام');
    await sara.agent.post(`/api/special_events/${eventId}/songs`).send({ title: 'آهنگ روز برنامه' }).expect(201);
  });
});
