import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications, specialEvents } from '../server/db/schema';
import { guessOrder, predictionRight } from '../shared/specialEvents';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface Match {
  id: string;
  round: number;
  entryA: string | null;
  entryB: string | null;
  winnerId: string | null;
  onStage: boolean;
}
interface Prediction {
  open: boolean;
  canPick: boolean;
  mine: string | null;
  counts: { a: number; b: number; draw: number; total: number } | null;
}
interface View {
  competitions: { id: string; champion: string | null; entries: { id: string; members: string[] }[]; matches: Match[] }[];
  predictions: {
    matches: Record<string, Prediction>;
    leaders: { employeeId: string; correct: number; total: number; rank: number }[];
    me: { correct: number; total: number; waiting: number } | null;
  };
  guess: {
    question: string;
    open: boolean;
    canGuess: boolean;
    count: number;
    mine: number | null;
    revealed: boolean;
    answer: number | null;
    winners: { employeeId: string; value: number; diff: number }[];
    myRank: number | null;
  } | null;
}

const eventNotes = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'event'))).orderBy(asc(notifications.id));

describe('shared rules of the games', () => {
  it('counts a prediction right only for the winner, or a real draw', () => {
    expect(predictionRight('a', { done: true, winnerId: 'a', walkover: false })).toBe(true);
    expect(predictionRight('b', { done: true, winnerId: 'a', walkover: false })).toBe(false);
    expect(predictionRight('a', { done: false, winnerId: null, walkover: false })).toBe(false);
    expect(predictionRight('draw', { done: true, winnerId: null, walkover: false })).toBe(true);
    expect(predictionRight('draw', { done: true, winnerId: null, walkover: true })).toBe(false);
  });

  it('orders guesses by closeness, the earlier first when two are as close', () => {
    const order = guessOrder(
      [
        { employeeId: 'late', value: 400, at: '2026-11-02T10:00:00Z' },
        { employeeId: 'early', value: 420, at: '2026-11-01T10:00:00Z' },
        { employeeId: 'far', value: 300, at: '2026-10-01T10:00:00Z' },
      ],
      410,
    );
    expect(order.map((g) => g.employeeId)).toEqual(['early', 'late', 'far']);
    expect(order[0].diff).toBe(10);
  });
});

describe('«رویداد ویژه»: winner predictions, «چند دانه؟» and the champions\' badges', () => {
  let admin: Agent;
  let organizer: Person;
  let jurors: Person[];
  let players: Person[];
  let w1: Person;
  let w2: Person;
  let eventId: string;
  let competitionId: string;

  const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;
  const matches = async (agent: Agent | Person['agent']) => (await view(agent)).competitions.find((c) => c.id === competitionId)!.matches;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'gm.organizer' });
    jurors = [];
    for (const n of [1, 2, 3]) jurors.push(await createEmployee(admin, { username: `gm.juror${n}` }));
    players = [];
    for (const n of ['a', 'b', 'c', 'd']) players.push(await createEmployee(admin, { username: `gm.${n}` }));
    w1 = await createEmployee(admin, { username: 'gm.w1' });
    w2 = await createEmployee(admin, { username: 'gm.w2' });
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin
      .patch(`/api/special_events/${eventId}`)
      .send({ organizerIds: [organizer.id], juryIds: jurors.map((j) => j.id), juryHeadId: jurors[0].id })
      .expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
    const made = (
      await organizer.agent
        .post(`/api/special_events/${eventId}/competitions`)
        .send({ title: 'فیفا', kind: 'individual', capacity: 4, scoring: 'goals', tieRule: 'penalties', stagePolicy: 'final', dayPlace: 'اتاق VIP', dayStart: '10:00', slotMinutes: 20 })
        .expect(201)
    ).body as View;
    competitionId = made.competitions[0].id;
    for (const p of players) await p.agent.post(`/api/event_competitions/${competitionId}/entries`).send({}).expect(201);
    await organizer.agent.post(`/api/event_competitions/${competitionId}/draw`).expect(200);
    await organizer.agent.post(`/api/event_competitions/${competitionId}/publish`).expect(200);
  });
  afterAll(() => pool.end());

  it('lets everyone but the players and the jury predict, and shows the others\' picks only after one\'s own', async () => {
    const all = await matches(w1.agent);
    const semis = all.filter((m) => m.round === 1);
    const [s1, s2] = semis;
    const before = await view(w1.agent);
    expect(before.predictions.matches[s1.id]).toMatchObject({ open: true, canPick: true, mine: null, counts: null });
    expect(before.predictions.me?.waiting).toBe(2);
    // The final waits for its sides.
    expect(before.predictions.matches[all.find((m) => m.round === 2)!.id]).toBeUndefined();

    const playerOf = (entryId: string) => players.find((p) => before.competitions[0].entries.find((e) => e.id === entryId)!.members.includes(p.id))!;
    const inS1 = playerOf(s1.entryA!);
    expect((await view(inS1.agent)).predictions.matches[s1.id].canPick).toBe(false);
    await inS1.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryB }).expect(403);
    await jurors[1].agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryA }).expect(403);
    // A player may predict the other semi-final.
    await inS1.agent.put(`/api/event_matches/${s2.id}/prediction`).send({ pick: s2.entryA }).expect(200);

    await w1.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: 'draw' }).expect(400);
    const picked = (await w1.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryA }).expect(200)).body as View;
    expect(picked.predictions.matches[s1.id]).toMatchObject({ mine: s1.entryA, counts: { a: 1, b: 0, total: 1 } });
    expect(picked.predictions.me?.waiting).toBe(1);
    // Changed, then changed back: still one pick.
    await w1.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryB }).expect(200);
    await w1.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryA }).expect(200);
    expect((await view(w2.agent)).predictions.matches[s1.id].counts).toBeNull();
    expect((await view(organizer.agent)).predictions.matches[s1.id].counts).toMatchObject({ a: 1, total: 1 });
    await w2.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryB }).expect(200);
    await w2.agent.put(`/api/event_matches/${s2.id}/prediction`).send({ pick: s2.entryA }).expect(200);

    // Once a result is in, picking is over and the table of predictors starts.
    await jurors[0].agent.post(`/api/event_matches/${s1.id}/result`).send({ scoreA: 2, scoreB: 1 }).expect(200);
    await w2.agent.put(`/api/event_matches/${s1.id}/prediction`).send({ pick: s1.entryA }).expect(400);
    await jurors[0].agent.post(`/api/event_matches/${s2.id}/result`).send({ scoreA: 3, scoreB: 0 }).expect(200);
    const after = await view(w2.agent);
    expect(after.predictions.matches[s1.id]).toMatchObject({ open: false, counts: { a: 1, b: 1, total: 2 } });
    expect(after.predictions.me).toMatchObject({ correct: 1, total: 2 });
    const leaders = after.predictions.leaders;
    // w1 and the player: one right of one; w2: one right of two.
    expect(leaders.map((l) => [l.correct, l.total, l.rank])).toEqual([
      [1, 1, 1],
      [1, 1, 1],
      [1, 2, 3],
    ]);
    expect(leaders.at(-1)!.employeeId).toBe(w2.id);

    // The final on stage is open until the program starts.
    const final = (await matches(w1.agent)).find((m) => m.round === 2)!;
    await w1.agent.put(`/api/event_matches/${final.id}/prediction`).send({ pick: final.entryA }).expect(200);
  });

  it('plays «چند دانه؟»: the organizers ask, colleagues guess until the program, the closest (earliest on a tie) wins', async () => {
    expect((await view(w1.agent)).guess).toBeNull();
    await w1.agent.put(`/api/special_events/${eventId}/guess_question`).send({ question: 'چند دانه؟' }).expect(403);
    await organizer.agent.put(`/api/special_events/${eventId}/guess_question`).send({ question: 'انار روی میز چند دانه دارد؟' }).expect(200);
    expect((await view(w1.agent)).guess).toMatchObject({ question: 'انار روی میز چند دانه دارد؟', open: true, canGuess: true, count: 0, mine: null });

    await organizer.agent.put(`/api/special_events/${eventId}/guess`).send({ value: 1 }).expect(403);
    await jurors[0].agent.put(`/api/special_events/${eventId}/guess`).send({ value: 1 }).expect(403);
    await w1.agent.put(`/api/special_events/${eventId}/guess`).send({ value: 1.5 }).expect(400);
    await w1.agent.put(`/api/special_events/${eventId}/guess`).send({ value: 500 }).expect(200);
    await w2.agent.put(`/api/special_events/${eventId}/guess`).send({ value: 380 }).expect(200);
    await players[0].agent.put(`/api/special_events/${eventId}/guess`).send({ value: 420 }).expect(200);
    // Changed later: as close as players[0] now, but later.
    const changed = (await w1.agent.put(`/api/special_events/${eventId}/guess`).send({ value: 400 }).expect(200)).body as View;
    expect(changed.guess).toMatchObject({ count: 3, mine: 400, revealed: false, answer: null, winners: [] });

    // The answer is opened only once the program has started.
    await organizer.agent.post(`/api/special_events/${eventId}/guess_reveal`).send({ answer: 410 }).expect(400);
    await db.update(specialEvents).set({ programDate: today, programTime: '00:00', signupEnd: day(-3), showUntil: day(2) }).where(eq(specialEvents.id, eventId));
    await w2.agent.put(`/api/special_events/${eventId}/guess`).send({ value: 410 }).expect(400);
    await w1.agent.post(`/api/special_events/${eventId}/guess_reveal`).send({ answer: 410 }).expect(403);
    await jurors[2].agent.post(`/api/special_events/${eventId}/guess_reveal`).send({ answer: 410 }).expect(200);

    const shown = await view(w1.agent);
    expect(shown.guess).toMatchObject({ revealed: true, answer: 410, open: false, myRank: 2 });
    expect(shown.guess!.winners.map((w) => [w.employeeId, w.diff])).toEqual([
      [players[0].id, 10],
      [w1.id, 10],
      [w2.id, 30],
    ]);
    const notes = await eventNotes(players[0].id);
    expect(notes.filter((n) => n.title.includes('نزدیک‌تر'))).toHaveLength(1);
    // A corrected answer does not notify again; the game cannot be switched off once opened.
    await organizer.agent.post(`/api/special_events/${eventId}/guess_reveal`).send({ answer: 411 }).expect(200);
    expect((await eventNotes(players[0].id)).filter((n) => n.title.includes('نزدیک‌تر'))).toHaveLength(1);
    await organizer.agent.put(`/api/special_events/${eventId}/guess_question`).send({ question: '' }).expect(400);

    // The big screen sees the answer and the winners too.
    const screen = (await organizer.agent.put(`/api/special_events/${eventId}/screen`).send({ scene: 'guess', competitionId: null, matchId: null, caption: '' }).expect(200)).body as {
      scene: string;
    };
    expect(screen.scene).toBe('guess');
  });

  it('gives the champion a badge in the phone book for a year', async () => {
    expect((await w1.agent.get('/api/event_badges').expect(200)).body).toEqual({});
    const final = (await matches(organizer.agent)).find((m) => m.round === 2)!;
    await jurors[0].agent.post(`/api/event_matches/${final.id}/result`).send({ scoreA: 1, scoreB: 0 }).expect(200);
    const done = await view(w1.agent);
    const champion = done.competitions[0].entries.find((e) => e.id === done.competitions[0].champion)!;
    // w1 picked the final's first side: two right of two.
    expect(done.predictions.leaders[0]).toMatchObject({ employeeId: w1.id, correct: 2, total: 2, rank: 1 });

    const badges = (await w2.agent.get('/api/event_badges').expect(200)).body as Record<string, { icon: string; label: string }[]>;
    expect(badges[champion.members[0]]).toEqual([{ icon: '🏆', label: 'قهرمان فیفا · یلدا' }]);
    expect(Object.keys(badges)).toHaveLength(1);
    // Guests get nothing unless the phone book is open to them.
    const guest = await request(app).get('/api/event_badges');
    expect([200, 401]).toContain(guest.status);
    if (guest.status === 200) expect(guest.body).toEqual({});
  });
});
