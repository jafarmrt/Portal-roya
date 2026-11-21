import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { employees, settings } from '../server/db/schema';
import { markRecognitionStarts, walletOf } from '../server/recognition';
import { DEFAULT_RECOGNITION_RULES, monthAllowance, recognitionMonth, recognitionStart } from '../shared/recognition';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// Work after stage 6b, decided 18 Nov:
// 1. A colleague for whom «سپاس» begins mid-month (put in the pilot group, or «سپاس» switched on) gets a
//    newcomer's share of that month: the days left, in whole coins, at least one.
// 2. «پیش‌نمایش» counts as off for the rules: a change applies at once; only «روشن» makes it wait.

const LONG_AGO = new Date('2020-01-01T08:00:00Z');
// 15 Azar 1405 (6 Dec 2026), 11:30 in Tehran: 16 of Azar's 30 days are left, today counted.
const MID_AZAR = new Date('2026-12-06T08:00:00Z');
// 1 Dey 1405.
const NEXT_MONTH = new Date('2026-12-22T08:00:00Z');

const sinceOf = async (id: string) => (await db.select({ since: employees.recognitionSince }).from(employees).where(eq(employees.id, id)))[0]?.since ?? null;
const viewer = (p: Person) => ({ id: p.id, createdAt: LONG_AGO });

describe('«سپاس»: when it begins for a colleague, and rules in preview', () => {
  let admin: Agent;
  let ali: Person;
  let sara: Person;
  let reza: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    ali = await createEmployee(admin, { username: 'start.ali' });
    sara = await createEmployee(admin, { username: 'start.sara' });
    reza = await createEmployee(admin, { username: 'start.reza' });
    // Everyone has been here for years.
    await db.update(employees).set({ createdAt: LONG_AGO });
  });
  afterAll(() => pool.end());

  it('takes the later of joining the portal and first seeing «سپاس»', () => {
    expect(recognitionStart(LONG_AGO, null)).toEqual(LONG_AGO);
    expect(recognitionStart(LONG_AGO, MID_AZAR)).toEqual(MID_AZAR);
    expect(recognitionStart(MID_AZAR, LONG_AGO)).toEqual(MID_AZAR);
    expect(recognitionMonth(MID_AZAR)).toBe('1405/09');
    expect(monthAllowance(50, '1405/09', MID_AZAR)).toBe(27);
  });

  it('notes nothing while «سپاس» is off', async () => {
    expect(await markRecognitionStarts(MID_AZAR)).toBe(0);
    expect(await sinceOf(ali.id)).toBeNull();
  });

  it('a colleague put in the pilot group mid-month gets the share of the days left; the next month all of it', async () => {
    await db.update(settings).set({ features: { recognition: 'preview' }, pilotUserIds: [ali.id] }).where(eq(settings.id, 'global'));
    // The administrator sees a preview too.
    expect(await markRecognitionStarts(MID_AZAR)).toBe(2);
    expect(await sinceOf(ali.id)).toEqual(MID_AZAR);
    expect(await sinceOf(sara.id)).toBeNull();
    expect((await walletOf(viewer(ali), MID_AZAR)).allowance).toBe(27);
    expect((await walletOf(viewer(ali), NEXT_MONTH)).allowance).toBe(50);

    // Sara joins the group four days later: her own share, Ali's stays as it was.
    const later = new Date('2026-12-10T08:00:00Z');
    await db.update(settings).set({ pilotUserIds: [ali.id, sara.id] }).where(eq(settings.id, 'global'));
    expect(await markRecognitionStarts(later)).toBe(1);
    expect(await sinceOf(sara.id)).toEqual(later);
    expect(await sinceOf(ali.id)).toEqual(MID_AZAR);
    expect((await walletOf(viewer(sara), later)).allowance).toBe(monthAllowance(50, '1405/09', later));
    expect((await walletOf(viewer(sara), later)).allowance).toBeLessThan(27);
  });

  it('switched on for everyone mid-month: those who had not seen it get the share; switched off and on again, nothing moves', async () => {
    await db.update(settings).set({ features: { recognition: 'on' } }).where(eq(settings.id, 'global'));
    const onDay = new Date('2026-12-16T08:00:00Z');
    expect(await markRecognitionStarts(onDay)).toBe(1);
    expect(await sinceOf(reza.id)).toEqual(onDay);
    expect((await walletOf(viewer(reza), onDay)).allowance).toBe(monthAllowance(50, '1405/09', onDay));

    await db.update(settings).set({ features: { recognition: 'off' } }).where(eq(settings.id, 'global'));
    await db.update(settings).set({ features: { recognition: 'on' } }).where(eq(settings.id, 'global'));
    expect(await markRecognitionStarts(NEXT_MONTH)).toBe(0);
    expect(await sinceOf(ali.id)).toEqual(MID_AZAR);
  });

  it('notes it at once when the switch or the pilot group changes, and for a wallet asked before the tick', async () => {
    await admin.put('/api/settings/features/recognition').send({ state: 'off' }).expect(200);
    const mina = await createEmployee(admin, { username: 'start.mina' });
    const omid = await createEmployee(admin, { username: 'start.omid' });
    expect(await sinceOf(mina.id)).toBeNull();
    // Into the pilot group, while in preview: noted by the call itself.
    await admin.put('/api/settings/features/recognition').send({ state: 'preview' }).expect(200);
    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [mina.id] }).expect(200);
    expect(await sinceOf(mina.id)).not.toBeNull();
    expect(await sinceOf(omid.id)).toBeNull();
    // Switched on for everyone: noted by that call.
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
    expect(await sinceOf(omid.id)).not.toBeNull();

    // A wallet asked for by someone not yet noted notes them.
    await db.update(employees).set({ recognitionSince: null }).where(eq(employees.id, omid.id));
    await omid.agent.get('/api/recognitions/wallet').expect(200);
    expect(await sinceOf(omid.id)).not.toBeNull();
  });

  it('in preview a change of the rules applies at once; only «روشن» makes it wait for next month', async () => {
    const smaller = { ...DEFAULT_RECOGNITION_RULES, allowance: 40 };
    await admin.put('/api/settings/features/recognition').send({ state: 'preview' }).expect(200);
    expect((await admin.get('/api/settings/recognition').expect(200)).body).toMatchObject({ rulesApplyAtOnce: true });
    const inPreview = (await admin.put('/api/settings/recognition').send({ rules: smaller }).expect(200)).body;
    expect(inPreview).toMatchObject({ rules: smaller, pending: null, rulesApplyAtOnce: true });

    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
    const whenOn = (await admin.put('/api/settings/recognition').send({ rules: DEFAULT_RECOGNITION_RULES }).expect(200)).body;
    expect(whenOn).toMatchObject({ rules: smaller, pending: { rules: DEFAULT_RECOGNITION_RULES }, rulesApplyAtOnce: false });
    // Back in preview: the waiting change can be made at once by saving it again.
    await admin.put('/api/settings/features/recognition').send({ state: 'preview' }).expect(200);
    const again = (await admin.put('/api/settings/recognition').send({ rules: DEFAULT_RECOGNITION_RULES }).expect(200)).body;
    expect(again).toMatchObject({ rules: DEFAULT_RECOGNITION_RULES, pending: null });
  });
});
