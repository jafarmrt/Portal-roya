import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications } from '../server/db/schema';
import { processSpecialEvents } from '../server/routes/specialEvents';
import { jalaliToDate, toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);
const at = (offset: number, time: string) => jalaliToDate(day(offset), time)!;

const eventNotes = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'event'))).orderBy(asc(notifications.id));

interface Award {
  id: string;
  title: string;
  stage: string;
  myNomination: { nomineeId: string; reason: string } | null;
  nominees: { id: string; source?: string; withdrawn?: boolean; removed?: boolean; reasons: { id: string; text: string; hidden: boolean }[] }[];
  myVote: string | null;
  votedCount: number | null;
  tie: string[];
  decided: boolean;
  winnerId: string | null;
}
interface View {
  awards: Award[];
  awardsInfo: { optedOut: boolean; canStepDown: boolean; votes: boolean; publishedAt: string | null };
}

const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;
const award = async (agent: Agent | Person['agent'], title: string) => (await view(agent)).awards.find((a) => a.title === title)!;

describe('«انتخاب‌های یلدا»: nominations and the jury’s secret choice', () => {
  let admin: Agent;
  let organizer: Person;
  let j1: Person;
  let j2: Person;
  let j3: Person;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let mina: Person;
  let nima: Person;
  let omid: Person;
  let eventId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'aw.organizer' });
    j1 = await createEmployee(admin, { username: 'aw.j1' });
    j2 = await createEmployee(admin, { username: 'aw.j2' });
    j3 = await createEmployee(admin, { username: 'aw.j3' });
    ali = await createEmployee(admin, { username: 'aw.ali' });
    sara = await createEmployee(admin, { username: 'aw.sara' });
    reza = await createEmployee(admin, { username: 'aw.reza' });
    mina = await createEmployee(admin, { username: 'aw.mina' });
    nima = await createEmployee(admin, { username: 'aw.nima' });
    omid = await createEmployee(admin, { username: 'aw.omid' });
    const created = await admin
      .post('/api/special_events')
      .send({ title: 'یلدا در رویا', programDate: day(10), programTime: '15:00', signupEnd: day(5) })
      .expect(201);
    eventId = created.body.event.id;
    await admin
      .patch(`/api/special_events/${eventId}`)
      .send({ organizerIds: [organizer.id], juryIds: [j1.id, j2.id, j3.id], juryHeadId: j1.id })
      .expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
  });
  afterAll(() => pool.end());

  it('lets organizers build the categories', async () => {
    await ali.agent.post(`/api/special_events/${eventId}/awards`).send({ title: 'خوش‌تیپ‌ترین' }).expect(403);
    for (const [title, icon] of [
      ['خوش‌تیپ‌ترین', '😎'],
      ['همیشه پایه', '🤝'],
      ['خوش‌خنده‌ترین', '😄'],
    ]) {
      await organizer.agent.post(`/api/special_events/${eventId}/awards`).send({ title, icon, description: 'یک جمله' }).expect(201);
    }
    const awards = (await view(ali.agent)).awards;
    expect(awards.map((a) => a.title)).toEqual(['خوش‌تیپ‌ترین', 'همیشه پایه', 'خوش‌خنده‌ترین']);
    for (const a of awards) ids[a.title] = a.id;
    expect(awards[0].stage).toBe('nominating');
  });

  it('takes one nomination per colleague and category, never oneself, a juror or someone who opted out', async () => {
    const nominate = (who: Person, title: string, nominee: Person, reason = '') =>
      who.agent.put(`/api/event_awards/${ids[title]}/nomination`).send({ nomineeId: nominee.id, reason });
    await nominate(ali, 'خوش‌تیپ‌ترین', ali).expect(400);
    await nominate(ali, 'خوش‌تیپ‌ترین', j2).expect(400);
    await nominate(j1, 'خوش‌تیپ‌ترین', sara).expect(403);

    await nima.agent.put(`/api/special_events/${eventId}/awards/opt_out`).send({ out: true }).expect(200);
    expect((await view(nima.agent)).awardsInfo.optedOut).toBe(true);
    await nominate(ali, 'همیشه پایه', nima).expect(400);

    await nominate(ali, 'خوش‌تیپ‌ترین', reza, 'اول').expect(200);
    // Changing one's mind replaces the nomination.
    await nominate(ali, 'خوش‌تیپ‌ترین', sara, 'همیشه اتوکرده است').expect(200);
    await nominate(reza, 'خوش‌تیپ‌ترین', sara, 'کراوات!').expect(200);
    await nominate(mina, 'خوش‌تیپ‌ترین', reza).expect(200);
    await nominate(nima, 'خوش‌تیپ‌ترین', ali).expect(200);
    await nominate(omid, 'خوش‌تیپ‌ترین', mina).expect(200);
    await nominate(ali, 'همیشه پایه', sara).expect(200);
    await nominate(reza, 'همیشه پایه', sara).expect(200);
    await nominate(ali, 'خوش‌خنده‌ترین', reza).expect(200);
    await nominate(sara, 'خوش‌خنده‌ترین', omid).expect(200);

    const mine = await award(ali.agent, 'خوش‌تیپ‌ترین');
    expect(mine.myNomination).toEqual({ nomineeId: sara.id, reason: 'همیشه اتوکرده است' });
    // Nobody sees anyone else's nominations or a shortlist yet, not even the jury.
    expect(mine.nominees).toEqual([]);
    expect((await award(j1.agent, 'خوش‌تیپ‌ترین')).nominees).toEqual([]);
  });

  it('makes the shortlists the morning after signup closes and tells those on them', async () => {
    await processSpecialEvents(at(6, '07:59'));
    expect((await award(j1.agent, 'خوش‌تیپ‌ترین')).nominees).toEqual([]);
    await processSpecialEvents(at(6, '08:01'));

    const forJury = await award(j1.agent, 'خوش‌تیپ‌ترین');
    // The most nominated first; between equals the one nominated first.
    expect(forJury.nominees.map((n) => n.id)).toEqual([sara.id, reza.id, ali.id]);
    // The jury reads the lines, never who wrote them.
    expect(forJury.nominees[0].reasons.map((r) => r.text).sort()).toEqual(['همیشه اتوکرده است', 'کراوات!'].sort());
    expect(JSON.stringify(forJury)).not.toContain('nominator');
    expect(forJury.stage).toBe('shortlisting');
    // Colleagues see nothing until it is public; organizers already do, without the lines.
    expect((await award(mina.agent, 'خوش‌تیپ‌ترین')).nominees).toEqual([]);
    const forOrganizer = await award(organizer.agent, 'خوش‌تیپ‌ترین');
    expect(forOrganizer.nominees).toHaveLength(3);
    expect(forOrganizer.nominees.every((n) => n.reasons.length === 0)).toBe(true);

    expect((await eventNotes(sara.id)).some((n) => n.title.includes('«خوش‌تیپ‌ترین»'))).toBe(true);
    // Opted-out nima had a nomination but is on no list.
    expect((await award(j1.agent, 'همیشه پایه')).nominees.map((n) => n.id)).toEqual([sara.id]);
  });

  it('lets a shortlisted colleague step down that day; the next most nominated comes in', async () => {
    expect((await view(ali.agent)).awardsInfo.canStepDown).toBe(true);
    await ali.agent.post(`/api/special_events/${eventId}/awards/step_down`).send({}).expect(200);
    const list = (await award(j1.agent, 'خوش‌تیپ‌ترین')).nominees;
    expect(list.find((n) => n.id === ali.id)?.withdrawn).toBe(true);
    expect(list.filter((n) => !n.withdrawn).map((n) => n.id)).toEqual([sara.id, reza.id, mina.id]);
    expect((await eventNotes(mina.id)).some((n) => n.title.includes('«خوش‌تیپ‌ترین»'))).toBe(true);
  });

  it('lets the jury add or take off a nominee with a reason, and hide an unkind line', async () => {
    await j2.agent.post(`/api/event_awards/${ids['همیشه پایه']}/nominees`).send({ employeeId: mina.id, note: 'همیشه برای کمک می‌ماند' }).expect(200);
    await j2.agent.post(`/api/event_awards/${ids['همیشه پایه']}/nominees`).send({ employeeId: nima.id, note: 'همیشه برای کمک' }).expect(400);
    await ali.agent.post(`/api/event_awards/${ids['همیشه پایه']}/nominees`).send({ employeeId: omid.id, note: 'دلیل خوب' }).expect(403);
    expect((await award(j1.agent, 'همیشه پایه')).nominees.map((n) => n.id)).toEqual([sara.id, mina.id]);

    const line = (await award(j1.agent, 'خوش‌تیپ‌ترین')).nominees[0].reasons.find((r) => r.text === 'کراوات!')!;
    await j3.agent.post(`/api/event_nominations/${line.id}/hide`).send({ hidden: true }).expect(200);
    const hidden = (await award(j2.agent, 'خوش‌تیپ‌ترین')).nominees[0].reasons.find((r) => r.id === line.id)!;
    expect(hidden).toMatchObject({ text: '', hidden: true });
  });

  it('shows the lists to everyone the next day and opens the secret vote', async () => {
    await j1.agent.put(`/api/event_awards/${ids['خوش‌تیپ‌ترین']}/vote`).send({ nomineeId: sara.id }).expect(400);
    await processSpecialEvents(at(7, '00:01'));
    const forAll = await award(omid.agent, 'خوش‌تیپ‌ترین');
    expect(forAll.stage).toBe('voting');
    expect(forAll.nominees.map((n) => n.id)).toEqual([sara.id, reza.id, mina.id]);
    // Withdrawals and the jury's notes are not for everyone.
    expect(forAll.nominees[0]).toEqual({ id: sara.id, reasons: [] });
    await ali.agent.post(`/api/special_events/${eventId}/awards/step_down`).send({}).expect(400);
    expect((await eventNotes(j1.id)).at(-1)?.title).toContain('رأی‌گیری');

    const vote = (who: Person, title: string, nominee: Person) => who.agent.put(`/api/event_awards/${ids[title]}/vote`).send({ nomineeId: nominee.id });
    await vote(ali, 'خوش‌تیپ‌ترین', sara).expect(403);
    await vote(j1, 'خوش‌تیپ‌ترین', ali).expect(400);
    await vote(j1, 'خوش‌تیپ‌ترین', reza).expect(200);
    await vote(j1, 'خوش‌تیپ‌ترین', sara).expect(200);
    await vote(j2, 'خوش‌تیپ‌ترین', reza).expect(200);
    await vote(j3, 'خوش‌تیپ‌ترین', sara).expect(200);
    await vote(j1, 'همیشه پایه', sara).expect(200);
    await vote(j2, 'همیشه پایه', mina).expect(200);
    await vote(j3, 'همیشه پایه', sara).expect(200);
    await vote(j2, 'خوش‌خنده‌ترین', reza).expect(200);
    await vote(j3, 'خوش‌خنده‌ترین', omid).expect(200);

    // Each juror sees their own vote only; organizers see how many voted, not for whom.
    expect((await award(j1.agent, 'خوش‌تیپ‌ترین')).myVote).toBe(sara.id);
    expect((await award(j2.agent, 'خوش‌تیپ‌ترین')).myVote).toBe(reza.id);
    const organizerView = await award(organizer.agent, 'خوش‌تیپ‌ترین');
    expect(organizerView.votedCount).toBe(3);
    expect(organizerView.myVote).toBeNull();
    expect((await award(ali.agent, 'خوش‌تیپ‌ترین')).votedCount).toBeNull();
  });

  it('closes at noon of the program day: one title each, and a tie goes to the head of the jury', async () => {
    await processSpecialEvents(at(10, '11:59'));
    expect((await award(organizer.agent, 'خوش‌تیپ‌ترین')).decided).toBe(false);
    await processSpecialEvents(at(10, '12:01'));

    const forOrganizer = (await view(organizer.agent)).awards;
    // Decided, but nobody sees a winner before it is opened, the administrator included.
    expect(forOrganizer.map((a) => a.decided)).toEqual([true, true, false]);
    expect(forOrganizer.every((a) => a.winnerId === null)).toBe(true);
    expect((await view(admin)).awards.every((a) => a.winnerId === null)).toBe(true);

    // «خوش‌خنده‌ترین» is a tie and the head did not vote in it: the head picks.
    const forHead = await award(j1.agent, 'خوش‌خنده‌ترین');
    expect(forHead.tie.sort()).toEqual([reza.id, omid.id].sort());
    expect((await award(j2.agent, 'خوش‌خنده‌ترین')).tie).toEqual([]);
    expect((await eventNotes(j1.id)).at(-1)?.title).toContain('تساوی');
    await organizer.agent.post(`/api/event_awards/${ids['خوش‌خنده‌ترین']}/reveal`).send({}).expect(400);
    await j2.agent.post(`/api/event_awards/${ids['خوش‌خنده‌ترین']}/settle`).send({ nomineeId: reza.id }).expect(403);
    await j1.agent.post(`/api/event_awards/${ids['خوش‌خنده‌ترین']}/settle`).send({ nomineeId: ali.id }).expect(400);
    await j1.agent.post(`/api/event_awards/${ids['خوش‌خنده‌ترین']}/settle`).send({ nomineeId: omid.id }).expect(200);
    expect((await award(organizer.agent, 'خوش‌خنده‌ترین')).decided).toBe(true);
  });

  it('shows each winner once it is opened on stage, and tells the winner', async () => {
    await ali.agent.post(`/api/event_awards/${ids['خوش‌تیپ‌ترین']}/reveal`).send({}).expect(403);
    await organizer.agent.post(`/api/event_awards/${ids['خوش‌تیپ‌ترین']}/reveal`).send({}).expect(200);
    await organizer.agent.post(`/api/event_awards/${ids['خوش‌تیپ‌ترین']}/reveal`).send({}).expect(400);
    await j3.agent.post(`/api/event_awards/${ids['همیشه پایه']}/reveal`).send({}).expect(200);
    const forAll = (await view(omid.agent)).awards;
    expect(forAll[0]).toMatchObject({ stage: 'revealed', winnerId: sara.id });
    // Sara won the first title, so the second went to the next on the jury's list.
    expect(forAll[1]).toMatchObject({ stage: 'revealed', winnerId: mina.id });
    expect(forAll[2].winnerId).toBeNull();
    expect((await eventNotes(sara.id)).at(-1)?.title).toContain('خوش‌تیپ‌ترین');
  });
});
