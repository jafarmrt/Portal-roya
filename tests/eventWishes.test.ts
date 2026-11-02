import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { specialEvents } from '../server/db/schema';
import { WHEEL_SPIN_MS, wheelPosition } from '../shared/specialEvents';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface Wishes {
  wall: { id: string; text: string; byId: string | null }[];
  mine: { id: string; status: string }[];
  waiting: { id: string; byId: string; status: string }[];
  canWrite: boolean;
}
interface Wheel {
  spins: { id: string; winnerId: string; prize: string; absent: boolean; reel: string[] }[];
  left: number;
  inIt: boolean;
  organizer: boolean;
  live: boolean;
}
interface View {
  wishes: Wishes;
  wheel: Wheel;
  event: { screen: { scene: string } | null };
}

describe('the reel of «گردونهٔ شانس»', () => {
  it('starts at the first name and stops on the last one, slowing down', () => {
    expect(wheelPosition(0, 36)).toBe(0);
    expect(wheelPosition(WHEEL_SPIN_MS, 36)).toBe(35);
    expect(wheelPosition(WHEEL_SPIN_MS * 2, 36)).toBe(35);
    expect(wheelPosition(WHEEL_SPIN_MS / 2, 36)).toBeGreaterThan(18);
    expect(wheelPosition(WHEEL_SPIN_MS - 100, 36)).toBe(34);
    expect(wheelPosition(500, 1)).toBe(0);
  });
});

describe('«رویداد ویژه»: Yalda wishes and the wheel', () => {
  let admin: Agent;
  let organizer: Person;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let eventId: string;

  const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'wh.organizer' });
    ali = await createEmployee(admin, { username: 'wh.ali' });
    sara = await createEmployee(admin, { username: 'wh.sara' });
    reza = await createEmployee(admin, { username: 'wh.reza' });
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin.patch(`/api/special_events/${eventId}`).send({ organizerIds: [organizer.id] }).expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
  });
  afterAll(() => pool.end());

  it('puts a wish on the wall only once an organizer approves it; anonymous stays anonymous', async () => {
    await ali.agent.post(`/api/special_events/${eventId}/wishes`).send({ text: '' }).expect(400);
    const written = ((await ali.agent.post(`/api/special_events/${eventId}/wishes`).send({ text: 'سالی پر از سلامتی برای همه' }).expect(201)).body as View).wishes;
    expect(written.mine).toMatchObject([{ status: 'pending' }]);
    expect(written.wall).toEqual([]);
    expect(written.waiting).toEqual([]);
    await sara.agent.post(`/api/special_events/${eventId}/wishes`).send({ text: 'پروژهٔ بزرگ امسال به سرانجام برسد', anonymous: true }).expect(201);

    // Colleagues do not read the waiting ones, nor approve them.
    expect((await view(reza.agent)).wishes).toMatchObject({ wall: [], waiting: [], canWrite: true });
    const forOrganizer = (await view(organizer.agent)).wishes;
    expect(forOrganizer.waiting.map((w) => w.byId)).toEqual([ali.id, sara.id]);
    const [aliWish, saraWish] = forOrganizer.waiting;
    await ali.agent.patch(`/api/event_wishes/${aliWish.id}`).send({ status: 'approved' }).expect(403);
    await organizer.agent.patch(`/api/event_wishes/${aliWish.id}`).send({ status: 'approved' }).expect(200);
    await organizer.agent.patch(`/api/event_wishes/${saraWish.id}`).send({ status: 'approved' }).expect(200);
    const wall = (await view(reza.agent)).wishes.wall;
    expect(wall.map((w) => w.byId)).toEqual([ali.id, null]);

    // Kept off the wall, then taken back by its writer; others cannot remove it.
    await organizer.agent.patch(`/api/event_wishes/${aliWish.id}`).send({ status: 'hidden' }).expect(200);
    expect((await view(reza.agent)).wishes.wall.map((w) => w.byId)).toEqual([null]);
    await reza.agent.delete(`/api/event_wishes/${aliWish.id}`).expect(403);
    await ali.agent.delete(`/api/event_wishes/${aliWish.id}`).expect(200);
    expect((await view(ali.agent)).wishes.mine).toEqual([]);

    // A few each.
    for (const text of ['یک', 'دو', 'سه']) await reza.agent.post(`/api/special_events/${eventId}/wishes`).send({ text: `آرزوی ${text}` }).expect(201);
    await reza.agent.post(`/api/special_events/${eventId}/wishes`).send({ text: 'آرزوی چهار' }).expect(400);
    // An organizer's own goes up at once.
    const own = ((await organizer.agent.post(`/api/special_events/${eventId}/wishes`).send({ text: 'شبی خوش برای همه' }).expect(201)).body as View).wishes;
    expect(own.mine).toMatchObject([{ status: 'approved' }]);
  });

  it('turns the wheel on the night among those who took part, never the organizers, each name once', async () => {
    // Ali took back his wish: nothing else on the page, so he is not in.
    expect((await view(ali.agent)).wheel).toMatchObject({ inIt: false, left: 2 });
    expect((await view(sara.agent)).wheel).toMatchObject({ inIt: true, live: false });
    expect((await view(organizer.agent)).wheel).toMatchObject({ inIt: false, organizer: true });
    await organizer.agent.post(`/api/special_events/${eventId}/wheel/spin`).send({}).expect(400);

    await db.update(specialEvents).set({ programDate: today, programTime: '00:00', signupEnd: day(-3), showUntil: day(2) }).where(eq(specialEvents.id, eventId));
    // A fal puts Ali in.
    await ali.agent.post(`/api/special_events/${eventId}/fal`).expect(200);
    expect((await view(ali.agent)).wheel).toMatchObject({ inIt: true, left: 3, live: true });

    await ali.agent.post(`/api/special_events/${eventId}/wheel/spin`).send({}).expect(403);
    const first = (await organizer.agent.post(`/api/special_events/${eventId}/wheel/spin`).send({ prize: 'یک جعبه گز' }).expect(200)).body as View;
    expect(first.event.screen!.scene).toBe('wheel');
    const spin = first.wheel.spins[0];
    expect(spin.prize).toBe('یک جعبه گز');
    expect([ali.id, sara.id, reza.id]).toContain(spin.winnerId);
    expect(spin.reel.at(-1)).toBe(spin.winnerId);
    expect(spin.reel.slice(0, -1)).not.toContain(spin.winnerId);
    expect(spin.reel).not.toContain(organizer.id);
    expect(first.wheel.left).toBe(2);

    // Not in the hall: marked, and still out of the next turns.
    await organizer.agent.patch(`/api/event_wheel/${spin.id}`).send({ absent: true }).expect(200);
    await organizer.agent.post(`/api/special_events/${eventId}/wheel/spin`).send({}).expect(200);
    const third = (await organizer.agent.post(`/api/special_events/${eventId}/wheel/spin`).send({}).expect(200)).body as View;
    const winners = third.wheel.spins.map((s) => s.winnerId);
    expect(new Set(winners).size).toBe(3);
    expect(third.wheel.spins[0].absent).toBe(true);
    await organizer.agent.post(`/api/special_events/${eventId}/wheel/spin`).send({}).expect(400);

    // After the rehearsal everyone is back in.
    await ali.agent.post(`/api/special_events/${eventId}/wheel/reset`).expect(403);
    const fresh = ((await organizer.agent.post(`/api/special_events/${eventId}/wheel/reset`).expect(200)).body as View).wheel;
    expect(fresh).toMatchObject({ spins: [], left: 3 });
  });
});
