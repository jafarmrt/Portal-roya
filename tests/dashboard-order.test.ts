import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { DASHBOARD_LAYOUT, dashboardOrder } from '../shared/dashboard';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

describe('each colleague’s own order of the dashboard cards', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let colleague: Awaited<ReturnType<typeof createEmployee>>;
  const orderOf = async (agent = colleague.agent) => (await agent.get('/api/settings').expect(200)).body.dashboardOrder;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    colleague = await createEmployee(admin, { username: 'layout.colleague' });
  });
  afterAll(() => pool.end());

  it('cleans a saved order and puts cards it does not mention after it, in the default order', () => {
    expect(dashboardOrder([])).toEqual(DASHBOARD_LAYOUT.map((c) => c.id));
    const order = dashboardOrder(['mood', 'unknown', 'mood', 'news']);
    expect(order.slice(0, 2)).toEqual(['mood', 'news']);
    expect(order).toHaveLength(DASHBOARD_LAYOUT.length);
    expect(new Set(order).size).toBe(order.length);
  });

  it('is not offered until the administrator switches it on', async () => {
    await colleague.agent.put('/api/settings/dashboard-order').send({ order: ['mood'] }).expect(404);
    expect(await orderOf()).toEqual([]);
  });

  it('saves the order for the person only, and goes back to the default with an empty list', async () => {
    await admin.put('/api/settings/features/dashboardLayout').send({ state: 'on' }).expect(200);
    const saved = (await colleague.agent.put('/api/settings/dashboard-order').send({ order: ['calendar', 'bogus', 'myTasks'] }).expect(200)).body.dashboardOrder;
    expect(saved.slice(0, 2)).toEqual(['calendar', 'myTasks']);
    expect(saved).toHaveLength(DASHBOARD_LAYOUT.length);
    expect(await orderOf()).toEqual(saved);
    expect(await orderOf(admin)).toEqual([]);

    // Switched off again, everyone sees the default order; the saved one comes back with the switch.
    await admin.put('/api/settings/features/dashboardLayout').send({ state: 'off' }).expect(200);
    expect(await orderOf()).toEqual([]);
    await admin.put('/api/settings/features/dashboardLayout').send({ state: 'on' }).expect(200);
    expect(await orderOf()).toEqual(saved);

    await colleague.agent.put('/api/settings/dashboard-order').send({ order: [] }).expect(200);
    expect(await orderOf()).toEqual([]);
  });
});
