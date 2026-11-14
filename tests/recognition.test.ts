import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { employees, notifications, recognitions } from '../server/db/schema';
import { deliverDueRecognitions, giveRecognition, parseCursor, walletOf, withdrawRecognition } from '../server/recognition';
import { FEATURES, featureReleased } from '../shared/features';
import { jalaliToDate } from '../shared/jalali';
import {
  amountChoices,
  DEFAULT_RECOGNITION_RULES,
  DEFAULT_RECOGNITION_VALUES,
  messageLength,
  monthAllowance,
  monthProgress,
  nextRecognitionMonth,
  RECOGNITION_PAGE,
  RECOGNITION_UNDO_MS,
  recognitionMonth,
  rulesFor,
  rulesProblem,
  withRulesChange,
} from '../shared/recognition';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const MESSAGE = 'ممنون که دیشب تا آخر ماندی و گزارش فصلی را با من تمام کردی.';
const PRIVATE_MESSAGE = 'این یکی فقط بین خودمان بماند؛ بابت صبوری‌ات در جلسهٔ سخت دیروز ممنونم.';

/** A moment after the few minutes in which a recognition sent just now can still be taken back. */
const afterUndo = () => new Date(Date.now() + RECOGNITION_UNDO_MS + 1000);

// In the order they were sent: after a delete, PostgreSQL may hand rows back in another order.
const recognitionNotifications = (userId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'recognition'))).orderBy(asc(notifications.id));

describe('«سپاس»: the rules of the coins', () => {
  it('accepts the built-in rules and says what is wrong with others', () => {
    expect(rulesProblem(DEFAULT_RECOGNITION_RULES)).toBeNull();
    expect(rulesProblem({ ...DEFAULT_RECOGNITION_RULES, allowance: 102 })).toContain('مضرب');
    expect(rulesProblem({ ...DEFAULT_RECOGNITION_RULES, minAmount: 30 })).toContain('کمترین');
    expect(rulesProblem({ ...DEFAULT_RECOGNITION_RULES, perPersonMax: 20 })).toContain('سقف یک نفر');
    expect(rulesProblem({ ...DEFAULT_RECOGNITION_RULES, perPersonMax: 120 })).toContain('سهمیهٔ ماهانه');
    expect(rulesProblem({ ...DEFAULT_RECOGNITION_RULES, dailyMax: 0 })).toContain('روزانه');
    expect(rulesProblem({ ...DEFAULT_RECOGNITION_RULES, allowance: 5000, perPersonMax: 40 })).toContain('حداکثر');
    expect(amountChoices(DEFAULT_RECOGNITION_RULES)).toEqual([5, 10, 15, 20, 25]);
  });

  it('counts the days of Jalali months of 29, 30 and 31 days, in Tehran time', () => {
    // Farvardin has 31 days, Azar 30, and Esfand 29 in a common year (1404) and 30 in a leap year (1403).
    expect(monthProgress(jalaliToDate('1405/01/31')!)).toEqual({ day: 31, daysInMonth: 31, daysLeft: 1 });
    expect(monthProgress(jalaliToDate('1405/09/01')!)).toEqual({ day: 1, daysInMonth: 30, daysLeft: 30 });
    expect(monthProgress(jalaliToDate('1404/12/29', '23:59')!)).toEqual({ day: 29, daysInMonth: 29, daysLeft: 1 });
    expect(monthProgress(jalaliToDate('1403/12/30')!).daysInMonth).toBe(30);
    // The month turns at midnight in Tehran, and Esfand is followed by Farvardin of the next year.
    expect(recognitionMonth(jalaliToDate('1404/12/29', '23:59')!)).toBe('1404/12');
    expect(recognitionMonth(new Date(jalaliToDate('1404/12/29', '23:59')!.getTime() + 60_000))).toBe('1405/01');
    expect(nextRecognitionMonth('1404/12')).toBe('1405/01');
    expect(nextRecognitionMonth('1405/08')).toBe('1405/09');
  });

  it('gives a colleague who joined during the month the share of the days left, in fives', () => {
    const joined = (day: string) => jalaliToDate(day, '10:00')!;
    expect(monthAllowance(100, '1405/09', joined('1405/08/20'))).toBe(100);
    expect(monthAllowance(100, '1405/09', joined('1405/09/01'))).toBe(100);
    expect(monthAllowance(100, '1405/09', joined('1405/09/10'))).toBe(70);
    expect(monthAllowance(100, '1405/09', joined('1405/09/16'))).toBe(50);
    // Never less than one coin of five, even on the last day.
    expect(monthAllowance(100, '1405/09', joined('1405/09/30'))).toBe(5);
    expect(monthAllowance(20, '1405/09', joined('1405/09/30'))).toBe(5);
    // The month after, they have all of it like everyone else.
    expect(monthAllowance(100, '1405/10', joined('1405/09/16'))).toBe(100);
    expect(monthAllowance(100, '1405/09', null)).toBe(100);
  });

  it('keeps a change of the rules for the next month, unless the part is still switched off', () => {
    const smaller = { ...DEFAULT_RECOGNITION_RULES, allowance: 50 };
    expect(rulesFor(null, '1405/09')).toEqual(DEFAULT_RECOGNITION_RULES);
    expect(withRulesChange(null, smaller, '1405/09', true)).toEqual({ rules: smaller, pending: null });
    const waiting = withRulesChange(null, smaller, '1405/09', false);
    expect(waiting.pending?.from).toBe('1405/10');
    expect(rulesFor(waiting, '1405/09').allowance).toBe(100);
    expect(rulesFor(waiting, '1405/10').allowance).toBe(50);
    expect(rulesFor(waiting, '1406/01').allowance).toBe(50);
    // A second change two months later starts from the first, which is in force by then.
    const again = withRulesChange(waiting, { ...smaller, allowance: 75 }, '1405/11', false);
    expect(rulesFor(again, '1405/11').allowance).toBe(50);
    expect(rulesFor(again, '1405/12').allowance).toBe(75);
  });

  it('measures a message without its spaces and reads a list cursor', () => {
    expect(messageLength('  ممنون   از \n تو ')).toBe(9);
    expect(parseCursor('2026-11-14T07:00:00.000Z~rec-1')).toEqual({ at: new Date('2026-11-14T07:00:00.000Z'), id: 'rec-1' });
    expect(parseCursor('rec-1')).toBeNull();
    expect(parseCursor('yesterday~rec-1')).toBeNull();
    expect(parseCursor('2026-11-14T07:00:00.000Z~')).toBeNull();
  });
});

describe('«سپاس»: giving coins with a message of thanks', () => {
  let admin: Agent;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let mina: Person;
  let omid: Person;
  let neda: Person;
  let hr: Person;
  /** The public recognition (ali to sara, 20 coins) most of the tests are about, and the private one. */
  let publicId: string;
  let privateId: string;

  const setState = (state: string) => admin.put('/api/settings/features/recognition').send({ state }).expect(200);
  const give = (from: Person, to: Person | string, extra: object = {}) =>
    from.agent
      .post('/api/recognitions')
      .send({ to: typeof to === 'string' ? to : to.id, amount: 10, valueId: 'teamwork', message: MESSAGE, isPublic: true, ...extra });
  const wallet = async (who: Person) => (await who.agent.get('/api/recognitions/wallet').expect(200)).body;
  const wall = async (who: Person | { agent: Agent }, query = '') => (await who.agent.get(`/api/recognitions/wall${query}`).expect(200)).body;
  const mine = async (who: Person) => (await who.agent.get('/api/recognitions/mine').expect(200)).body;
  const rowOf = async (who: Person) => (await db.select().from(employees).where(eq(employees.id, who.id)))[0];

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    const role = (await admin.post('/api/roles').send({ name: 'مسئول سپاس', description: '', permissions: ['recognition.manage'] }).expect(201)).body;
    ali = await createEmployee(admin, { username: 'rec.ali', department: 'فروش' });
    sara = await createEmployee(admin, { username: 'rec.sara', department: 'طراحی' });
    reza = await createEmployee(admin, { username: 'rec.reza', department: 'فروش' });
    mina = await createEmployee(admin, { username: 'rec.mina', department: 'تولید' });
    omid = await createEmployee(admin, { username: 'rec.omid', department: 'تولید' });
    neda = await createEmployee(admin, { username: 'rec.neda', department: 'تولید' });
    hr = await createEmployee(admin, { username: 'rec.hr', department: 'فروش', role: role.id });
    // Everyone has been here for years: a colleague who joined this month has a smaller first allowance.
    await db.update(employees).set({ createdAt: new Date('2020-01-01T08:00:00Z') });
  });
  afterAll(() => pool.end());

  it('is out of reach of everyone, with no switch or permission shown, while it is being built', async () => {
    expect(FEATURES.find((f) => f.key === 'recognition')).toMatchObject({ defaultState: 'off', unreleased: true });
    expect(featureReleased('recognition')).toBe(false);
    expect(featureReleased('tasks')).toBe(true);
    for (const who of [admin, ali.agent]) {
      await who.get('/api/recognitions/wallet').expect(404);
      await who.get('/api/recognitions/wall').expect(404);
      await who.post('/api/recognitions').send({ to: sara.id, amount: 10, valueId: 'teamwork', message: MESSAGE }).expect(404);
      const portalSettings = (await who.get('/api/settings').expect(200)).body;
      expect(portalSettings.features).not.toHaveProperty('recognition');
      // Its rules and values are not part of what every page loads.
      expect(portalSettings).not.toHaveProperty('recognitionRules');
      expect(portalSettings).not.toHaveProperty('recognitionValues');
    }
    const switches = (await admin.get('/api/settings/features').expect(200)).body.features.map((f: { key: string }) => f.key);
    expect(switches).not.toContain('recognition');
    expect(switches).toContain('tasks');
    // Its settings can be written before it is switched on, by its owner and the administrator only.
    await ali.agent.get('/api/settings/recognition').expect(403);
    const settings = (await hr.agent.get('/api/settings/recognition').expect(200)).body;
    expect(settings).toMatchObject({ rules: DEFAULT_RECOGNITION_RULES, pending: null, rulesApplyAtOnce: true });
    expect(settings.values).toEqual(DEFAULT_RECOGNITION_VALUES);
  });

  it('in preview, lets only the pilot group in, and coins only go to people in it', async () => {
    await setState('preview');
    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [ali.id, sara.id] }).expect(200);
    expect((await ali.agent.get('/api/settings').expect(200)).body.features.recognition).toBe('preview');
    await reza.agent.get('/api/recognitions/wallet').expect(404);
    const people = (await ali.agent.get('/api/recognitions/colleagues').expect(200)).body;
    // The administrator always sees a part in preview.
    expect(people.map((p: { name: string }) => p.name).sort()).toEqual(['مدیر سیستم', 'همکار rec.sara']);
    expect(people[0]).toMatchObject({ givenThisMonth: 0 });
    expect((await give(ali, reza).expect(400)).body.error).toContain('دسترسی ندارد');
    await setState('on');
    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [] }).expect(200);
    await reza.agent.get('/api/recognitions/wallet').expect(200);
  });

  it('starts every colleague with a full wallet for the month', async () => {
    const w = await wallet(ali);
    expect(w).toMatchObject({
      month: recognitionMonth(),
      allowance: 100,
      given: 0,
      left: 100,
      amounts: [5, 10, 15, 20, 25],
      joinAmount: 5,
      writtenToday: 0,
      received: { coins: 0, sealed: 0 },
      rules: { minAmount: 5, maxAmount: 25, perPersonMax: 40, dailyMax: 10 },
    });
    expect(w.values.map((v: { id: string }) => v.id)).toEqual(['teamwork', 'ownership', 'learning', 'customer', 'initiative']);
    expect({ day: w.day, daysInMonth: w.daysInMonth, daysLeft: w.daysLeft }).toEqual(monthProgress());
    // Someone who joined the portal today has the share of the days left.
    await db.update(employees).set({ createdAt: new Date() }).where(eq(employees.id, neda.id));
    const first = await wallet(neda);
    expect(first.allowance).toBe(monthAllowance(100, recognitionMonth(), new Date()));
    expect(first.left).toBe(first.allowance);
    await db.update(employees).set({ createdAt: new Date('2020-01-01T08:00:00Z') }).where(eq(employees.id, neda.id));
  });

  it('refuses a recognition to oneself, of a wrong amount, without a value or with a message too short', async () => {
    expect((await give(ali, ali).expect(400)).body.error).toContain('خودتان');
    await give(ali, 'emp-nobody').expect(400);
    expect((await give(ali, sara, { amount: 7 }).expect(400)).body.error).toContain('پنج‌تا پنج‌تا');
    await give(ali, sara, { amount: 30 }).expect(400);
    await give(ali, sara, { amount: 0 }).expect(400);
    await give(ali, sara, { amount: 12.5 }).expect(400);
    expect((await give(ali, sara, { valueId: 'nope' }).expect(400)).body.error).toContain('ارزش');
    expect((await give(ali, sara, { message: 'ممنون' }).expect(400)).body.error).toContain('حداقل ۱۵ حرف');
    // Spaces do not make a message longer.
    await give(ali, sara, { message: `ممنون${' '.repeat(30)}عزیز` }).expect(400);
    await give(ali, sara, { message: undefined }).expect(400);
    expect((await wallet(ali)).left).toBe(100);
    expect(await db.select().from(recognitions)).toEqual([]);
  });

  it('keeps a recognition from its receiver for five minutes, in which the sender can take it back', async () => {
    const sent = (await give(ali, sara, { amount: 20 }).expect(201)).body;
    expect(sent.wallet).toMatchObject({ given: 20, left: 80, writtenToday: 1 });
    const until = new Date(sent.withdrawUntil).getTime() - Date.now();
    expect(until).toBeGreaterThan(RECOGNITION_UNDO_MS - 10_000);
    expect(until).toBeLessThanOrEqual(RECOGNITION_UNDO_MS);

    // Not handed over yet: the receiver and the wall know nothing of it.
    expect(await deliverDueRecognitions()).toBe(0);
    expect(await recognitionNotifications(sara.id)).toEqual([]);
    expect((await mine(sara)).received).toEqual([]);
    expect((await wallet(sara)).received).toEqual({ coins: 0, sealed: 0 });
    expect((await wall(reza)).items).toEqual([]);
    const given = (await mine(ali)).given;
    expect(given).toHaveLength(1);
    expect(given[0]).toMatchObject({ id: sent.id, amount: 20, delivered: false, opened: false, withdrawUntil: sent.withdrawUntil, joinOf: null });

    // Only the sender takes it back; the coins are theirs again and the day's count goes back too.
    await sara.agent.post(`/api/recognitions/${sent.id}/withdraw`).expect(404);
    const back = (await ali.agent.post(`/api/recognitions/${sent.id}/withdraw`).expect(200)).body;
    expect(back.wallet).toMatchObject({ given: 0, left: 100, writtenToday: 0 });
    await ali.agent.post(`/api/recognitions/${sent.id}/withdraw`).expect(400);
    expect((await mine(ali)).given).toEqual([]);
    // It is never handed over afterwards, and the row is kept.
    expect(await deliverDueRecognitions(afterUndo())).toBe(0);
    expect(await recognitionNotifications(sara.id)).toEqual([]);
    expect(await db.select().from(recognitions)).toHaveLength(1);
  });

  it('hands it over once the five minutes have passed, and tells the receiver once, without the coins or the message', async () => {
    publicId = (await give(ali, sara, { amount: 20 }).expect(201)).body.id;
    privateId = (await give(ali, sara, { amount: 15, isPublic: false, message: PRIVATE_MESSAGE, valueId: 'ownership' }).expect(201)).body.id;
    expect(await deliverDueRecognitions(afterUndo())).toBe(2);
    // A second tick of the scheduler (or a restart) hands nothing over twice.
    expect(await deliverDueRecognitions(afterUndo())).toBe(0);
    const told = await recognitionNotifications(sara.id);
    expect(told).toHaveLength(2);
    for (const n of told) {
      expect(n.title).toContain('همکار rec.ali');
      expect(n.linkTab).toBe('thanks');
      expect(`${n.title} ${n.message}`).not.toMatch(/ممنون|صبوری|20|15|۲۰|۱۵/);
    }
    expect(told.map((n) => n.linkId).sort()).toEqual([publicId, privateId].sort());
    // Too late to take it back now.
    expect((await ali.agent.post(`/api/recognitions/${publicId}/withdraw`).expect(400)).body.error).toContain('گذشته');
    expect((await wallet(ali)).left).toBe(65);
  });

  it('arrives sealed: the receiver sees who it is from, and the rest when they open it', async () => {
    const before = (await mine(sara)).received;
    expect(before).toHaveLength(2);
    for (const card of before) {
      expect(card).toMatchObject({ sealed: true, from: { id: ali.id, name: 'همکار rec.ali' } });
      expect(Object.keys(card).sort()).toEqual(['at', 'from', 'id', 'sealed']);
    }
    // The coins of a sealed one are not counted yet, so the total does not give it away.
    expect((await wallet(sara)).received).toEqual({ coins: 0, sealed: 2 });

    // Nobody else opens it.
    await reza.agent.post(`/api/recognitions/${publicId}/open`).expect(404);
    await ali.agent.post(`/api/recognitions/${publicId}/open`).expect(404);
    const opened = (await sara.agent.post(`/api/recognitions/${publicId}/open`).expect(200)).body;
    expect(opened).toMatchObject({ sealed: false, amount: 20, total: 20, joiners: [], message: MESSAGE, isPublic: true, hidden: false, reaction: '' });
    expect(opened.value).toEqual({ id: 'teamwork', label: 'همکاری', tone: 'sage' });
    expect((await wallet(sara)).received).toEqual({ coins: 20, sealed: 1 });
    // Opening it again changes nothing, and the sender sees that it was read.
    const again = (await sara.agent.post(`/api/recognitions/${publicId}/open`).expect(200)).body;
    expect(again.openedAt).toBe(opened.openedAt);
    const given = (await mine(ali)).given;
    expect(given.find((g: { id: string }) => g.id === publicId)).toMatchObject({ delivered: true, opened: true, withdrawUntil: null });
    expect(given.find((g: { id: string }) => g.id === privateId)).toMatchObject({ delivered: true, opened: false, amount: 15, isPublic: false });
  });

  it('shows public recognitions on the wall without any amount, and private ones to nobody but the two', async () => {
    const seen = await wall(reza);
    expect(seen.next).toBeNull();
    expect(seen.items).toHaveLength(1);
    expect(seen.items[0]).toMatchObject({
      id: publicId,
      from: { id: ali.id, department: 'فروش' },
      to: { id: sara.id, department: 'طراحی' },
      value: { id: 'teamwork', label: 'همکاری' },
      message: MESSAGE,
      joiners: [],
      joined: false,
      mine: null,
      reactions: [],
    });
    expect((await wall(ali)).items[0].mine).toBe('sender');
    expect((await wall(sara)).items[0].mine).toBe('receiver');
    // No amount anywhere on the wall, for the two of them either.
    for (const who of [reza, ali, sara]) expect(JSON.stringify(await wall(who))).not.toMatch(/amount|total|"20"|:20\b/);

    // The private one: not on the wall, and the administrator and the programme's owner cannot read it anywhere.
    for (const who of [{ agent: admin }, hr, reza]) {
      const everything = JSON.stringify([
        await wall(who),
        (await who.agent.get('/api/recognitions/mine').expect(200)).body,
        (await who.agent.get('/api/notifications').expect(200)).body,
      ]);
      expect(everything).not.toContain('صبوری');
      await who.agent.post(`/api/recognitions/${privateId}/open`).expect(404);
      await who.agent.post(`/api/recognitions/${privateId}/join`).expect(404);
      await who.agent.put('/api/reactions').send({ target: 'recognition', id: privateId, emoji: '👍' }).expect(404);
    }
    expect(JSON.stringify((await admin.get('/api/audit-log').expect(200)).body)).not.toContain('صبوری');

    // Filters: by value, and by the unit of the colleague who was recognised.
    expect((await wall(reza, '?value=teamwork')).items).toHaveLength(1);
    expect((await wall(reza, '?value=learning')).items).toEqual([]);
    expect((await wall(reza, `?department=${encodeURIComponent('طراحی')}`)).items).toHaveLength(1);
    expect((await wall(reza, `?department=${encodeURIComponent('فروش')}`)).items).toEqual([]);
    await reza.agent.get('/api/recognitions/wall?before=not-a-cursor').expect(400);
  });

  it('«من هم»: a colleague adds five coins of their own to a card on the wall, once', async () => {
    const joined = (await reza.agent.post(`/api/recognitions/${publicId}/join`).expect(201)).body;
    expect(joined.wallet).toMatchObject({ given: 5, left: 95, writtenToday: 0 });
    // Their own shows at once; the others see it when it is handed over.
    expect((await wall(reza)).items[0]).toMatchObject({ joined: true, joiners: [{ id: reza.id, name: 'همکار rec.reza' }] });
    expect((await wall(mina)).items[0]).toMatchObject({ joined: false, joiners: [] });
    expect((await reza.agent.post(`/api/recognitions/${publicId}/join`).expect(400)).body.error).toContain('قبلاً');
    // Not one's own, and not one written for oneself.
    await ali.agent.post(`/api/recognitions/${publicId}/join`).expect(400);
    await sara.agent.post(`/api/recognitions/${publicId}/join`).expect(400);
    await reza.agent.post('/api/recognitions/rec-nothing/join').expect(404);

    // Taken back within the five minutes, it can be given again.
    const first = (await mina.agent.post(`/api/recognitions/${publicId}/join`).expect(201)).body;
    expect((await mina.agent.post(`/api/recognitions/${first.id}/withdraw`).expect(200)).body.wallet.left).toBe(100);
    await mina.agent.post(`/api/recognitions/${publicId}/join`).expect(201);

    expect(await deliverDueRecognitions(afterUndo())).toBe(2);
    expect((await wall(omid)).items[0].joiners.map((j: { name: string }) => j.name)).toEqual(['همکار rec.reza', 'همکار rec.mina']);
    await reza.agent.post(`/api/recognitions/${joined.id}/withdraw`).expect(400);
    // The receiver is told who joined, sees them on the card, and the coins count without a seal to open.
    const told = await recognitionNotifications(sara.id);
    expect(told).toHaveLength(4);
    expect(told[2]).toMatchObject({ linkId: publicId });
    expect(told[2].title).toContain('همکار rec.reza');
    const card = (await sara.agent.post(`/api/recognitions/${publicId}/open`).expect(200)).body;
    expect(card).toMatchObject({ amount: 20, total: 30, joiners: [{ name: 'همکار rec.reza', amount: 5 }, { name: 'همکار rec.mina', amount: 5 }] });
    expect((await wallet(sara)).received).toEqual({ coins: 30, sealed: 1 });
    // What reza gave shows as a «من هم» of that card.
    expect((await mine(reza)).given[0]).toMatchObject({ joinOf: publicId, amount: 5, message: '', to: { id: sara.id } });
  });

  it('lets nobody give more than 40 coins to the same colleague in a month, «من هم» included', async () => {
    // ali has given sara 20 + 15 this month.
    const people = (await ali.agent.get('/api/recognitions/colleagues').expect(200)).body;
    expect(people.find((p: { id: string }) => p.id === sara.id).givenThisMonth).toBe(35);
    const tooMuch = (await give(ali, sara, { amount: 10 }).expect(400)).body.error;
    expect(tooMuch).toContain('حداکثر ۴۰ سکه');
    expect(tooMuch).toContain('۵ سکهٔ دیگر');
    await give(ali, sara, { amount: 5 }).expect(201);
    expect((await give(ali, sara, { amount: 5, message: `${MESSAGE} باز هم ممنون.` }).expect(400)).body.error).toContain('به سقف ۴۰ سکه');
    // «من هم» counts for it as well.
    await give(omid, sara, { amount: 25 }).expect(201);
    await give(omid, sara, { amount: 15 }).expect(201);
    expect((await omid.agent.post(`/api/recognitions/${publicId}/join`).expect(400)).body.error).toContain('به سقف ۴۰ سکه');
    expect((await wallet(omid)).left).toBe(60);
    expect(await deliverDueRecognitions(afterUndo())).toBe(3);
  });

  it('takes the reactions of colleagues on the wall, and the receiver’s own answer on the card', async () => {
    const counts = (await mina.agent.put('/api/reactions').send({ target: 'recognition', id: publicId, emoji: '👍' }).expect(200)).body;
    expect(counts).toEqual([{ emoji: '👍', count: 1, mine: true, names: ['همکار rec.mina'] }]);
    // The receiver answers on the card itself, once they have opened it.
    expect((await sara.agent.put('/api/reactions').send({ target: 'recognition', id: publicId, emoji: '👍' }).expect(400)).body.error).toContain('روی خود آن');
    await sara.agent.put(`/api/recognitions/${privateId}/reaction`).send({ reaction: '❤️' }).expect(400);
    await reza.agent.put(`/api/recognitions/${publicId}/reaction`).send({ reaction: '❤️' }).expect(404);
    await sara.agent.put(`/api/recognitions/${publicId}/reaction`).send({ reaction: '🔥' }).expect(400);
    expect((await sara.agent.put(`/api/recognitions/${publicId}/reaction`).send({ reaction: '❤️' }).expect(200)).body.reaction).toBe('❤️');
    // The sender hears of the first answer only.
    await sara.agent.put(`/api/recognitions/${publicId}/reaction`).send({ reaction: '🙏' }).expect(200);
    const told = await recognitionNotifications(ali.id);
    expect(told).toHaveLength(1);
    expect(told[0].title).toBe('همکار rec.sara به قدردانی شما پاسخ داد ❤️');
    const card = (await wall(omid)).items.find((c: { id: string }) => c.id === publicId);
    expect(card).toMatchObject({ reaction: '🙏', reactions: [{ emoji: '👍', count: 1, mine: false }] });
    expect((await mine(ali)).given.find((g: { id: string }) => g.id === publicId).reaction).toBe('🙏');
  });

  it('lets the receiver take a public recognition off the wall, and put it back', async () => {
    await ali.agent.put(`/api/recognitions/${publicId}/hidden`).send({ hidden: true }).expect(404);
    expect((await sara.agent.put(`/api/recognitions/${privateId}/hidden`).send({ hidden: true }).expect(400)).body.error).toContain('دو نفر');
    expect((await sara.agent.put(`/api/recognitions/${publicId}/hidden`).send({ hidden: true }).expect(200)).body.hidden).toBe(true);
    expect((await wall(reza)).items.map((c: { id: string }) => c.id)).not.toContain(publicId);
    // Off the wall, nobody joins it or reacts to it; it is still the receiver's, with its coins.
    await hr.agent.post(`/api/recognitions/${publicId}/join`).expect(404);
    await hr.agent.put('/api/reactions').send({ target: 'recognition', id: publicId, emoji: '👍' }).expect(404);
    expect((await mine(sara)).received.find((c: { id: string }) => c.id === publicId)).toMatchObject({ hidden: true, total: 30 });
    expect((await sara.agent.put(`/api/recognitions/${publicId}/hidden`).send({ hidden: false }).expect(200)).body.hidden).toBe(false);
    expect((await wall(reza)).items.map((c: { id: string }) => c.id)).toContain(publicId);
  });

  it('never spends more than the allowance, however many clicks arrive at once', async () => {
    // Five recognitions of 25 at the same moment from a wallet of 100: four go through.
    const results = await Promise.all([ali, reza, mina, omid, hr].map((to) => give(neda, to, { amount: 25 })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 400]);
    expect(results.find((r) => r.status === 400)!.body.error).toContain('تمام شده');
    expect(await wallet(neda)).toMatchObject({ given: 100, left: 0, writtenToday: 4 });
    expect((await give(neda, sara, { amount: 5 }).expect(400)).body.error).toContain('تمام شده');
    // With 10 left, 15 is refused and says what is left.
    const one = (await mine(neda)).given[0];
    await neda.agent.post(`/api/recognitions/${one.id}/withdraw`).expect(200);
    await give(neda, sara, { amount: 15 }).expect(201);
    // The same form sent again a moment later (a double click) is not a second recognition.
    expect((await give(neda, sara, { amount: 15 }).expect(409)).body.error).toContain('چند لحظه پیش');
    expect(await wallet(neda)).toMatchObject({ given: 90, left: 10, writtenToday: 4 });
    expect((await give(neda, mina, { amount: 15 }).expect(400)).body.error).toContain('۱۰ سکه برایتان مانده');
    // Two «من هم» at once on the same card: one is kept.
    const twice = await Promise.all([1, 2].map(() => hr.agent.post(`/api/recognitions/${publicId}/join`)));
    expect(twice.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await wallet(hr)).given).toBe(5);
    expect(await deliverDueRecognitions(afterUndo())).toBe(5);
  });

  it('burns what is left at the end of the Jalali month and starts the next one full, with no scheduled job', async () => {
    const me = await rowOf(reza);
    // Two minutes before midnight on the last day of Bahman 1404 (a month of 30 days).
    const lastNight = jalaliToDate('1404/11/30', '23:58')!;
    const nextMonth = new Date(lastNight.getTime() + 3 * 60_000);
    const sent = await giveRecognition(me, { to: ali.id, amount: 25, valueId: 'learning', message: MESSAGE, isPublic: false }, lastNight);
    expect(sent.month).toBe('1404/11');
    expect(await walletOf(me, lastNight)).toMatchObject({ month: '1404/11', allowance: 100, given: 25, left: 75, daysLeft: 1 });
    // One minute into Esfand: the 75 left are gone and the wallet is full again.
    expect(await walletOf(me, nextMonth)).toMatchObject({ month: '1404/12', allowance: 100, given: 0, left: 100, day: 1, daysInMonth: 29 });

    // Handed over after midnight, it still came out of Bahman's allowance.
    expect(await deliverDueRecognitions(new Date(lastNight.getTime() + RECOGNITION_UNDO_MS))).toBe(1);
    const [row] = await db.select().from(recognitions).where(eq(recognitions.id, sent.id));
    expect(row.month).toBe('1404/11');
    expect(recognitionMonth(row.deliveredAt!)).toBe('1404/12');
    expect((await walletOf(me, nextMonth)).given).toBe(0);

    // Taken back after midnight, within its five minutes: the coins go back to Bahman, not to Esfand.
    const second = await giveRecognition(me, { to: mina.id, amount: 25, valueId: 'learning', message: MESSAGE, isPublic: false }, lastNight);
    expect((await walletOf(me, lastNight)).left).toBe(50);
    await withdrawRecognition(me, second.id, nextMonth);
    expect((await walletOf(me, lastNight)).left).toBe(75);
    expect((await walletOf(me, nextMonth)).left).toBe(100);
    // Five minutes and a second after sending, it is too late.
    const third = await giveRecognition(me, { to: mina.id, amount: 5, valueId: 'learning', message: MESSAGE, isPublic: false }, lastNight);
    await expect(withdrawRecognition(me, third.id, new Date(lastNight.getTime() + RECOGNITION_UNDO_MS + 1000))).rejects.toThrow('گذشته');
  });

  it('lets the programme’s owner reverse one with a reason: the coins go back and both people are told', async () => {
    const before = { ali: (await wallet(ali)).left, reza: (await wallet(reza)).left, sara: (await wallet(sara)).received.coins };
    await ali.agent.post(`/api/recognitions/${publicId}/reverse`).send({ reason: 'می‌خواهم برگردد' }).expect(403);
    await hr.agent.post(`/api/recognitions/${publicId}/reverse`).send({ reason: 'نه' }).expect(400);
    await hr.agent.post(`/api/recognitions/${publicId}/reverse`).send({}).expect(400);
    const done = (await hr.agent.post(`/api/recognitions/${publicId}/reverse`).send({ reason: 'به اشتباه دو بار ثبت شده بود.' }).expect(200)).body;
    // The card and the three «من هم» on it (reza, mina, hr).
    expect(done).toEqual({ id: publicId, reversed: 4 });
    expect((await hr.agent.post(`/api/recognitions/${publicId}/reverse`).send({ reason: 'دوباره برگردد.' }).expect(400)).body.error).toContain('قبلاً');

    // Off the wall and out of the receiver's coins; back in the givers' allowance, as the month is not over.
    expect((await wall(omid)).items.map((c: { id: string }) => c.id)).not.toContain(publicId);
    await sara.agent.post(`/api/recognitions/${publicId}/open`).expect(404);
    expect((await wallet(sara)).received.coins).toBe(before.sara - 35);
    expect((await wallet(ali)).left).toBe(before.ali + 20);
    expect((await wallet(reza)).left).toBe(before.reza + 5);
    expect((await mine(ali)).given.find((g: { id: string }) => g.id === publicId)).toMatchObject({ reversed: true, reverseReason: 'به اشتباه دو بار ثبت شده بود.' });

    // Both people read the reason; those who had joined are told too.
    for (const who of [ali, sara]) {
      const last = (await recognitionNotifications(who.id)).at(-1)!;
      expect(last.title).toBe('یک قدردانی برگردانده شد');
      expect(last.message).toContain('به اشتباه دو بار ثبت شده بود.');
    }
    expect((await recognitionNotifications(reza.id)).at(-1)!.title).toContain('همراه شده بودید');
    expect((await recognitionNotifications(mina.id)).at(-1)!.title).toContain('همراه شده بودید');

    // The change history names the two and the reason, never the message, of a private one either.
    await hr.agent.post(`/api/recognitions/${privateId}/reverse`).send({ reason: 'به درخواست فرستنده.' }).expect(200);
    const history = (await admin.get('/api/audit-log').expect(200)).body;
    const text = JSON.stringify(history);
    expect(text).toContain('قدردانی همکار rec.ali از همکار rec.sara');
    expect(text).toContain('به اشتباه دو بار ثبت شده بود.');
    expect(text).not.toContain('گزارش فصلی');
    expect(text).not.toContain('صبوری');
  });

  it('applies a change of the rules from the next month, and a change of the values at once', async () => {
    const smaller = { allowance: 50, minAmount: 5, maxAmount: 10, perPersonMax: 20, dailyMax: 3 };
    await ali.agent.put('/api/settings/recognition').send({ rules: smaller }).expect(403);
    expect((await hr.agent.put('/api/settings/recognition').send({ rules: { ...smaller, minAmount: 15 } }).expect(400)).body.error).toContain('کمترین');
    await hr.agent.put('/api/settings/recognition').send({ rules: { ...smaller, allowance: 52 } }).expect(400);
    const saved = (await hr.agent.put('/api/settings/recognition').send({ rules: smaller }).expect(200)).body;
    const next = nextRecognitionMonth(recognitionMonth());
    expect(saved).toMatchObject({ rules: DEFAULT_RECOGNITION_RULES, pending: { from: next, rules: smaller }, rulesApplyAtOnce: false });
    // Nothing changes for anyone this month.
    expect(await wallet(mina)).toMatchObject({ allowance: 100, amounts: [5, 10, 15, 20, 25] });
    const firstOfNext = jalaliToDate(`${next}/01`, '09:00')!;
    expect(await walletOf(await rowOf(mina), firstOfNext)).toMatchObject({ month: next, allowance: 50, left: 50, amounts: [5, 10] });

    // The values: a new list is in use at once; cards already written keep the value they were given for.
    const quality = { id: 'quality', label: 'کیفیت', tone: 'teal' };
    await hr.agent.put('/api/settings/recognition').send({ values: [quality, { ...quality, id: 'quality-2' }] }).expect(400);
    await hr.agent.put('/api/settings/recognition').send({ values: [{ ...quality, tone: 'pink' }] }).expect(400);
    expect((await hr.agent.put('/api/settings/recognition').send({ values: [quality] }).expect(200)).body.values).toEqual([quality]);
    expect((await wallet(mina)).values).toEqual([quality]);
    await give(mina, ali).expect(400);
    await give(mina, ali, { valueId: 'quality', amount: 5 }).expect(201);
    expect((await mine(ali)).given.at(-1).value.label).toBe('همکاری');
    // An empty list brings the built-in five back.
    expect((await hr.agent.put('/api/settings/recognition').send({ values: [] }).expect(200)).body.values).toEqual(DEFAULT_RECOGNITION_VALUES);
    const history = JSON.stringify((await admin.get('/api/audit-log').expect(200)).body);
    expect(history).toContain('قواعد «سپاس»');
    expect(history).toContain('ارزش‌های «سپاس»');
  });

  it('counts the recognitions written in a day, not the «من هم»s', async () => {
    // Switched off, a change of the rules applies at once: it is still being set up.
    await setState('off');
    const strict = { ...DEFAULT_RECOGNITION_RULES, dailyMax: 2 };
    expect((await hr.agent.put('/api/settings/recognition').send({ rules: strict }).expect(200)).body).toMatchObject({ rules: strict, pending: null });
    await setState('on');
    // mina wrote one today already.
    expect((await wallet(mina)).writtenToday).toBe(1);
    await give(mina, reza, { amount: 5 }).expect(201);
    expect((await give(mina, omid, { amount: 5 }).expect(429)).body.error).toContain('امروز ۲ قدردانی');
    // A «من هم» has no message and is not one of them.
    const [card] = (await wall(mina)).items;
    expect(card.mine).toBeNull();
    await mina.agent.post(`/api/recognitions/${card.id}/join`).expect(201);
    // Switched on, putting the old limit back would wait for next month like any other change.
    const waiting = (await hr.agent.put('/api/settings/recognition').send({ rules: DEFAULT_RECOGNITION_RULES }).expect(200)).body;
    expect(waiting).toMatchObject({ rules: strict, pending: { rules: DEFAULT_RECOGNITION_RULES } });
    await give(mina, omid, { amount: 5 }).expect(429);
    await setState('off');
    await hr.agent.put('/api/settings/recognition').send({ rules: DEFAULT_RECOGNITION_RULES }).expect(200);
    await setState('on');
    await deliverDueRecognitions(afterUndo());
  });

  it('pages the wall without missing or repeating a card, even when many were due at the same moment', async () => {
    const at = new Date(Date.now() - 60 * 60_000);
    const extra = Array.from({ length: RECOGNITION_PAGE + 8 }, (_, i) => ({
      id: `rec-page-${String(i).padStart(2, '0')}`,
      fromId: hr.id,
      toId: reza.id,
      amount: 5,
      month: '1404/01',
      valueId: 'teamwork',
      valueLabel: 'همکاری',
      valueTone: 'sage',
      message: MESSAGE,
      // Half of them share one moment exactly.
      deliverAt: i % 2 ? at : new Date(at.getTime() - i * 1000),
      deliveredAt: at,
      createdAt: at,
    }));
    await db.insert(recognitions).values(extra);
    const seen: string[] = [];
    let query = '';
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const page = await wall(omid, query);
      expect(page.items.length).toBeLessThanOrEqual(RECOGNITION_PAGE);
      seen.push(...page.items.map((c: { id: string }) => c.id));
      if (!page.next) break;
      query = `?before=${encodeURIComponent(page.next)}`;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((id) => id.startsWith('rec-page-')).sort()).toEqual(extra.map((e) => e.id));
    // Newest first.
    const times = seen.map((id) => extra.find((e) => e.id === id)?.deliverAt.getTime()).filter((t) => t !== undefined);
    expect(times).toEqual([...times].sort((a, b) => b! - a!));
    // The receiver's own list pages the same way.
    const first = await mine(reza);
    expect(first.received).toHaveLength(RECOGNITION_PAGE);
    const rest = (await reza.agent.get(`/api/recognitions/mine?receivedBefore=${encodeURIComponent(first.receivedNext)}`).expect(200)).body;
    const ids = [...first.received, ...rest.received].map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('rec-page-'))).toHaveLength(extra.length);
    await db.delete(recognitions).where(inArray(recognitions.id, extra.map((e) => e.id)));
  });

  it('keeps the past of a colleague who has left, but takes them off the wall and the list', async () => {
    const cardsOfSara = (await wall(reza)).items.filter((c: { to: { id: string } }) => c.to.id === sara.id);
    expect(cardsOfSara.length).toBeGreaterThan(0);
    const total = (await db.select().from(recognitions)).length;
    await admin.patch(`/api/employees/${sara.id}`).send({ isActive: false }).expect(200);
    expect((await give(reza, sara, { amount: 5 }).expect(400)).body.error).toContain('حساب فعال');
    await reza.agent.post(`/api/recognitions/${cardsOfSara[0].id}/join`).expect(400);
    expect((await wall(reza)).items.filter((c: { to: { id: string } }) => c.to.id === sara.id)).toEqual([]);
    expect((await reza.agent.get('/api/recognitions/colleagues').expect(200)).body.map((p: { id: string }) => p.id)).not.toContain(sara.id);
    expect(await db.select().from(recognitions)).toHaveLength(total);
    // Back again, their cards are on the wall as before.
    await admin.patch(`/api/employees/${sara.id}`).send({ isActive: true }).expect(200);
    expect((await wall(reza)).items.filter((c: { to: { id: string } }) => c.to.id === sara.id)).toHaveLength(cardsOfSara.length);
  });

  it('keeps everything while the part is switched off, and goes on from there when it is back', async () => {
    const before = await wallet(ali);
    const pending = (await give(omid, reza, { amount: 5 }).expect(201)).body.id;
    const toldBefore = (await recognitionNotifications(reza.id)).length;
    await setState('off');
    await ali.agent.get('/api/recognitions/wallet').expect(404);
    await ali.agent.get('/api/recognitions/mine').expect(404);
    // One that falls due meanwhile is handed over quietly; its receiver finds it when the part is back.
    expect(await deliverDueRecognitions(afterUndo())).toBe(1);
    expect(await recognitionNotifications(reza.id)).toHaveLength(toldBefore);
    const bell = (await reza.agent.get('/api/notifications').expect(200)).body;
    expect(bell.filter((n: { type: string }) => n.type === 'recognition')).toEqual([]);
    await setState('on');
    expect(await wallet(ali)).toMatchObject({ given: before.given, left: before.left, received: before.received });
    expect((await mine(reza)).received[0]).toMatchObject({ id: pending, sealed: true });
  });
});
