import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { auditLog, employees, news } from '../server/db/schema';
import { FEATURES } from '../shared/features';
import { currentJalaliYear } from '../shared/jalali';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const question = { text: 'پیشنهاد شما چیست؟', type: 'text' };

describe('switching parts of the portal off until they are introduced', () => {
  let admin: Agent;
  let colleague: Person;
  let pilot: Person;
  let pollId: string;

  const setState = (key: string, state: string, announce?: object) =>
    admin.put(`/api/settings/features/${key}`).send({ state, announce }).expect(200);

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    colleague = await createEmployee(admin, { username: 'feat.colleague' });
    pilot = await createEmployee(admin, { username: 'feat.pilot' });
    pollId = (await admin.post('/api/polls').send({ title: 'نظرسنجی ناهار', questions: [question] }).expect(201)).body.id;
  });
  afterAll(() => pool.end());

  it('shows every existing part to everyone until an administrator changes it', async () => {
    const settings = (await colleague.agent.get('/api/settings').expect(200)).body;
    expect(Object.keys(settings.features).sort()).toEqual(FEATURES.map((f) => f.key).sort());
    expect(Object.values(settings.features).every((s) => s === 'on')).toBe(true);
    // The pilot group and the raw switches are for the settings page only.
    expect(settings).not.toHaveProperty('pilotUserIds');
    expect(settings).not.toHaveProperty('featureLaunches');
    await colleague.agent.get('/api/settings/features').expect(403);
    await colleague.agent.put('/api/settings/features/polls').send({ state: 'off' }).expect(403);
  });

  it('keeps a part in preview out of reach of everyone but the administrator and the pilot group', async () => {
    await setState('suggestions', 'preview');
    const colleagueSettings = (await colleague.agent.get('/api/settings').expect(200)).body;
    expect(colleagueSettings.features).not.toHaveProperty('suggestions');
    await colleague.agent.get('/api/suggestions/mine').expect(404);
    await colleague.agent
      .post('/api/suggestions')
      .send({ box: 'hr', kind: 'suggestion', subject: 'آزمایش', body: 'متن', anonymous: false })
      .expect(404);

    expect((await admin.get('/api/settings').expect(200)).body.features.suggestions).toBe('preview');
    await admin.get('/api/suggestions/mine').expect(200);
    await pilot.agent.get('/api/suggestions/mine').expect(404);

    // Named colleagues join the pilot group, and so do whole roles.
    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [pilot.id] }).expect(200);
    expect((await pilot.agent.get('/api/settings').expect(200)).body.features.suggestions).toBe('preview');
    await pilot.agent.get('/api/suggestions/mine').expect(200);
    await colleague.agent.get('/api/suggestions/mine').expect(404);

    await admin.put('/api/settings/pilot').send({ roles: ['employee'], userIds: [] }).expect(200);
    await colleague.agent.get('/api/suggestions/mine').expect(200);
    await admin.put('/api/settings/pilot').send({ roles: [], userIds: [] }).expect(200);
    await colleague.agent.get('/api/suggestions/mine').expect(404);

    const config = (await admin.get('/api/settings/features').expect(200)).body;
    expect(config.features.find((f: { key: string }) => f.key === 'suggestions').state).toBe('preview');
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.title, 'امکانات پرتال: صندوق انتقادات و پیشنهادات'));
    expect(entry.detail).toBe('روشن برای همه ← پیش‌نمایش');
  });

  it('empties the lists an open page loads and hides the part from guests and its notifications', async () => {
    expect((await colleague.agent.get('/api/notifications').expect(200)).body.some((n: { type: string }) => n.type === 'poll')).toBe(true);
    await setState('polls', 'off');

    // Even the administrator does not see a part that is switched off.
    for (const agent of [colleague.agent, admin]) {
      expect((await agent.get('/api/polls').expect(200)).body).toEqual([]);
      await agent.get(`/api/polls/${pollId}`).expect(404);
    }
    expect((await request(app).get('/api/polls').expect(200)).body).toEqual([]);
    await colleague.agent.post(`/api/polls/${pollId}/vote`).send({ answers: [] }).expect(404);
    expect((await colleague.agent.get('/api/notifications').expect(200)).body.some((n: { type: string }) => n.type === 'poll')).toBe(false);
    expect((await request(app).get('/api/settings').expect(200)).body.features).not.toHaveProperty('polls');

    // Switching it on again brings everything back.
    await setState('polls', 'on');
    expect((await colleague.agent.get('/api/polls').expect(200)).body.map((p: { id: string }) => p.id)).toEqual([pollId]);
    expect((await colleague.agent.get('/api/notifications').expect(200)).body.some((n: { type: string }) => n.type === 'poll')).toBe(true);
  });

  it('takes a course off the calendar while trainings are hidden', async () => {
    const date = `${currentJalaliYear() + 1}/02/10`;
    await admin
      .post('/api/trainings')
      .send({ title: 'اکسل پیشرفته', instructor: 'مهندس کریمی', date, time: '9 تا 12', location: 'سالن آموزش', capacity: 5, description: 'جدول محوری', category: 'نرم‌افزار' })
      .expect(201);
    const sessions = async () => (await colleague.agent.get('/api/calendar_events').expect(200)).body.filter((e: { trainingId: string | null }) => e.trainingId);
    expect(await sessions()).toHaveLength(1);
    await setState('training', 'off');
    expect(await sessions()).toHaveLength(0);
    expect((await colleague.agent.get('/api/trainings').expect(200)).body).toEqual([]);
    await setState('training', 'on');
    expect(await sessions()).toHaveLength(1);
  });

  it('introduces a part with «جدید», a dashboard card and a news draft, until each person opens it', async () => {
    const res = await setState('suggestions', 'on', { badge: true, card: true, draft: true });
    expect(res.body.draftId).toBeTruthy();
    const [draft] = await db.select().from(news).where(eq(news.id, res.body.draftId));
    expect(draft).toMatchObject({ isDraft: true, title: 'تازه در پرتال: صندوق انتقادات و پیشنهادات' });
    // Colleagues do not see the draft; it waits for whoever publishes news.
    expect((await colleague.agent.get('/api/news').expect(200)).body.items.map((n: { id: string }) => n.id)).not.toContain(draft.id);

    const before = (await colleague.agent.get('/api/settings').expect(200)).body;
    expect(before.featureNews).toEqual([{ key: 'suggestions', badge: true, card: true }]);
    // Guests are not told about it; they cannot open it anyway.
    expect((await request(app).get('/api/settings').expect(200)).body.featureNews).toEqual([]);

    const after = (await colleague.agent.post('/api/settings/features/suggestions/seen').expect(200)).body;
    expect(after.featureNews).toEqual([]);
    expect((await colleague.agent.get('/api/settings').expect(200)).body.featureNews).toEqual([]);
    const [row] = await db.select({ seen: employees.seenFeatures }).from(employees).where(eq(employees.id, colleague.id));
    expect(row.seen).toEqual(['suggestions']);
    // Others still see it as new.
    expect((await pilot.agent.get('/api/settings').expect(200)).body.featureNews).toHaveLength(1);
  });

  it('introduces nothing when switched on without announcing it, or from preview back to on twice', async () => {
    await setState('guides', 'off');
    await setState('guides', 'on', {});
    expect((await pilot.agent.get('/api/settings').expect(200)).body.featureNews.map((n: { key: string }) => n.key)).toEqual(['suggestions']);
    // Saving "on" again does not start a second introduction or a second draft.
    const drafts = async () => (await db.select().from(news).where(and(eq(news.isDraft, true)))).length;
    const count = await drafts();
    await setState('suggestions', 'on', { badge: true, card: true, draft: true });
    expect(await drafts()).toBe(count);
    await admin.put('/api/settings/features/unknown').send({ state: 'on' }).expect(404);
  });
});
