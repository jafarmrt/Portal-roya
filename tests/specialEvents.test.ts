import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { eventMatches, notifications } from '../server/db/schema';
import { processSpecialEvents } from '../server/routes/specialEvents';
import { jalaliToDate, toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

const eventNotes = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'event'))).orderBy(asc(notifications.id));

interface View {
  event: { id: string; status: string; phase: string } | null;
  me: { isOrganizer: boolean; isJuror: boolean; decides: boolean };
  competitions: {
    id: string;
    title: string;
    entries: { id: string; name: string; status: string; members: string[]; captainId: string; waitlistPosition: number | null }[];
    matches: { id: string; round: number; entryA: string | null; entryB: string | null; winnerId: string | null; bye: boolean; time: string; place: string; onStage: boolean }[];
    bracketVisible: boolean;
    champion: string | null;
    drawnAt: string | null;
    publishedAt: string | null;
  }[];
  objections: { id: string; status: string; byId: string }[];
  warnings: string[];
  screen?: { scene: string };
}

const current = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;

describe('«رویداد ویژه»: the Yalda night page', () => {
  let admin: Agent;
  let organizer: Person;
  let juror1: Person;
  let juror2: Person;
  let juror3: Person;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let mina: Person;
  let nima: Person;
  let eventId: string;
  let fifaId: string;
  let pantoId: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'ev.organizer' });
    juror1 = await createEmployee(admin, { username: 'ev.juror1' });
    juror2 = await createEmployee(admin, { username: 'ev.juror2' });
    juror3 = await createEmployee(admin, { username: 'ev.juror3' });
    ali = await createEmployee(admin, { username: 'ev.ali' });
    sara = await createEmployee(admin, { username: 'ev.sara' });
    reza = await createEmployee(admin, { username: 'ev.reza' });
    mina = await createEmployee(admin, { username: 'ev.mina' });
    nima = await createEmployee(admin, { username: 'ev.nima' });
  });
  afterAll(() => pool.end());

  it('is created by those who manage events and stays hidden while it is a draft', async () => {
    await ali.agent
      .post('/api/special_events')
      .send({ title: 'یلدا در رویا', programDate: day(10) })
      .expect(403);
    const created = (
      await admin
        .post('/api/special_events')
        .send({ title: 'یلدا در رویا ۱۴۰۵', programDate: day(10), programTime: '15:00', signupEnd: day(5), programPlace: 'سالن اجتماعات' })
        .expect(201)
    ).body as View;
    eventId = created.event!.id;
    expect(created.event).toMatchObject({ status: 'draft', phase: 'signup' });
    // The suggested last day stays two days after the program.
    expect((created.event as unknown as { showUntil: string }).showUntil).toBe(day(12));

    expect((await current(ali.agent)).event).toBeNull();
    await admin.patch(`/api/special_events/${eventId}`).send({ organizerIds: [organizer.id] }).expect(200);
    const seen = await current(organizer.agent);
    expect(seen.event?.id).toBe(eventId);
    expect(seen.me.isOrganizer).toBe(true);
    // Guests see nothing while the phone book is closed to them.
    expect((await request(app).get('/api/special_events/current').expect(200)).body).toMatchObject({ event: null, loginRequired: true });
  });

  it('takes a jury of three or five with a head, and keeps jurors out of every competition', async () => {
    const even = await admin.patch(`/api/special_events/${eventId}`).send({ juryIds: [juror1.id, juror2.id], juryHeadId: juror1.id }).expect(400);
    expect(even.body.error).toContain('۳ یا ۵');
    await admin
      .patch(`/api/special_events/${eventId}`)
      .send({ juryIds: [juror1.id, juror2.id, juror3.id], juryHeadId: juror2.id })
      .expect(200);
    expect((await current(juror1.agent)).me).toMatchObject({ isJuror: true, decides: true });

    const fifa = (
      await organizer.agent
        .post(`/api/special_events/${eventId}/competitions`)
        .send({ title: 'فیفا', kind: 'individual', capacity: 4, scoring: 'goals', tieRule: 'penalties', stagePolicy: 'final', dayPlace: 'اتاق VIP', dayStart: '10:00', slotMinutes: 20 })
        .expect(201)
    ).body as View;
    fifaId = fifa.competitions[0].id;
    const panto = (
      await organizer.agent
        .post(`/api/special_events/${eventId}/competitions`)
        .send({ title: 'پانتومیم', kind: 'team', teamMin: 3, teamMax: 4, capacity: 4, scoring: 'points', tieRule: 'organizer', stagePolicy: 'all' })
        .expect(201)
    ).body as View;
    pantoId = panto.competitions[1].id;
    await ali.agent.post(`/api/special_events/${eventId}/competitions`).send({ title: 'x', kind: 'individual', capacity: 4, scoring: 'goals', tieRule: 'penalties', stagePolicy: 'final' }).expect(403);
  });

  it('opens to everyone when switched on, warning first if signup has too few working days', async () => {
    await admin.patch(`/api/special_events/${eventId}`).send({ signupEnd: day(1) }).expect(200);
    const warned = await admin.post(`/api/special_events/${eventId}/activate`).send({}).expect(409);
    expect(warned.body.code).toBe('FEW_WORKDAYS');
    await admin.patch(`/api/special_events/${eventId}`).send({ signupEnd: day(5) }).expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({}).expect(200);
    expect((await current(ali.agent)).event?.status).toBe('active');
    const notes = await eventNotes(ali.id);
    expect(notes.at(-1)?.title).toContain('ثبت‌نام مسابقات شروع شد');
  });

  it('signs people up alone, with a waiting list past capacity that moves up when someone withdraws', async () => {
    // A juror cannot sign up.
    const refused = await juror1.agent.post(`/api/event_competitions/${fifaId}/entries`).send({}).expect(400);
    expect(refused.body.error).toContain('داور');
    for (const p of [ali, sara, reza, mina]) await p.agent.post(`/api/event_competitions/${fifaId}/entries`).send({}).expect(201);
    const late = (await nima.agent.post(`/api/event_competitions/${fifaId}/entries`).send({}).expect(201)).body;
    expect(late.status).toBe('waitlist');
    // Nobody signs up twice, or signs up someone else.
    await ali.agent.post(`/api/event_competitions/${fifaId}/entries`).send({}).expect(400);
    await ali.agent.post(`/api/event_competitions/${fifaId}/entries`).send({ memberIds: [organizer.id] }).expect(403);

    const view = await current(mina.agent);
    const minaEntry = view.competitions[0].entries.find((e) => e.members.includes(mina.id))!;
    await mina.agent.delete(`/api/event_entries/${minaEntry.id}`).expect(200);
    const after = await current(nima.agent);
    expect(after.competitions[0].entries.find((e) => e.members.includes(nima.id))?.status).toBe('in');
    expect((await eventNotes(nima.id)).at(-1)?.title).toContain('جا باز شد');
  });

  it('builds teams with a captain; teammates hear about it and may leave', async () => {
    const created = await ali.agent
      .post(`/api/event_competitions/${pantoId}/entries`)
      .send({ name: 'هندوانه‌ها', image: 'emoji:🍉', memberIds: [sara.id, reza.id] })
      .expect(201);
    expect(created.body.status).toBe('in');
    expect((await eventNotes(sara.id)).at(-1)?.title).toContain('هندوانه‌ها');
    // Someone already in a team cannot be put in another one; a juror cannot be in a team.
    await mina.agent.post(`/api/event_competitions/${pantoId}/entries`).send({ name: 'انارها', memberIds: [sara.id] }).expect(400);
    await mina.agent.post(`/api/event_competitions/${pantoId}/entries`).send({ name: 'انارها', memberIds: [juror3.id] }).expect(400);
    // Same name is refused too.
    await mina.agent.post(`/api/event_competitions/${pantoId}/entries`).send({ name: 'هندوانه‌ها' }).expect(400);

    const team = (await current(reza.agent)).competitions[1].entries[0];
    expect(team.members).toEqual([ali.id, sara.id, reza.id]);
    await reza.agent.post(`/api/event_entries/${team.id}/leave`).expect(200);
    // The captain leaves: the next member leads.
    await ali.agent.post(`/api/event_entries/${team.id}/leave`).expect(200);
    const left = (await current(sara.agent)).competitions[1].entries[0];
    expect(left).toMatchObject({ captainId: sara.id, members: [sara.id] });
    // The organizer sees the team is short.
    expect((await current(organizer.agent)).warnings.some((w) => w.includes('هندوانه‌ها') && w.includes('کم دارد'))).toBe(true);
    await sara.agent.patch(`/api/event_entries/${team.id}`).send({ memberIds: [ali.id, reza.id] }).expect(200);
  });

  it('draws the bracket for organizers only, and shows it to everyone once published', async () => {
    await ali.agent.post(`/api/event_competitions/${fifaId}/draw`).expect(403);
    const drawn = (await organizer.agent.post(`/api/event_competitions/${fifaId}/draw`).expect(200)).body as View;
    const fifa = drawn.competitions[0];
    expect(fifa.matches.filter((m) => m.round === 1)).toHaveLength(2);
    expect(fifa.matches.find((m) => m.round === 2)?.onStage).toBe(true);
    // Daytime matches get suggested times and the place, 20 minutes apart.
    const daytime = fifa.matches.filter((m) => !m.onStage).map((m) => m.time).sort();
    expect(daytime).toEqual(['10:00', '10:20']);
    expect(fifa.matches.find((m) => !m.onStage)?.place).toBe('اتاق VIP');
    // Signup is closed once drawn.
    await nima.agent.post(`/api/event_competitions/${fifaId}/entries`).send({}).expect(400);

    const before = await current(ali.agent);
    expect(before.competitions[0]).toMatchObject({ bracketVisible: false, matches: [] });
    await organizer.agent.post(`/api/event_competitions/${fifaId}/publish`).expect(200);
    const after = await current(ali.agent);
    expect(after.competitions[0].matches).toHaveLength(3);
    expect((await eventNotes(ali.id)).at(-1)?.title).toContain('حریف شما');
  });

  it('records results from organizers and jurors, moves winners on, and needs a reason to correct', async () => {
    const view = await current(organizer.agent);
    const [m1, m2] = view.competitions[0].matches.filter((m) => m.round === 1);
    await ali.agent.post(`/api/event_matches/${m1.id}/result`).send({ scoreA: 2, scoreB: 1 }).expect(403);
    // A draw needs penalties in FIFA.
    const tie = await organizer.agent.post(`/api/event_matches/${m1.id}/result`).send({ scoreA: 1, scoreB: 1 }).expect(400);
    expect(tie.body.error).toContain('پنالتی');
    await organizer.agent.post(`/api/event_matches/${m1.id}/result`).send({ scoreA: 1, scoreB: 1, tieA: 4, tieB: 3 }).expect(200);
    await juror1.agent.post(`/api/event_matches/${m2.id}/result`).send({ scoreA: 0, scoreB: 3 }).expect(200);

    const final = (await current(ali.agent)).competitions[0].matches.find((m) => m.round === 2)!;
    expect(final.entryA).toBe(m1.entryA);
    expect(final.entryB).toBe(m2.entryB);

    // Correcting without a reason is refused; with one, the final's pairing follows.
    await juror2.agent.post(`/api/event_matches/${m1.id}/result`).send({ scoreA: 1, scoreB: 2 }).expect(400);
    const corrected = await juror2.agent
      .post(`/api/event_matches/${m1.id}/result`)
      .send({ scoreA: 1, scoreB: 2, reason: 'گل دوم آفساید نبود' })
      .expect(200);
    const fixedFinal = (corrected.body.view as View).competitions[0].matches.find((m) => m.round === 2)!;
    expect(fixedFinal.entryA).toBe(m1.entryB);
  });

  it('lets a player object to their own result and the jury decide it', async () => {
    const view = await current(ali.agent);
    const played = view.competitions[0].matches.filter((m) => m.round === 1);
    const entries = view.competitions[0].entries;
    const aliEntry = entries.find((e) => e.members.includes(ali.id))!.id;
    const mine = played.find((m) => m.entryA === aliEntry || m.entryB === aliEntry)!;
    const other = played.find((m) => m !== mine)!;
    await ali.agent.post(`/api/event_matches/${other.id}/objections`).send({ text: 'داور ندید' }).expect(403);
    await ali.agent.post(`/api/event_matches/${mine.id}/objections`).send({ text: 'نتیجه اشتباه ثبت شده' }).expect(201);
    await ali.agent.post(`/api/event_matches/${mine.id}/objections`).send({ text: 'دوباره' }).expect(400);
    expect((await eventNotes(juror1.id)).at(-1)?.title).toContain('اعتراض');

    const jury = await current(juror3.agent);
    const objection = jury.objections.find((o) => o.byId === ali.id)!;
    expect(objection.status).toBe('open');
    // Others do not see someone else's objection; organizers and the jury do.
    expect((await current(sara.agent)).objections).toEqual([]);
    await organizer.agent.post(`/api/event_objections/${objection.id}/decide`).send({ status: 'rejected', decision: 'نه' }).expect(403);
    await juror3.agent.post(`/api/event_objections/${objection.id}/decide`).send({ status: 'rejected', decision: 'فیلم بازی دیده شد؛ نتیجه درست است.' }).expect(200);
    await juror1.agent.post(`/api/event_objections/${objection.id}/decide`).send({ status: 'accepted', decision: 'دیر' }).expect(400);
    expect((await eventNotes(ali.id)).at(-1)?.title).toBe('اعتراض شما رد شد');
  });

  it('announces the champion to everyone when the final is decided, and a result can be taken back at once', async () => {
    const final = (await current(organizer.agent)).competitions[0].matches.find((m) => m.round === 2)!;
    await organizer.agent.post(`/api/event_matches/${final.id}/live`).send({ scoreA: 1, scoreB: 0 }).expect(200);
    await organizer.agent.post(`/api/event_matches/${final.id}/result`).send({ scoreA: 3, scoreB: 2 }).expect(200);
    const after = await current(nima.agent);
    expect(after.competitions[0].champion).toBe(final.entryA);
    expect((await eventNotes(nima.id)).at(-1)?.title).toContain('قهرمان فیفا');
    // Someone else cannot undo it; the one who entered it can, for a few seconds.
    await juror1.agent.post(`/api/event_matches/${final.id}/undo`).expect(400);
    await organizer.agent.post(`/api/event_matches/${final.id}/undo`).expect(200);
    expect((await current(nima.agent)).competitions[0].champion).toBeNull();
    await organizer.agent.post(`/api/event_matches/${final.id}/result`).send({ scoreA: 3, scoreB: 2 }).expect(200);
    // The champion is announced once.
    expect((await eventNotes(nima.id)).filter((n) => n.title.includes('قهرمان فیفا'))).toHaveLength(1);
  });

  it('pairs a big screen with a 4-digit code; the screen only reads', async () => {
    const screen = request.agent(app);
    const hello = (await screen.post('/api/event_screen/hello').expect(200)).body;
    expect(hello.code).toMatch(/^\d{4}$/);
    expect((await screen.get('/api/event_screen/state').expect(200)).body).toMatchObject({ paired: false, code: hello.code });
    await request(app).get('/api/event_screen/state').expect(401);
    await screen.get('/api/event_screen/file/x.png').expect(401);

    await ali.agent.post(`/api/special_events/${eventId}/screens/pair`).send({ code: hello.code }).expect(403);
    await organizer.agent.post(`/api/special_events/${eventId}/screens/pair`).send({ code: '0000' === hello.code ? '1111' : '0000' }).expect(400);
    await organizer.agent.post(`/api/special_events/${eventId}/screens/pair`).send({ code: hello.code }).expect(200);
    // The same code does not pair a second time.
    await organizer.agent.post(`/api/special_events/${eventId}/screens/pair`).send({ code: hello.code }).expect(400);

    await organizer.agent.put(`/api/special_events/${eventId}/screen`).send({ scene: 'bracket', competitionId: fifaId }).expect(200);
    await organizer.agent.post(`/api/special_events/${eventId}/screen/timer`).send({ action: 'start', durationSec: 90 }).expect(200);
    const state = (await screen.get('/api/event_screen/state').expect(200)).body;
    expect(state).toMatchObject({ paired: true, screen: { scene: 'bracket', competitionId: fifaId } });
    expect(state.screen.timer.endsAt).toBeTruthy();
    expect(state.competitions[0].matches).toHaveLength(3);
    // Nothing private reaches the hall.
    expect(state.objections).toEqual([]);
    expect(state.log).toEqual([]);
    // A screen cannot change anything.
    await screen.put(`/api/special_events/${eventId}/screen`).send({ scene: 'welcome' }).expect(401);
  });

  it('draws, publishes and reminds on its own once signup has closed', async () => {
    // A second event whose signup closes today, with a competition nobody drew.
    const created = (
      await admin
        .post('/api/special_events')
        .send({ title: 'رویداد آزمایشی', programDate: day(1), programTime: '15:00', signupEnd: day(0) })
        .expect(201)
    ).body as View;
    const id = created.event!.id;
    await admin.patch(`/api/special_events/${id}`).send({ organizerIds: [organizer.id], signupEnd: day(0) }).expect(200);
    const comp = (
      await organizer.agent
        .post(`/api/special_events/${id}/competitions`)
        .send({ title: 'منچ', kind: 'individual', capacity: 4, scoring: 'winner', tieRule: 'organizer', stagePolicy: 'none', dayPlace: 'لابی', dayStart: '09:00' })
        .expect(201)
    ).body as View;
    const compId = comp.competitions.find((c) => c.title === 'منچ')!.id;
    await admin.post(`/api/special_events/${id}/activate`).send({ force: true }).expect(200);
    for (const p of [mina, nima]) await p.agent.post(`/api/event_competitions/${compId}/entries`).send({}).expect(201);

    // Tomorrow is the program day itself: the draw happens and is published at once, and players are told.
    const tomorrow = jalaliToDate(day(1), '08:30')!;
    await processSpecialEvents(tomorrow);
    const [match] = await db.select().from(eventMatches).where(eq(eventMatches.competitionId, compId));
    expect(match.entryA && match.entryB).toBeTruthy();
    expect(match.time).toBe('09:00');
    expect((await eventNotes(mina.id)).some((n) => n.title.includes('حریف شما'))).toBe(true);
    // Half an hour before the match, both players are reminded once.
    await processSpecialEvents(jalaliToDate(day(1), '08:40')!);
    await processSpecialEvents(jalaliToDate(day(1), '08:45')!);
    expect((await eventNotes(nima.id)).filter((n) => n.title.includes('ساعت ۰۹:۰۰'))).toHaveLength(1);
    // A result 10 minutes past its slot reaches the organizers.
    await processSpecialEvents(jalaliToDate(day(1), '09:31')!);
    expect((await eventNotes(organizer.id)).some((n) => n.title.includes('ثبت نشده'))).toBe(true);
  });
});
