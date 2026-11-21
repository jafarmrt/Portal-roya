import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { departmentPages, employees, recognitions, settings } from '../server/db/schema';
import { monthlySummary } from '../server/reports';
import { previousRecognitionMonth, recognitionMonth } from '../shared/recognition';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// «سپاس», phase 2, 2.6: «انصاف» for the programme's owner, and the numbers in the monthly summary.

const LONG_AGO = new Date('2024-01-01T08:00:00Z');
const NOW = recognitionMonth(new Date());
const M1 = previousRecognitionMonth(NOW);
const M2 = previousRecognitionMonth(M1);
const M3 = previousRecognitionMonth(M2);
const RECENT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
const PRIVATE_TEXT = 'متن خصوصی که فقط دو نفر باید بخوانند، دربارهٔ پروژهٔ انبار.';
let seq = 0;
const row = (fromId: string, toId: string, extra: Partial<typeof recognitions.$inferInsert> = {}) => ({
  id: `fair-${++seq}`,
  fromId,
  toId,
  amount: 3,
  month: NOW,
  valueId: 'teamwork',
  valueLabel: 'همکاری',
  valueTone: 'sage',
  message: `ممنون بابت کمک در پروژه، شمارهٔ ${seq}.`,
  isPublic: false,
  deliverAt: RECENT,
  deliveredAt: RECENT,
  createdAt: RECENT,
  ...extra,
});

describe('«سپاس»: fairness for the owner', () => {
  let admin: Agent;
  let owner: Person;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let mina: Person;
  let omid: Person;
  let newcomer: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    const role = (await admin.post('/api/roles').send({ name: 'مسئول سپاس', description: '', permissions: ['recognition.manage'] }).expect(201)).body;
    owner = await createEmployee(admin, { username: 'fair.owner', department: 'فروش', role: role.id });
    ali = await createEmployee(admin, { username: 'fair.ali', department: 'فروش' });
    sara = await createEmployee(admin, { username: 'fair.sara', department: 'طراحی' });
    reza = await createEmployee(admin, { username: 'fair.reza', department: 'تولید' });
    mina = await createEmployee(admin, { username: 'fair.mina', department: 'تولید' });
    omid = await createEmployee(admin, { username: 'fair.omid', department: 'فروش' });
    await db.update(employees).set({ createdAt: LONG_AGO, recognitionSince: LONG_AGO });
    newcomer = await createEmployee(admin, { username: 'fair.new', department: 'طراحی' });
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
    // Ali is the head of «فروش».
    await db.insert(departmentPages).values({ department: 'فروش', headId: ali.id });
  });
  afterAll(() => pool.end());

  it('is the owner’s alone', async () => {
    await ali.agent.get('/api/recognitions/fairness').expect(403);
    await ali.agent.post('/api/recognitions/fairness/seen').send({ key: 'x' }).expect(403);
    await owner.agent.get('/api/recognitions/fairness').expect(200);
    // Not in what every page loads.
    expect((await ali.agent.get('/api/settings').expect(200)).body).not.toHaveProperty('recognitionFlagsSeen');
  });

  it('lists those unthanked for three months (not newcomers), unit to unit, and the share «up»', async () => {
    await db.insert(recognitions).values([
      row(omid.id, ali.id), // «فروش» to its own head: up.
      row(sara.id, reza.id),
      row(reza.id, sara.id),
      row(mina.id, sara.id, { withdrawnAt: RECENT }), // Taken back: nothing.
    ]);
    const f = (await owner.agent.get('/api/recognitions/fairness').expect(200)).body;
    const names = f.unrecognised.map((p: { name: string }) => p.name).join(' ');
    expect(names).toContain('fair.mina');
    expect(names).toContain('fair.omid');
    expect(names).not.toContain('fair.ali');
    expect(names).not.toContain('fair.sara');
    expect(names).not.toContain('fair.new');
    expect(f.recognitions).toBe(3);
    expect(f.upwardShare).toBe(33);
    expect(f.betweenUnits).toEqual(
      expect.arrayContaining([
        { from: 'فروش', to: 'فروش', recognitions: 1 },
        { from: 'طراحی', to: 'تولید', recognitions: 1 },
        { from: 'تولید', to: 'طراحی', recognitions: 1 },
      ]),
    );
    expect(newcomer.id).toBeTruthy();
  });

  it('flags two who gave each other most of their coins three months running, and the same text to three', async () => {
    const months = [M3, M2, M1];
    await db.insert(recognitions).values(
      months.flatMap((month) => [row(reza.id, mina.id, { month, amount: 10 }), row(mina.id, reza.id, { month, amount: 10 }), row(reza.id, ali.id, { month, amount: 2 })]),
    );
    // Two months only: no flag.
    await db.insert(recognitions).values([M2, M1].flatMap((month) => [row(sara.id, omid.id, { month, amount: 9 }), row(omid.id, sara.id, { month, amount: 9 })]));
    // The same words to three colleagues this month.
    await db.insert(recognitions).values([ali.id, sara.id, mina.id].map((to) => row(omid.id, to, { message: PRIVATE_TEXT })));

    const f = (await owner.agent.get('/api/recognitions/fairness').expect(200)).body;
    expect(f.flags.reciprocal).toHaveLength(1);
    expect(f.flags.reciprocal[0].people.map((p: { name: string }) => p.name).sort()).toEqual(['همکار fair.mina', 'همکار fair.reza']);
    expect(f.flags.repeated).toHaveLength(1);
    expect(f.flags.repeated[0]).toMatchObject({ people: 3, seen: false });
    expect(f.flags.repeated[0].person.name).toContain('fair.omid');
    // No private text and no one's coins.
    const all = JSON.stringify(f);
    expect(all).not.toContain('پروژهٔ انبار');
    expect(all).not.toMatch(/amount|coins/);

    // «دیدم»: still listed, as seen.
    const seen = (await owner.agent.post('/api/recognitions/fairness/seen').send({ key: f.flags.repeated[0].key }).expect(200)).body;
    expect(seen.flags.repeated[0].seen).toBe(true);
    expect((await db.select({ s: settings.recognitionFlagsSeen }).from(settings).where(eq(settings.id, 'global')))[0].s).toContain(f.flags.repeated[0].key);
  });

  it('puts two numbers of «سپاس» in the portal’s monthly summary', async () => {
    const summary = await monthlySummary(M1);
    expect(summary.recognition).toMatchObject({ recognitions: expect.any(Number), giversShare: expect.any(Number) });
    expect(summary.recognition!.recognitions).toBeGreaterThan(0);
    await admin.put('/api/settings/features/recognition').send({ state: 'off' }).expect(200);
    expect((await monthlySummary(M1)).recognition).toBeNull();
  });
});
