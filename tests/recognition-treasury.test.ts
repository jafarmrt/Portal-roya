import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { employees, recognitions } from '../server/db/schema';
import { DEFAULT_RECOGNITION_VALUES, previousRecognitionMonth, recognitionMonth } from '../shared/recognition';
import { badgeTier, longestRun } from '../shared/recognitionTutorial';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// «سپاس», phase 2: «گنجینهٔ من» (2.4) and the badges (2.5).

const NOW = recognitionMonth(new Date());
const LAST = previousRecognitionMonth(NOW);
const AT = new Date(Date.now() - 2 * 60 * 60 * 1000);
let seq = 0;
const row = (fromId: string, toId: string, extra: Partial<typeof recognitions.$inferInsert> = {}) => ({
  id: `tr-${++seq}`,
  fromId,
  toId,
  amount: 2,
  month: NOW,
  valueId: 'teamwork',
  valueLabel: 'همکاری',
  valueTone: 'sage',
  message: `ممنون بابت همراهی در پروژهٔ انبار، شمارهٔ ${seq}.`,
  isPublic: false,
  deliverAt: AT,
  deliveredAt: AT,
  createdAt: AT,
  ...extra,
});

describe('«سپاس»: treasury and badges', () => {
  let admin: Agent;
  let ali: Person;
  const others: Person[] = [];

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    ali = await createEmployee(admin, { username: 'tr.ali', department: 'فروش' });
    for (const [i, department] of ['طراحی', 'تولید', 'تولید', 'فروش', 'طراحی'].entries()) {
      others.push(await createEmployee(admin, { username: `tr.p${i}`, department }));
    }
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  it('counts runs of months and tiers', () => {
    expect(longestRun(['1405/05', '1405/06', '1405/08', '1405/09', '1405/10', '1405/10'])).toBe(3);
    expect(longestRun(['1404/12', '1405/01'])).toBe(2);
    expect(longestRun([])).toBe(0);
    expect(badgeTier('bridge', 2)).toBe(0);
    expect(badgeTier('bridge', 5)).toBe(2);
    expect(badgeTier('eyes', 30)).toBe(3);
    expect(badgeTier('values', 4, 5)).toBe(0);
    expect(badgeTier('values', 5, 5)).toBe(3);
  });

  it('starts empty, with every badge still to earn', async () => {
    const t = (await ali.agent.get('/api/recognitions/treasury').expect(200)).body;
    expect(t.total).toEqual({ coins: 0, people: 0, units: 0 });
    expect(t.months).toHaveLength(12);
    expect(t.months[11]).toEqual({ month: NOW, received: 0, given: 0 });
    expect(t.recaps).toEqual([]);
    expect(t.badges.map((b: { key: string; tier: number }) => [b.key, b.tier])).toEqual([
      ['bridge', 0],
      ['steady', 0],
      ['eyes', 0],
      ['companion', 0],
      ['values', 0],
    ]);
    expect(t.onProfile).toBe(false);
  });

  it('adds up what was received and opened, month by month, beside what was given', async () => {
    const [p0, p1, p2] = others;
    await db.insert(recognitions).values([
      row(p0.id, ali.id, { amount: 5, openedAt: AT, month: LAST, valueId: 'learning', valueLabel: 'یادگیری', valueTone: 'sky' }),
      row(p1.id, ali.id, { amount: 3, openedAt: AT }),
      // Still sealed, taken back, reversed: not counted.
      row(p2.id, ali.id, { amount: 9 }),
      row(p2.id, ali.id, { amount: 9, openedAt: AT, withdrawnAt: AT }),
      row(p2.id, ali.id, { amount: 9, openedAt: AT, reversedAt: AT }),
      row(ali.id, p0.id, { amount: 4 }),
    ]);
    const t = (await ali.agent.get('/api/recognitions/treasury').expect(200)).body;
    expect(t.total).toEqual({ coins: 8, people: 2, units: 2 });
    expect(t.months[10]).toEqual({ month: LAST, received: 5, given: 0 });
    expect(t.months[11]).toEqual({ month: NOW, received: 3, given: 4 });
    expect(t.values).toEqual([
      { label: 'یادگیری', tone: 'sky', count: 1 },
      { label: 'همکاری', tone: 'sage', count: 1 },
    ]);
    expect(t.recaps).toEqual([LAST]);
  });

  it('gives badges for giving; new ones are said once; a tier earned stays when a value is added', async () => {
    // Five colleagues in three units, for all five values, and «من هم» five times.
    const values = DEFAULT_RECOGNITION_VALUES;
    await db.insert(recognitions).values(others.map((p, i) => row(ali.id, p.id, { valueId: values[i].id, valueLabel: values[i].label, valueTone: values[i].tone })));
    // «من هم» once on each of five wall cards.
    const cards = Array.from({ length: 5 }, () => row(others[0].id, others[1].id, { isPublic: true }));
    await db.insert(recognitions).values(cards);
    await db.insert(recognitions).values(cards.map((c) => row(ali.id, others[1].id, { parentId: c.id, message: '' })));

    const t = (await ali.agent.get('/api/recognitions/treasury').expect(200)).body;
    const tier = (key: string) => t.badges.find((b: { key: string }) => b.key === key);
    expect(tier('bridge')).toMatchObject({ tier: 1, count: 3, next: { tier: 2, at: 5 }, fresh: true });
    expect(tier('eyes')).toMatchObject({ tier: 1, count: 5, next: { tier: 2, at: 15 } });
    expect(tier('companion')).toMatchObject({ tier: 1, count: 5 });
    expect(tier('values')).toMatchObject({ tier: 3, count: 5, next: null });
    expect(tier('steady')).toMatchObject({ tier: 0, count: 1, next: { tier: 1, at: 3 } });

    // Seen: no longer «new».
    await ali.agent.put('/api/recognitions/tutorial').send({ badgesSeen: { bridge: 1, eyes: 1, companion: 1, values: 3 } }).expect(200);
    const again = (await ali.agent.get('/api/recognitions/treasury').expect(200)).body;
    expect(again.badges.filter((b: { fresh: boolean }) => b.fresh)).toEqual([]);

    // A sixth value: «ارزش‌ها» stays gold.
    await admin.put('/api/settings/recognition').send({ values: [...values, { id: 'quality', label: 'کیفیت', tone: 'plum', description: '' }] }).expect(200);
    const later = (await ali.agent.get('/api/recognitions/treasury').expect(200)).body;
    expect(later.badges.find((b: { key: string }) => b.key === 'values')).toMatchObject({ tier: 3 });
    // And nobody can award themselves a badge.
    await ali.agent.put('/api/recognitions/tutorial').send({ badges: { steady: 3 } }).expect(200);
    expect((await ali.agent.get('/api/recognitions/treasury').expect(200)).body.badges.find((b: { key: string }) => b.key === 'steady').tier).toBe(0);
  });

  it('shows badges in the profile only when the colleague chooses to', async () => {
    const viewer = others[3];
    expect((await viewer.agent.get(`/api/recognitions/badges/${ali.id}`).expect(200)).body).toEqual({ badges: [] });
    await ali.agent.put('/api/recognitions/tutorial').send({ badgesOnProfile: true }).expect(200);
    const shown = (await viewer.agent.get(`/api/recognitions/badges/${ali.id}`).expect(200)).body.badges;
    expect(shown.map((b: { key: string; tier: number }) => [b.key, b.tier])).toEqual([
      ['bridge', 1],
      ['eyes', 1],
      ['companion', 1],
      ['values', 3],
    ]);
    // Only badges: no coins, no counts.
    expect(JSON.stringify(shown)).not.toMatch(/count|coins|amount/);
    await ali.agent.put('/api/recognitions/tutorial').send({ badgesOnProfile: false }).expect(200);
    expect((await viewer.agent.get(`/api/recognitions/badges/${ali.id}`).expect(200)).body).toEqual({ badges: [] });
  });

  it('is out of reach while «سپاس» is off', async () => {
    await db.update(employees).set({ isActive: true }).where(eq(employees.id, ali.id));
    await admin.put('/api/settings/features/recognition').send({ state: 'off' }).expect(200);
    await ali.agent.get('/api/recognitions/treasury').expect(404);
  });
});
