import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { recognitions } from '../server/db/schema';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// «سپاس», phase 2, 2.3: «کارنامهٔ سپاس», one colleague's own month.

const AT = new Date('2026-11-10T08:00:00Z'); // 19 Aban 1405
let seq = 0;
const row = (fromId: string, toId: string, extra: Partial<typeof recognitions.$inferInsert> = {}) => ({
  id: `recap-${++seq}`,
  fromId,
  toId,
  amount: 5,
  month: '1405/08',
  valueId: 'teamwork',
  valueLabel: 'همکاری',
  valueTone: 'sage',
  message: `ممنون بابت کمک دیروز در جلسه، شمارهٔ ${seq}.`,
  isPublic: true,
  deliverAt: AT,
  deliveredAt: AT,
  createdAt: AT,
  ...extra,
});

describe('«سپاس»: the monthly recap', () => {
  let admin: Agent;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let mina: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    ali = await createEmployee(admin, { username: 'recap.ali', department: 'فروش' });
    sara = await createEmployee(admin, { username: 'recap.sara', department: 'طراحی' });
    reza = await createEmployee(admin, { username: 'recap.reza', department: 'تولید' });
    mina = await createEmployee(admin, { username: 'recap.mina', department: 'تولید' });
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  it('is null for a month in which nothing happened', async () => {
    expect((await ali.agent.get('/api/recognitions/recap?month=1405/08').expect(200)).body).toEqual({ recap: null });
  });

  it('counts what was given and received and opened, leaving out what was taken back, reversed or is still sealed', async () => {
    await db.insert(recognitions).values([
      // Mehr: Ali thanked Sara's unit (طراحی) already.
      row(ali.id, sara.id, { month: '1405/07' }),
      // Aban, given: two colleagues in two units, one of them new to Ali; a «من هم» counts in the coins.
      row(ali.id, sara.id, { amount: 10, openedAt: AT }),
      row(ali.id, reza.id, { amount: 3 }),
      row(ali.id, reza.id, { amount: 2, parentId: 'recap-3', message: '' }),
      row(ali.id, mina.id, { amount: 20, withdrawnAt: AT }),
      row(ali.id, mina.id, { amount: 20, reversedAt: AT }),
      // Aban, received: two opened (two for «یادگیری»), one still sealed.
      row(sara.id, ali.id, { amount: 4, valueId: 'learning', valueLabel: 'یادگیری', valueTone: 'sky', openedAt: AT, message: 'آموزش اکسل تو کار گزارش‌گیری را نصف کرد.' }),
      row(reza.id, ali.id, { amount: 6, valueId: 'learning', valueLabel: 'یادگیری', valueTone: 'sky', openedAt: AT, deliveredAt: new Date(AT.getTime() + 60_000) }),
      row(mina.id, ali.id, { amount: 9, valueId: 'customer', valueLabel: 'مشتری‌مداری', valueTone: 'terracotta' }),
    ]);
    const { recap } = (await ali.agent.get('/api/recognitions/recap?month=1405/08').expect(200)).body;
    expect(recap).toMatchObject({
      month: '1405/08',
      gave: { recognitions: 2, people: 2, units: 2, newUnits: 1, coins: 15 },
      received: { recognitions: 2, coins: 10, topValue: { label: 'یادگیری', tone: 'sky' } },
    });
    // The latest opened one; never the sealed one.
    expect(recap.received.quote.from.name).toContain('recap.reza');
    expect(JSON.stringify(recap)).not.toContain('recap.mina');
  });

  it('is each colleague’s own', async () => {
    const { recap } = (await sara.agent.get('/api/recognitions/recap?month=1405/08').expect(200)).body;
    expect(recap.gave).toMatchObject({ people: 1, coins: 4 });
    expect(recap.received).toMatchObject({ recognitions: 1, coins: 10 });
    await sara.agent.get('/api/recognitions/recap?month=1405-08').expect(400);
  });

  it('remembers the month whose recap was seen', async () => {
    await ali.agent.put('/api/recognitions/tutorial').send({ recapSeen: '1405/08' }).expect(200);
    expect((await ali.agent.get('/api/recognitions/tutorial').expect(200)).body.progress.recapSeen).toBe('1405/08');
    await ali.agent.put('/api/recognitions/tutorial').send({ recapSeen: 'آبان' }).expect(400);
  });
});
