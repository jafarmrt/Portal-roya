import { and, eq, inArray } from 'drizzle-orm';
import moment from 'moment-jalaali';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { employees, notifications, recognitionReminders, recognitions } from '../server/db/schema';
import { processRecognitionReminders, recognitionReport } from '../server/recognition';
import { recognitionMonth } from '../shared/recognition';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// «سپاس», stage 6: the two monthly reminders and the owner's numbers of a month.

/** A moment in this Jalali month: its `day`th day at `hour` o'clock (server time, Asia/Tehran). */
const dayOfMonth = (day: number, hour = 11) => moment().startOf('jMonth').add(day - 1, 'day').hour(hour).minute(5).toDate();
const lastDays = (left: number, hour = 11) => moment().endOf('jMonth').startOf('day').subtract(left - 1, 'day').hour(hour).minute(5).toDate();

let seq = 0;
/** A recognition written straight into the table, as if it had been given and handed over. */
const given = (fromId: string, toId: string, amount: number, extra: Partial<typeof recognitions.$inferInsert> = {}) => {
  const at = dayOfMonth(3);
  return {
    id: `rem-${++seq}`,
    fromId,
    toId,
    amount,
    month: recognitionMonth(at),
    valueId: 'teamwork',
    valueLabel: 'همکاری',
    valueTone: 'sage',
    message: 'ممنون بابت همراهی‌ات در پروژهٔ انبار، کار بزرگی بود.',
    isPublic: true,
    deliverAt: at,
    deliveredAt: at,
    createdAt: at,
    ...extra,
  };
};

const reminders = (ids: string[]) =>
  db
    .select({ userId: notifications.userId, title: notifications.title, message: notifications.message })
    .from(notifications)
    .where(and(inArray(notifications.userId, ids), eq(notifications.type, 'recognition')));

describe('«سپاس»: the monthly reminders and the owner’s numbers', () => {
  let admin: Agent;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let mina: Person;
  let hr: Person;
  let everyone: string[];

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    const role = (await admin.post('/api/roles').send({ name: 'مسئول سپاس', description: '', permissions: ['recognition.manage'] }).expect(201)).body;
    ali = await createEmployee(admin, { username: 'rem.ali', department: 'فروش' });
    sara = await createEmployee(admin, { username: 'rem.sara', department: 'طراحی' });
    reza = await createEmployee(admin, { username: 'rem.reza', department: 'فروش' });
    mina = await createEmployee(admin, { username: 'rem.mina', department: 'تولید' });
    hr = await createEmployee(admin, { username: 'rem.hr', department: 'تولید', role: role.id });
    await db.update(employees).set({ createdAt: new Date('2020-01-01T08:00:00Z') });
    everyone = [ali.id, sara.id, reza.id, mina.id, hr.id];
  });
  afterAll(() => pool.end());

  it('sends nothing while «سپاس» is switched off, early in the month, or outside working hours', async () => {
    expect(await processRecognitionReminders(dayOfMonth(20))).toBe(0);
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
    expect(await processRecognitionReminders(dayOfMonth(9))).toBe(0);
    expect(await processRecognitionReminders(dayOfMonth(20, 7))).toBe(0);
    expect(await processRecognitionReminders(dayOfMonth(20, 21))).toBe(0);
    expect(await reminders(everyone)).toEqual([]);
  });

  it('reminds in the middle of the month only those with coins left who did not switch it off, once', async () => {
    // Sara gave her whole allowance; Reza most of it; Ali switched reminders off on his page.
    await db.insert(recognitions).values([given(sara.id, ali.id, 20), given(sara.id, reza.id, 20), given(sara.id, mina.id, 10), given(reza.id, mina.id, 20, { isPublic: false })]);
    expect((await ali.agent.get('/api/recognitions/wallet').expect(200)).body.reminders).toBe(true);
    expect((await ali.agent.put('/api/recognitions/reminders').send({ on: false }).expect(200)).body).toEqual({ reminders: false });
    expect((await ali.agent.get('/api/recognitions/wallet').expect(200)).body.reminders).toBe(false);

    const sent = await processRecognitionReminders(dayOfMonth(16));
    const got = await reminders(everyone);
    expect(got.map((n) => n.userId).sort()).toEqual([reza.id, mina.id, hr.id].sort());
    // …and the administrator, who has a full wallet too.
    expect(sent).toBe(4);
    // What each has left is in the title: Reza gave 20 of his 50.
    expect(got.find((n) => n.userId === reza.id)!.title).toBe('هنوز ۳۰ سکهٔ قدردانی دارید 🌟');
    expect(got.find((n) => n.userId === mina.id)!.title).toBe('هنوز ۵۰ سکهٔ قدردانی دارید 🌟');
    // Once: the next ticks of the same day, and the rest of the half, send nothing more.
    expect(await processRecognitionReminders(dayOfMonth(16))).toBe(0);
    expect(await processRecognitionReminders(dayOfMonth(22, 15))).toBe(0);
    expect(await reminders(everyone)).toHaveLength(3);
  });

  it('reminds again three days before the month ends, saying the coins will burn', async () => {
    const sent = await processRecognitionReminders(lastDays(3));
    expect(sent).toBe(4);
    const last = (await reminders([reza.id])).find((n) => n.title.includes('می‌سوزد'))!;
    expect(last.title).toBe('۳۰ سکهٔ این ماه شما آخر ماه می‌سوزد');
    expect(last.message).toContain('۳ روز تا پایان ماه مانده');
    expect(await processRecognitionReminders(lastDays(1))).toBe(0);
    const rows = await db.select().from(recognitionReminders);
    expect(rows.map((r) => r.kind).sort()).toEqual(['last', 'last', 'last', 'last', 'mid', 'mid', 'mid', 'mid']);
  });

  it('gives the owner counts by unit and value, never a person’s own numbers', async () => {
    const month = recognitionMonth(dayOfMonth(3));
    // A «من هم» on Sara's card to Ali, one taken back and one reversed: neither of the last two counts.
    await db.insert(recognitions).values([
      given(mina.id, ali.id, 2, { parentId: 'rem-1', message: '' }),
      given(mina.id, sara.id, 5, { withdrawnAt: new Date() }),
      given(hr.id, sara.id, 5, { reversedAt: new Date(), reportedAt: new Date() }),
    ]);
    const report = (await hr.agent.get('/api/recognitions/report').expect(200)).body;
    expect(report).toMatchObject({
      month,
      current: true,
      people: 6,
      givers: 3,
      receivers: 3,
      recognitions: 4,
      joins: 1,
      publicShare: 75,
      reported: 1,
      reversed: 1,
      coins: { allowance: 300, given: 72 },
    });
    // Sara's 50 and Reza's 20 out of the six allowances of 50, and Mina's «من هم».
    expect(report.coins.unspent).toBe(300 - 50 - 20 - 2);
    // Sales gave and received; Ali's department counts Ali as a receiver.
    expect(report.departments.find((d: { name: string }) => d.name === 'فروش')).toMatchObject({ people: 2, givers: 1, receivers: 2, recognitions: 1 });
    expect(report.departments.find((d: { name: string }) => d.name === 'طراحی')).toMatchObject({ people: 1, givers: 1, receivers: 0, recognitions: 3 });
    expect(report.values).toEqual([{ id: 'teamwork', label: 'همکاری', tone: 'sage', count: 4 }]);
    // Four from one unit to another: Sara (design) to Ali, Reza and Mina; Reza (sales) to Mina.
    expect(report.acrossUnits).toBe(4);
    // Nothing in it names anyone or says what one person gave or got.
    const text = JSON.stringify(report);
    for (const p of [ali, sara, reza, mina, hr]) expect(text).not.toContain(p.id);
    expect(text).not.toContain('rem.');
    // The months to choose from, newest first.
    expect(report.months[0]).toMatchObject({ month });

    // An earlier month, and one that has not come yet.
    const before = moment(dayOfMonth(3)).subtract(1, 'jMonth').format('jYYYY/jMM');
    expect((await hr.agent.get(`/api/recognitions/report?month=${encodeURIComponent(before)}`).expect(200)).body).toMatchObject({ recognitions: 0, current: false });
    const later = moment(dayOfMonth(3)).add(1, 'jMonth').format('jYYYY/jMM');
    await hr.agent.get(`/api/recognitions/report?month=${encodeURIComponent(later)}`).expect(400);
    await hr.agent.get('/api/recognitions/report?month=next').expect(400);
    // Only the owner, and for the owner also while «سپاس» is hidden from them.
    await ali.agent.get('/api/recognitions/report').expect(403);
    await admin.put('/api/settings/features/recognition').send({ state: 'preview', pilotRoles: [], pilotUserIds: [] }).expect(200);
    await hr.agent.get('/api/recognitions/report').expect(200);
    await ali.agent.get('/api/recognitions/report').expect(404);
    expect((await recognitionReport(month)).people).toBe(1);
  });
});
