import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { HAFEZ_FAL, scheduleNow } from '../shared/specialEvents';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface View {
  event: { schedule: { id: string; time: string; title: string }[] };
  fal: { mine: number | null; count: number; open: boolean };
}

describe('«برنامهٔ امشب» in order, the item on now', () => {
  const items = [
    { id: 'c', time: '17:00', title: 'انتخاب‌ها' },
    { id: 'a', time: '15:00', title: 'خوش‌آمد' },
    { id: 'b', time: '15:30', title: 'فینال فیفا' },
  ];
  const at = (clock: string) => new Date(`2026-12-21T${clock}:00`);
  const fmt = { day: () => '1405/09/30', clock: (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };

  it('orders by time and lights the last that has started', () => {
    const before = scheduleNow(items, '1405/09/30', at('14:00'), fmt.day, fmt.clock);
    expect(before.ordered.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(before.current).toBeNull();
    expect(before.next?.id).toBe('a');
    const mid = scheduleNow(items, '1405/09/30', at('16:10'), fmt.day, fmt.clock);
    expect(mid.current?.id).toBe('b');
    expect(mid.next?.id).toBe('c');
    // Another day: nothing is on.
    expect(scheduleNow(items, '1405/09/29', at('16:10'), fmt.day, fmt.clock).current).toBeNull();
  });

  it('has a reading for every couplet', () => {
    expect(HAFEZ_FAL.length).toBeGreaterThanOrEqual(15);
    for (const f of HAFEZ_FAL) {
      expect(f.verse[0].length).toBeGreaterThan(10);
      expect(f.verse[1].length).toBeGreaterThan(10);
      expect(f.reading.length).toBeGreaterThan(20);
    }
  });
});

describe('«رویداد ویژه»: the night\'s schedule, the envelopes and «فال حافظ»', () => {
  let admin: Agent;
  let organizer: Person;
  let ali: Person;
  let eventId: string;

  const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'nt.organizer' });
    ali = await createEmployee(admin, { username: 'nt.ali' });
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin.patch(`/api/special_events/${eventId}`).send({ organizerIds: [organizer.id] }).expect(200);
  });
  afterAll(() => pool.end());

  it('lets the organizers write the schedule, kept in time order', async () => {
    await ali.agent.put(`/api/special_events/${eventId}/schedule`).send({ items: [] }).expect(403);
    await organizer.agent.put(`/api/special_events/${eventId}/schedule`).send({ items: [{ time: '25:00', title: 'شام' }] }).expect(400);
    await organizer.agent.put(`/api/special_events/${eventId}/schedule`).send({ items: [{ time: '18:00', title: '' }] }).expect(400);
    const saved = (
      await organizer.agent
        .put(`/api/special_events/${eventId}/schedule`)
        .send({ items: [{ time: '18:00', title: 'شام' }, { time: '15:00', title: 'خوش‌آمد' }] })
        .expect(200)
    ).body as View;
    expect(saved.event.schedule.map((i) => i.title)).toEqual(['خوش‌آمد', 'شام']);
    // Kept ids survive an edit.
    const [first] = saved.event.schedule;
    const edited = (
      await organizer.agent
        .put(`/api/special_events/${eventId}/schedule`)
        .send({ items: [{ ...first, title: 'خوش‌آمد و چای' }] })
        .expect(200)
    ).body as View;
    expect(edited.event.schedule).toEqual([{ id: first.id, time: '15:00', title: 'خوش‌آمد و چای' }]);
  });

  it('gives each colleague one fal, the same verse when asked again', async () => {
    await ali.agent.post(`/api/special_events/${eventId}/fal`).expect(400);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
    expect((await view(ali.agent)).fal).toMatchObject({ mine: null, count: 0, open: true });
    const first = ((await ali.agent.post(`/api/special_events/${eventId}/fal`).expect(200)).body as View).fal;
    expect(first.mine).toBeGreaterThanOrEqual(0);
    expect(first.mine).toBeLessThan(HAFEZ_FAL.length);
    const again = ((await ali.agent.post(`/api/special_events/${eventId}/fal`).expect(200)).body as View).fal;
    expect(again).toMatchObject({ mine: first.mine, count: 1 });
    expect((await view(organizer.agent)).fal).toMatchObject({ mine: null, count: 1 });
  });

  it('puts an envelope or a verse on the big screen', async () => {
    const envelope = (await organizer.agent.put(`/api/special_events/${eventId}/screen`).send({ scene: 'envelope', awardId: 'award_x' }).expect(200)).body as {
      scene: string;
      awardId: string;
    };
    expect(envelope).toMatchObject({ scene: 'envelope', awardId: 'award_x' });
    await organizer.agent.put(`/api/special_events/${eventId}/screen`).send({ scene: 'fal', falIndex: HAFEZ_FAL.length }).expect(400);
    const fal = (await organizer.agent.put(`/api/special_events/${eventId}/screen`).send({ scene: 'fal', falIndex: 2 }).expect(200)).body as { falIndex: number; awardId: null };
    expect(fal).toMatchObject({ falIndex: 2, awardId: null });
    await ali.agent.put(`/api/special_events/${eventId}/screen`).send({ scene: 'schedule' }).expect(403);
  });
});
