import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications } from '../server/db/schema';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface Match {
  id: string;
  round: number;
  slot: number;
  roundName: string;
  entryA: string | null;
  entryB: string | null;
  scoreA: number | null;
  winnerId: string | null;
  done: boolean;
  onStage: boolean;
}
interface Competition {
  id: string;
  title: string;
  format: string;
  rankBy: string;
  words: string[];
  wordsUsed: number;
  champion: string | null;
  championTie: string[];
  entries: { id: string; members: string[] }[];
  matches: Match[];
}
interface View {
  competitions: Competition[];
  log: { action: string; detail: string }[];
}

const eventNotes = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'event'))).orderBy(asc(notifications.id));

describe('«رویداد ویژه»: points tables, rankings and the pantomime word card', () => {
  let admin: Agent;
  let organizer: Person;
  let juror1: Person;
  let juror2: Person;
  let juror3: Person;
  let players: Person[];
  let eventId: string;
  let leagueId: string;
  let rankingId: string;

  const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;
  const competition = async (agent: Agent | Person['agent'], id: string) => (await view(agent)).competitions.find((c) => c.id === id)!;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'fm.organizer' });
    juror1 = await createEmployee(admin, { username: 'fm.juror1' });
    juror2 = await createEmployee(admin, { username: 'fm.juror2' });
    juror3 = await createEmployee(admin, { username: 'fm.juror3' });
    players = [];
    for (const name of ['a', 'b', 'c', 'd']) players.push(await createEmployee(admin, { username: `fm.${name}` }));
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin
      .patch(`/api/special_events/${eventId}`)
      .send({ organizerIds: [organizer.id], juryIds: [juror1.id, juror2.id, juror3.id], juryHeadId: juror1.id })
      .expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
  });
  afterAll(() => pool.end());

  it('builds a points table only up to ten entries and without a separate final', async () => {
    const base = { title: 'پینگ‌پنگ', kind: 'individual', scoring: 'points', tieRule: 'penalties', format: 'league', dayPlace: 'لابی', dayStart: '10:00', slotMinutes: 15 };
    const big = await organizer.agent.post(`/api/special_events/${eventId}/competitions`).send({ ...base, capacity: 12, stagePolicy: 'none' }).expect(400);
    expect(big.body.error).toContain('۱۰');
    await organizer.agent.post(`/api/special_events/${eventId}/competitions`).send({ ...base, capacity: 4, stagePolicy: 'final' }).expect(400);
    const made = (await organizer.agent.post(`/api/special_events/${eventId}/competitions`).send({ ...base, capacity: 4, stagePolicy: 'none', thirdPlace: true }).expect(201)).body as View;
    const league = made.competitions[0];
    leagueId = league.id;
    expect(league).toMatchObject({ format: 'league' });
    expect((league as unknown as { thirdPlace: boolean; tieRule: string }).thirdPlace).toBe(false);
    expect((league as unknown as { tieRule: string }).tieRule).toBe('organizer');
  });

  it('draws everyone against everyone, scores a draw as a draw, and ranks the table', async () => {
    for (const p of players) await p.agent.post(`/api/event_competitions/${leagueId}/entries`).send({}).expect(201);
    const drawn = (await organizer.agent.post(`/api/event_competitions/${leagueId}/draw`).expect(200)).body as View;
    const league = drawn.competitions.find((c) => c.id === leagueId)!;
    expect(league.matches).toHaveLength(6);
    expect(new Set(league.matches.map((m) => m.round))).toEqual(new Set([1, 2, 3]));
    expect(league.matches[0].roundName).toBe('دور ۱');
    expect(league.matches.every((m) => m.entryA && m.entryB && !m.onStage)).toBe(true);
    // 15 minutes apart, one after another.
    await organizer.agent.post(`/api/event_competitions/${leagueId}/publish`).expect(200);
    // One note per player for all their matches, not one per match.
    const notes = await eventNotes(players[0].id);
    expect(notes.filter((n) => n.title.includes('بازی جدول امتیازی'))).toHaveLength(1);
    expect(notes.at(-1)?.title).toContain('۳ بازی');

    const [first, ...rest] = league.matches;
    const drawRes = (await juror1.agent.post(`/api/event_matches/${first.id}/result`).send({ scoreA: 2, scoreB: 2 }).expect(200)).body as { view: View };
    const drawnMatch = drawRes.view.competitions.find((c) => c.id === leagueId)!.matches.find((m) => m.id === first.id)!;
    expect(drawnMatch).toMatchObject({ done: true, winnerId: null });
    expect(drawRes.view.log[0].detail).toContain('مساوی');
    // Taken back at once, then entered again.
    await juror1.agent.post(`/api/event_matches/${first.id}/undo`).expect(200);
    expect((await competition(organizer.agent, leagueId)).matches.find((m) => m.id === first.id)!.done).toBe(false);
    await juror1.agent.post(`/api/event_matches/${first.id}/result`).send({ scoreA: 2, scoreB: 2 }).expect(200);
    // A correction of a draw needs a reason like any other.
    await juror1.agent.post(`/api/event_matches/${first.id}/result`).send({ scoreA: 3, scoreB: 2 }).expect(400);

    // The rest: the first side always wins 1–0, so the table is not level at the top.
    for (const m of rest) await organizer.agent.post(`/api/event_matches/${m.id}/result`).send({ scoreA: 1, scoreB: 0 }).expect(200);
    const done = await competition(players[0].agent, leagueId);
    expect(done.matches.every((m) => m.done)).toBe(true);
    // Whoever is first gets the title once everything is played (or a shared first place waits for the jury).
    expect(Boolean(done.champion) !== done.championTie.length > 0).toBe(true);
  });

  it('ranks performances by time, lets the jury pick when first place is shared, and announces the champion', async () => {
    const made = (
      await organizer.agent
        .post(`/api/special_events/${eventId}/competitions`)
        .send({ title: 'انار دانه کردن', kind: 'individual', capacity: 8, scoring: 'goals', tieRule: 'penalties', format: 'ranking', rankBy: 'time', stagePolicy: 'all' })
        .expect(201)
    ).body as View;
    const ranking = made.competitions.find((c) => c.format === 'ranking')!;
    rankingId = ranking.id;
    expect(ranking.rankBy).toBe('time');
    expect((ranking as unknown as { scoring: string }).scoring).toBe('points');
    for (const p of players.slice(0, 3)) await p.agent.post(`/api/event_competitions/${rankingId}/entries`).send({}).expect(201);
    await organizer.agent.post(`/api/event_competitions/${rankingId}/draw`).expect(200);
    await organizer.agent.post(`/api/event_competitions/${rankingId}/publish`).expect(200);
    const drawn = await competition(organizer.agent, rankingId);
    expect(drawn.matches).toHaveLength(3);
    expect(drawn.matches.every((m) => m.entryA && !m.entryB && m.onStage)).toBe(true);
    expect(drawn.matches.map((m) => m.roundName).sort()).toEqual(['نوبت ۱', 'نوبت ۲', 'نوبت ۳']);
    expect((await eventNotes(players[0].id)).at(-1)?.title).toContain('نوبت');

    const [m1, m2, m3] = drawn.matches;
    await organizer.agent.post(`/api/event_matches/${m1.id}/result`).send({}).expect(400);
    await organizer.agent.post(`/api/event_matches/${m1.id}/result`).send({ value: 653 }).expect(200);
    await organizer.agent.post(`/api/event_matches/${m2.id}/result`).send({ value: 653 }).expect(200);
    expect((await competition(organizer.agent, rankingId)).champion).toBeNull();
    // The third did not come: ranked after everyone.
    await organizer.agent.post(`/api/event_matches/${m3.id}/result`).send({ walkover: true }).expect(200);
    const tied = await competition(organizer.agent, rankingId);
    expect(tied.champion).toBeNull();
    expect(tied.championTie.sort()).toEqual([m1.entryA, m2.entryA].sort());
    expect((await eventNotes(juror2.id)).at(-1)?.title).toContain('مساوی');

    // The organizer may not pick when there is a jury; a juror picks among the tied only.
    await organizer.agent.post(`/api/event_competitions/${rankingId}/champion`).send({ entryId: m1.entryA }).expect(403);
    await juror2.agent.post(`/api/event_competitions/${rankingId}/champion`).send({ entryId: m3.entryA }).expect(400);
    const picked = (await juror2.agent.post(`/api/event_competitions/${rankingId}/champion`).send({ entryId: m2.entryA }).expect(200)).body as View;
    expect(picked.competitions.find((c) => c.id === rankingId)!.champion).toBe(m2.entryA);
    expect((await eventNotes(players[3].id)).at(-1)?.title).toContain('قهرمان انار دانه کردن');
  });

  it('keeps the pantomime words from players and deals them one at a time without repeats', async () => {
    const made = (
      await organizer.agent
        .post(`/api/special_events/${eventId}/competitions`)
        .send({ title: 'پانتومیم', kind: 'individual', capacity: 4, scoring: 'points', tieRule: 'organizer', format: 'ranking', stagePolicy: 'all', words: ['انار', ' هندوانه ', 'انار', 'کرسی'] })
        .expect(201)
    ).body as View;
    const panto = made.competitions.find((c) => c.title === 'پانتومیم')!;
    expect(panto.words).toEqual(['انار', 'هندوانه', 'کرسی']);
    expect((await competition(players[0].agent, panto.id)).words).toEqual([]);
    await players[0].agent.post(`/api/event_competitions/${panto.id}/word`).send({ action: 'next' }).expect(403);

    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const { word, left } = (await organizer.agent.post(`/api/event_competitions/${panto.id}/word`).send({ action: 'next' }).expect(200)).body as { word: string; left: number };
      seen.add(word);
      expect(left).toBe(2 - i);
    }
    expect(seen.size).toBe(3);
    const empty = await juror1.agent.post(`/api/event_competitions/${panto.id}/word`).send({ action: 'next' }).expect(400);
    expect(empty.body.error).toContain('تمام');
    expect((await competition(organizer.agent, panto.id)).wordsUsed).toBe(3);
    await organizer.agent.post(`/api/event_competitions/${panto.id}/word`).send({ action: 'reset' }).expect(200);
    expect((await competition(organizer.agent, panto.id)).wordsUsed).toBe(0);
  });
});
