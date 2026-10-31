import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { extraStepId, FIRST_WEEK_EXTRA_MAX, inFirstWeeks } from '../shared/firstWeek';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

describe('«هفتهٔ اول من»', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let newcomer: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    newcomer = await createEmployee(admin, { username: 'new.first' });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('the administrator adds steps of their own, within limits', async () => {
    const res = await admin.put('/api/settings').send({ firstWeekSteps: ['فرم‌های اداری را از منابع انسانی بگیرید'] }).expect(200);
    expect(res.body.firstWeekSteps).toEqual(['فرم‌های اداری را از منابع انسانی بگیرید']);
    await admin.put('/api/settings').send({ firstWeekSteps: Array.from({ length: FIRST_WEEK_EXTRA_MAX + 1 }, (_, i) => `مرحله ${i}`) }).expect(400);
    await admin.put('/api/settings').send({ firstWeekSteps: ['ب'.repeat(151)] }).expect(400);
    // Colleagues cannot.
    await newcomer.agent.put('/api/settings').send({ firstWeekSteps: [] }).expect(403);
  });

  it('a colleague ticks steps for themself only', async () => {
    const res = await newcomer.agent.put('/api/settings/first-week').send({ done: ['systems', 'systems', 'unit'] }).expect(200);
    expect(res.body.firstWeekDone).toEqual(['systems', 'unit']);
    expect((await newcomer.agent.get('/api/settings').expect(200)).body.firstWeekDone).toEqual(['systems', 'unit']);
    expect((await admin.get('/api/settings').expect(200)).body.firstWeekDone).toEqual([]);
  });

  it('is gone while the administrator switches it off', async () => {
    await admin.put('/api/settings/features/firstWeek').send({ state: 'off' }).expect(200);
    await newcomer.agent.put('/api/settings/first-week').send({ done: ['closed'] }).expect(404);
    expect((await newcomer.agent.get('/api/settings').expect(200)).body.firstWeekDone).toEqual([]);
    await admin.put('/api/settings/features/firstWeek').send({ state: 'on' }).expect(200);
    expect((await newcomer.agent.get('/api/settings').expect(200)).body.firstWeekDone).toEqual(['systems', 'unit']);
  });
});

describe('who sees it', () => {
  it('only in the 30 days after the introduction', () => {
    const now = new Date('2026-10-31T09:00:00Z');
    expect(inFirstWeeks('2026-10-25T09:00:00Z', now)).toBe(true);
    expect(inFirstWeeks('2026-10-02T09:00:00Z', now)).toBe(true);
    expect(inFirstWeeks('2026-09-30T09:00:00Z', now)).toBe(false);
    expect(inFirstWeeks(undefined, now)).toBe(false);
  });

  it('gives a reworded step a new id', () => {
    expect(extraStepId('فرم‌ها را بگیرید')).toBe(extraStepId(' فرم‌ها را بگیرید '));
    expect(extraStepId('فرم‌ها را بگیرید')).not.toBe(extraStepId('فرم‌ها را امضا کنید'));
  });
});
