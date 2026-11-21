import moment from 'moment-jalaali';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cardsShownNow, daysSinceYearly, daysUntilYearly, yearsSince } from '../shared/celebrations';
import { pool } from '../server/db/index';
import { announceFoundingDay, announceWorkAnniversaries } from '../server/scheduler';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

interface Card {
  id: string;
  senderId: string;
  text: string;
  occasion: string;
  design: string;
  isPrivate: boolean;
  reaction: string;
}

async function notificationsOf(agent: Agent) {
  return (await agent.get('/api/notifications').expect(200)).body as { title: string; message: string }[];
}

async function cardsFor(agent: Agent, targetId: string) {
  return ((await agent.get('/api/birthday_wishes').expect(200)).body[targetId] ?? []) as Card[];
}

describe('greeting cards, work anniversaries and the founding day', () => {
  let admin: Agent;
  let sara: Person;
  let reza: Person;
  let nima: Person;
  const morning = moment().hour(9).minute(0).toDate();
  const todayKey = moment(morning).format('jMM/jDD');
  const thisYear = moment(morning).jYear();

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sara = await createEmployee(admin, { username: 'sara' });
    reza = await createEmployee(admin, { username: 'reza' });
    nima = await createEmployee(admin, { username: 'nima', department: 'طراحی' });
    await admin.patch(`/api/employees/${sara.id}`).send({ birthDate: `1370/${todayKey}` }).expect(200);
  });
  afterAll(() => pool.end());

  it('shows a private card only to its sender and the colleague it is for', async () => {
    await reza.agent
      .post(`/api/employees/${sara.id}/birthday_wishes`)
      .send({ message: 'تولدت مبارک سارا', design: 'balloons', isPrivate: true })
      .expect(201);
    await nima.agent.post(`/api/employees/${sara.id}/birthday_wishes`).send({ message: 'مبارک باشد' }).expect(201);

    const ownView = await cardsFor(sara.agent, sara.id);
    expect(ownView).toHaveLength(2);
    expect(ownView[0]).toMatchObject({ text: 'تولدت مبارک سارا', design: 'balloons', isPrivate: true, occasion: 'birthday', reaction: '' });
    expect(await cardsFor(reza.agent, sara.id)).toHaveLength(2);
    // Nima sees only his own public card; moderators do not see private cards either.
    expect((await cardsFor(nima.agent, sara.id)).map((c) => c.text)).toEqual(['مبارک باشد']);
    expect(await cardsFor(admin, sara.id)).toHaveLength(1);
    expect((await notificationsOf(sara.agent)).some((n) => n.title.includes('کارت تبریک'))).toBe(true);
  });

  it('rejects unknown designs', async () => {
    await reza.agent.post(`/api/employees/${sara.id}/birthday_wishes`).send({ message: 'x', design: 'neon' }).expect(400);
  });

  it('lets only the colleague react, and tells the sender once', async () => {
    const [card] = await cardsFor(sara.agent, sara.id);
    await reza.agent.put(`/api/birthday_wishes/${card.id}/reaction`).send({ reaction: '❤️' }).expect(403);
    await sara.agent.put(`/api/birthday_wishes/${card.id}/reaction`).send({ reaction: '🍕' }).expect(400);

    const before = (await notificationsOf(reza.agent)).length;
    await sara.agent.put(`/api/birthday_wishes/${card.id}/reaction`).send({ reaction: '❤️' }).expect(200);
    await sara.agent.put(`/api/birthday_wishes/${card.id}/reaction`).send({ reaction: '🙏' }).expect(200);
    const after = await notificationsOf(reza.agent);
    expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.title.includes('واکنش') && n.title.includes('❤️'))).toBe(true);
    expect((await cardsFor(reza.agent, sara.id))[0].reaction).toBe('🙏');
  });

  it('accepts anniversary cards only for colleagues with a past hire date who did not opt out', async () => {
    await admin.patch(`/api/employees/${reza.id}`).send({ hireDate: `${thisYear}/01/01` }).expect(200);
    await sara.agent.post(`/api/employees/${reza.id}/birthday_wishes`).send({ message: 'مبارک', occasion: 'anniversary' }).expect(403);
    await admin.patch(`/api/employees/${reza.id}`).send({ hireDate: `${thisYear - 3}/${todayKey}` }).expect(200);
    await sara.agent.post(`/api/employees/${reza.id}/birthday_wishes`).send({ message: 'سه سال مبارک', occasion: 'anniversary' }).expect(201);
    expect((await cardsFor(reza.agent, reza.id))[0].occasion).toBe('anniversary');

    await reza.agent.patch(`/api/employees/${reza.id}`).send({ hideAnniversary: true }).expect(200);
    await sara.agent.post(`/api/employees/${reza.id}/birthday_wishes`).send({ message: 'x', occasion: 'anniversary' }).expect(403);
    await reza.agent.patch(`/api/employees/${reza.id}`).send({ hideAnniversary: false }).expect(200);
  });

  it('announces a work anniversary once, to the colleague and their department', async () => {
    expect(await announceWorkAnniversaries(moment().hour(6).toDate())).toBe(0);
    expect(await announceWorkAnniversaries(morning)).toBe(1);
    expect(await announceWorkAnniversaries(morning)).toBe(0);

    expect((await notificationsOf(reza.agent)).some((n) => n.title.includes('سالگرد همکاری‌تان') && n.message.includes('۳ سال'))).toBe(true);
    // Sara works in the same department; Nima does not.
    expect((await notificationsOf(sara.agent)).some((n) => n.title.includes('سالگرد همکاری همکارمان'))).toBe(true);
    expect((await notificationsOf(nima.agent)).some((n) => n.title.includes('سالگرد همکاری همکارمان'))).toBe(false);
  });

  it('greets everyone on the founding day once a year', async () => {
    expect(await announceFoundingDay(morning)).toBe(false);
    await reza.agent.put('/api/settings').send({ foundingDate: '1385/01/01' }).expect(403);
    await admin.put('/api/settings').send({ foundingDate: 'abc' }).expect(400);
    await admin.put('/api/settings').send({ foundingDate: `${thisYear - 20}/${todayKey}`, foundingMessage: '' }).expect(200);
    expect((await admin.get('/api/settings').expect(200)).body.foundingDate).toBe(`${thisYear - 20}/${todayKey}`);

    expect(await announceFoundingDay(morning)).toBe(true);
    expect(await announceFoundingDay(morning)).toBe(false);
    for (const agent of [sara.agent, nima.agent, admin]) {
      expect((await notificationsOf(agent)).some((n) => n.title.includes('۲۰ سال') && n.message.includes('تأسیس'))).toBe(true);
    }
  });

  it('sends only the cards a dashboard can show now, so a year of cards does not travel with every change', async () => {
    const day = (offset: number) => moment(morning).add(offset, 'day').format('jYYYY/jMM/jDD');
    const soon = await createEmployee(admin, { username: 'soon' });
    const gone = await createEmployee(admin, { username: 'gone' });
    // In ten days (always shown, even across the new year) and two months ago (never shown).
    await admin.patch(`/api/employees/${soon.id}`).send({ birthDate: `1368/${day(10).slice(5)}` }).expect(200);
    await admin.patch(`/api/employees/${gone.id}`).send({ birthDate: `1368/${day(-60).slice(5)}`, hireDate: `${thisYear - 5}/${day(-60).slice(5)}` }).expect(200);
    await nima.agent.post(`/api/employees/${soon.id}/birthday_wishes`).send({ message: 'پیشاپیش مبارک' }).expect(201);
    await nima.agent.post(`/api/employees/${gone.id}/birthday_wishes`).send({ message: 'دیر شد ولی مبارک' }).expect(201);
    await nima.agent.post(`/api/employees/${gone.id}/birthday_wishes`).send({ message: 'سالگرد دیر', occasion: 'anniversary' }).expect(201);

    const all = (await reza.agent.get('/api/birthday_wishes').expect(200)).body as Record<string, Card[]>;
    expect(all[soon.id].map((c) => c.text)).toEqual(['پیشاپیش مبارک']);
    expect(all[sara.id].length).toBeGreaterThan(0);
    expect(all).not.toHaveProperty(gone.id);
    // Reza's anniversary is today, so his anniversary card is still there.
    expect(all[reza.id].map((c) => c.occasion)).toContain('anniversary');
  });

  it("knows when a yearly day's cards can be on a dashboard", () => {
    const at = moment('1405/08/30', 'jYYYY/jMM/jDD').hour(10).toDate();
    expect(daysUntilYearly('09/01', at)).toBe(1);
    expect(daysUntilYearly('1370/08/30', at)).toBe(0);
    expect(daysUntilYearly('08/29', at)).toBe(364);
    expect(cardsShownNow('1370/08/30', at)).toBe(true);
    expect(cardsShownNow('09/14', at)).toBe(true);
    expect(cardsShownNow('09/15', at)).toBe(false);
    expect(cardsShownNow('08/24', at)).toBe(true);
    expect(cardsShownNow('08/23', at)).toBe(false);
    expect(cardsShownNow('', at)).toBe(false);
    // Across the new year: two days before Nowruz, a 10 Farvardin birthday is twelve days away.
    const esfand = moment('1404/12/27', 'jYYYY/jMM/jDD').hour(10).toDate();
    expect(daysUntilYearly('01/10', esfand)).toBe(12);
    expect(cardsShownNow('01/10', esfand)).toBe(true);
  });

  it('counts days since a yearly date and years since a date', () => {
    const day = moment('1405/08/10', 'jYYYY/jMM/jDD').toDate();
    expect(daysSinceYearly('08/10', day)).toBe(0);
    expect(daysSinceYearly('1399/08/04', day)).toBe(6);
    expect(daysSinceYearly('08/11', day)).toBeNull();
    expect(daysSinceYearly('', day)).toBeNull();
    expect(yearsSince('1399/08/10', day)).toBe(6);
    expect(yearsSince('', day)).toBe(0);
    // Esfand 30 counts from the 29th in common years (1404 is not a leap year).
    expect(daysSinceYearly('12/30', moment('1404/12/29', 'jYYYY/jMM/jDD').toDate())).toBe(0);
  });
});
