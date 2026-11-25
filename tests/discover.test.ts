import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { assignedTasks, employees, pushSubscriptions } from '../server/db/schema';
import { DAY_COUNT_KINDS } from '../shared/dayStep';
import {
  DISCOVER_INFO,
  DISCOVER_PARTS,
  DISCOVER_TOURS,
  discoverTakesToday,
  NO_DISCOVER_MEMORY,
  pickDiscover,
  readDiscoverMemory,
  weekOf,
  type DiscoverFacts,
  type DiscoverMemory,
  type DiscoverPart,
  type DiscoverStatus,
} from '../shared/discover';
import { todayJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

// «کشف پرتال» (stage 6 of claude/day-start-plan.md): «می‌دانستید؟» once a week in place of the day's
// step, and «پرتال من». Which parts a colleague has used is read from what really happened.

// 1405/09/07 is a Saturday.
const SATURDAY = '1405/09/07';
const MONDAY = addJalaliDays(SATURDAY, 2);
const allUnused: DiscoverStatus[] = DISCOVER_PARTS.map((part) => ({ part, used: false }));
const facts = (f: Partial<DiscoverFacts> = {}): DiscoverFacts => ({ mood: 'خوب', today: MONDAY, parts: allUnused, stepHolds: false, ...f });
const shown = (date: string, part: DiscoverPart, state: 'open' | 'done' | 'closed'): DiscoverMemory => ({
  known: [],
  last: { week: weekOf(date), date, part, state },
});

describe('«کشف پرتال»: when «می‌دانستید؟» comes', () => {
  it('counts weeks from Saturday', () => {
    for (let i = 0; i < 7; i++) expect(weekOf(addJalaliDays(SATURDAY, i))).toBe(SATURDAY);
    expect(weekOf(addJalaliDays(SATURDAY, 7))).toBe(addJalaliDays(SATURDAY, 7));
  });

  it('introduces the first part not used yet', () => {
    expect(pickDiscover(facts(), NO_DISCOVER_MEMORY)).toBe('tasks');
    const parts: DiscoverStatus[] = [
      { part: 'tasks', used: true },
      { part: 'guides', used: false },
    ];
    expect(pickDiscover(facts({ parts }), NO_DISCOVER_MEMORY)).toBe('guides');
    // Everything used, or nothing that can be used: nothing to introduce.
    expect(pickDiscover(facts({ parts: allUnused.map((p) => ({ ...p, used: true })) }), NO_DISCOVER_MEMORY)).toBeNull();
    expect(pickDiscover(facts({ parts: [] }), NO_DISCOVER_MEMORY)).toBeNull();
  });

  it('not on a hard day, and not where the day’s step must not give way', () => {
    expect(pickDiscover(facts({ mood: 'بد' }), NO_DISCOVER_MEMORY)).toBeNull();
    expect(pickDiscover(facts({ mood: 'خیلی بد' }), NO_DISCOVER_MEMORY)).toBeNull();
    expect(pickDiscover(facts({ mood: 'معمولی' }), NO_DISCOVER_MEMORY)).toBe('tasks');
    expect(pickDiscover(facts({ stepHolds: true }), NO_DISCOVER_MEMORY)).toBeNull();
  });

  it('once a week: the part shown in the morning stays the day’s, then nothing until next week', () => {
    // Shown this morning and still open: the same part all day, even if a circular arrives meanwhile.
    expect(pickDiscover(facts({ stepHolds: true }), shown(MONDAY, 'guides', 'open'))).toBe('guides');
    // Taken or closed today: nothing more today, and the day's step does not come either.
    expect(pickDiscover(facts(), shown(MONDAY, 'guides', 'done'))).toBeNull();
    expect(discoverTakesToday(shown(MONDAY, 'guides', 'closed'), MONDAY)).toBe(true);
    // Used since the morning (they opened it from elsewhere): it gives way.
    const usedNow = allUnused.map((p) => (p.part === 'guides' ? { ...p, used: true } : p));
    expect(pickDiscover(facts({ parts: usedNow }), shown(MONDAY, 'guides', 'open'))).toBeNull();
    // Later in the same week: nothing.
    expect(pickDiscover(facts({ today: addJalaliDays(MONDAY, 1) }), shown(MONDAY, 'guides', 'closed'))).toBeNull();
    expect(discoverTakesToday(shown(MONDAY, 'guides', 'closed'), addJalaliDays(MONDAY, 1))).toBe(false);
    // The next week: another part, not the one left aside last time.
    expect(pickDiscover(facts({ today: addJalaliDays(MONDAY, 7) }), shown(MONDAY, 'tasks', 'closed'))).toBe('guides');
  });

  it('never again a part the colleague said they know', () => {
    const memory: DiscoverMemory = { known: ['tasks', 'guides'], last: null };
    expect(pickDiscover(facts(), memory)).toBe('push');
  });

  it('reads back only what it wrote', () => {
    expect(readDiscoverMemory(null)).toEqual(NO_DISCOVER_MEMORY);
    expect(readDiscoverMemory('nonsense')).toEqual(NO_DISCOVER_MEMORY);
    expect(readDiscoverMemory({ known: ['tasks', 'bogus'], last: { week: SATURDAY, date: MONDAY, part: 'push', state: 'done' } })).toEqual({
      known: ['tasks'],
      last: { week: SATURDAY, date: MONDAY, part: 'push', state: 'done' },
    });
    expect(readDiscoverMemory({ known: [], last: { week: SATURDAY, date: MONDAY, part: 'bogus', state: 'done' } }).last).toBeNull();
  });

  it('has a name, a line and a three-step tour for every part, and is counted with the steps', () => {
    for (const part of DISCOVER_PARTS) {
      expect(DISCOVER_INFO[part].label).toBeTruthy();
      expect(DISCOVER_INFO[part].pitch).toBeTruthy();
      expect(DISCOVER_TOURS[part]).toHaveLength(3);
      for (const step of DISCOVER_TOURS[part]) expect(step.title && step.text).toBeTruthy();
      // The last step says something in the middle; the first points at the page itself.
      expect(DISCOVER_TOURS[part][0].target).toBeTruthy();
      expect(DISCOVER_TOURS[part][2].target).toBeUndefined();
    }
    expect(DAY_COUNT_KINDS).toContain('discover');
  });
});

describe('«کشف پرتال» over the API', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let mina: Awaited<ReturnType<typeof createEmployee>>;
  let omid: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    mina = await createEmployee(admin, { username: 'discover.mina', department: 'فروش' });
    omid = await createEmployee(admin, { username: 'discover.omid', department: 'فروش' });
  });
  beforeEach(async () => {
    await db.delete(assignedTasks);
    await db.delete(pushSubscriptions);
    await db.update(employees).set({ portalTried: [], dashboardOrder: [] });
    for (const key of ['dayStart', 'mood', 'tasks', 'guides', 'pushNotifications', 'dashboardLayout', 'departmentPages']) {
      await admin.put(`/api/settings/features/${key}`).send({ state: 'on' }).expect(200);
    }
  });
  afterAll(() => pool.end());

  const parts = async (who = mina) => (await who.agent.get('/api/moods/discover').expect(200)).body.parts as DiscoverStatus[];
  const used = async (who = mina) => (await parts(who)).filter((p) => p.used).map((p) => p.part);

  it('lists every part the colleague can use, none used at first', async () => {
    expect(await parts()).toEqual(DISCOVER_PARTS.map((part) => ({ part, used: false })));
  });

  it('reads «used» from what really happened', async () => {
    // Work handed over: only the one who handed it over has used it.
    await mina.agent.post('/api/tasks').send({ title: 'گزارش هفتگی', dueDate: addJalaliDays(todayJalali(), 3), assigneeIds: [omid.id] }).expect(201);
    expect(await used()).toEqual(['tasks']);
    expect(await used(omid)).toEqual([]);
    // A device that gets notifications.
    await db.insert(pushSubscriptions).values({ endpoint: 'https://fcm.googleapis.com/fcm/send/discover', userId: mina.id, p256dh: 'k', auth: 'a' });
    // Her own order of the dashboard.
    await mina.agent.put('/api/settings/dashboard-order').send({ order: ['calendar'] }).expect(200);
    expect(await used()).toEqual(['tasks', 'push', 'layout']);
  });

  it('notes the guides and the unit’s page as opened, once each', async () => {
    await mina.agent.post('/api/settings/portal-tried').send({ part: 'guides' }).expect(204);
    await mina.agent.post('/api/settings/portal-tried').send({ part: 'guides' }).expect(204);
    await mina.agent.post('/api/settings/portal-tried').send({ part: 'unit' }).expect(204);
    expect(await used()).toEqual(['guides', 'unit']);
    const [row] = await db.select({ tried: employees.portalTried }).from(employees).where(eq(employees.id, mina.id));
    expect(row.tried.sort()).toEqual(['guides', 'unit']);
    // Only those two: the others are read from their own data.
    await mina.agent.post('/api/settings/portal-tried').send({ part: 'tasks' }).expect(400);
    await mina.agent.post('/api/settings/portal-tried').send({ part: 'anything' }).expect(400);
    expect(await used(omid)).toEqual([]);
  });

  it('leaves out the parts hidden from the colleague', async () => {
    await admin.put('/api/settings/features/tasks').send({ state: 'preview' }).expect(200);
    await admin.put('/api/settings/features/pushNotifications').send({ state: 'off' }).expect(200);
    expect((await parts()).map((p) => p.part)).toEqual(['guides', 'layout', 'unit']);
    // A unit that is not in the organisation's list has no page to show.
    await db.update(employees).set({ department: 'واحد بی‌صفحه' }).where(eq(employees.id, omid.id));
    expect((await parts(omid)).map((p) => p.part)).not.toContain('unit');
    await db.update(employees).set({ department: 'فروش' }).where(eq(employees.id, omid.id));
  });

  it('belongs to «شروع روز»: nothing while it is hidden, but what was opened is still noted', async () => {
    await admin.put('/api/settings/features/dayStart').send({ state: 'off' }).expect(200);
    expect(await parts()).toEqual([]);
    await mina.agent.post('/api/settings/portal-tried').send({ part: 'guides' }).expect(204);
    await admin.put('/api/settings/features/dayStart').send({ state: 'on' }).expect(200);
    expect(await used()).toEqual(['guides']);
  });

  it('counts «می‌دانستید؟» without a name, like the steps', async () => {
    await mina.agent.post('/api/moods/steps').send({ kind: 'discover', outcome: 'shown' }).expect(204);
    await mina.agent.post('/api/moods/steps').send({ kind: 'overdue', outcome: 'shown' }).expect(400);
  });
});
