import moment from 'moment-jalaali';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { moods } from '../server/db/schema';
import { clearMoodTeamCache } from '../server/routes/moods';
import { todayJalali } from '../shared/jalali';
import { goodShare, MOOD_MIN_ANSWERS, MOOD_REPLIES, MOOD_TEAM_DAYS, MOOD_VALUES, moodReply, teamLine, type Mood } from '../shared/mood';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

describe('«شروع روز»: what comes back after the daily mood', () => {
  let admin: Agent;
  let people: Person[];
  const today = todayJalali();

  const answer = (person: Person, mood: Mood) => person.agent.post('/api/moods').send({ mood }).expect(200);
  /** Answers written straight into the table, for days other than today. */
  const seed = async (date: string, list: Mood[]) => {
    await db.insert(moods).values(list.map((mood, i) => ({ userId: people[i].id, date, mood })));
    clearMoodTeamCache();
  };

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    people = [];
    for (let i = 1; i <= 6; i++) people.push(await createEmployee(admin, { username: `mood.${i}` }));
  });
  beforeEach(async () => {
    await db.delete(moods);
    clearMoodTeamCache();
    await admin.put('/api/settings/features/dayStart').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  it('works out the share of good answers, and nothing at all below the minimum', () => {
    expect(MOOD_MIN_ANSWERS).toBe(5);
    expect(goodShare({ عالی: 2, خوب: 2 })).toEqual({ answers: 4, good: null });
    expect(goodShare({ عالی: 2, خوب: 1, معمولی: 1, بد: 1 })).toEqual({ answers: 5, good: 60 });
    expect(goodShare({ بد: 3, 'خیلی بد': 3 })).toEqual({ answers: 6, good: 0 });
    expect(teamLine({ good: null })).toBe('هنوز پاسخ کافی نرسیده؛ بعداً سر بزنید.');
    expect(teamLine({ good: 62 })).toBe('امروز 62٪ همکاران حالشان خوب یا عالی است.');
    expect(teamLine({ good: 100 })).toContain('همهٔ همکارانی که پاسخ داده‌اند');
  });

  it('has at least ten different sentences for every mood and takes them in turn by the day', () => {
    for (const mood of MOOD_VALUES) {
      expect(MOOD_REPLIES[mood].length).toBeGreaterThanOrEqual(10);
      expect(new Set(MOOD_REPLIES[mood]).size).toBe(MOOD_REPLIES[mood].length);
      // The same sentence all day; another one tomorrow; none repeated within a working week.
      expect(moodReply(mood, today)).toBe(moodReply(mood, today));
      const week = Array.from({ length: 6 }, (_, i) => moodReply(mood, addJalaliDays('1405/09/01', i)));
      expect(new Set(week).size).toBe(6);
    }
  });

  it('shows no number to anyone until five colleagues have answered today', async () => {
    for (const [i, mood] of (['عالی', 'خوب', 'بد', 'معمولی'] as Mood[]).entries()) await answer(people[i], mood);
    const early = (await people[0].agent.get('/api/moods/team').expect(200)).body;
    expect(early).toMatchObject({ date: today, answers: null, good: null });
    expect(early.days).toHaveLength(MOOD_TEAM_DAYS);
    expect(early.days.every((d: { good: number | null }) => d.good === null)).toBe(true);
    // The managers' report leaves the day out as well.
    expect((await admin.get('/api/moods/summary').expect(200)).body).toEqual([]);

    await answer(people[4], 'خوب');
    const enough = (await people[0].agent.get('/api/moods/team').expect(200)).body;
    expect(enough).toMatchObject({ answers: 5, good: 60 });
    expect(enough.days.at(-1)).toEqual({ date: today, good: 60 });
    const summary = (await admin.get('/api/moods/summary').expect(200)).body;
    expect(summary.every((r: { date: string }) => r.date === today)).toBe(true);
    expect(summary.reduce((sum: number, r: { count: number }) => sum + r.count, 0)).toBe(5);
  });

  it('counts a changed answer once, and the colleague who just answered at once', async () => {
    for (const person of people.slice(0, 5)) await answer(person, 'بد');
    expect((await people[5].agent.get('/api/moods/team').expect(200)).body).toMatchObject({ answers: 5, good: 0 });
    // The sixth answers and sees themselves counted, although the summary was just worked out.
    await answer(people[5], 'عالی');
    expect((await people[5].agent.get('/api/moods/team').expect(200)).body).toMatchObject({ answers: 6, good: 17 });
    await answer(people[5], 'خیلی بد');
    expect((await people[5].agent.get('/api/moods/team').expect(200)).body).toMatchObject({ answers: 6, good: 0 });
    expect((await people[5].agent.get('/api/moods/me').expect(200)).body).toHaveLength(1);
  });

  it('gives the week day by day, with a gap for a day with too few answers', async () => {
    const yesterday = addJalaliDays(today, -1);
    const twoDaysAgo = addJalaliDays(today, -2);
    await seed(yesterday, ['عالی', 'عالی', 'خوب', 'خوب', 'بد', 'بد']);
    await seed(twoDaysAgo, ['عالی', 'بد']);
    // Older than the week: not part of it.
    await seed(addJalaliDays(today, -MOOD_TEAM_DAYS), ['عالی', 'عالی', 'عالی', 'عالی', 'عالی']);
    const team = (await people[0].agent.get('/api/moods/team').expect(200)).body;
    expect(team.days.map((d: { date: string }) => d.date)).toEqual(
      Array.from({ length: MOOD_TEAM_DAYS }, (_, i) => moment().subtract(MOOD_TEAM_DAYS - 1 - i, 'days').format('jYYYY/jMM/jDD')),
    );
    const byDate = Object.fromEntries(team.days.map((d: { date: string; good: number | null }) => [d.date, d.good]));
    expect(byDate[yesterday]).toBe(67);
    expect(byDate[twoDaysAgo]).toBeNull();
    expect(byDate[today]).toBeNull();
    // The managers' report: yesterday and the older full day, never the day with two answers.
    const dates = new Set((await admin.get('/api/moods/summary').expect(200)).body.map((r: { date: string }) => r.date));
    expect(dates.has(yesterday)).toBe(true);
    expect(dates.has(twoDaysAgo)).toBe(false);
  });

  it('never carries a name or one colleague’s answer in what comes back', async () => {
    for (const person of people.slice(0, 5)) await answer(person, 'خوب');
    const team = (await people[0].agent.get('/api/moods/team').expect(200)).body;
    expect(Object.keys(team).sort()).toEqual(['answers', 'date', 'days', 'good']);
    const text = JSON.stringify([team, (await admin.get('/api/moods/summary').expect(200)).body]);
    for (const person of people) expect(text).not.toContain(person.id);
    // One's own answers are one's own.
    const mine = (await people[0].agent.get('/api/moods/me').expect(200)).body;
    expect(mine.every((m: { userId: string }) => m.userId === people[0].id)).toBe(true);
  });

  it('keeps «حال‌وهوای ما» for signed-in colleagues who see «شروع روز»', async () => {
    await request(app).get('/api/moods/team').expect(401);
    await admin.put('/api/settings/features/dayStart').send({ state: 'preview' }).expect(200);
    await people[0].agent.get('/api/moods/team').expect(404);
    // The plain mood card still works for them.
    await answer(people[0], 'خوب');
    await admin.get('/api/moods/team').expect(200);
    await admin.put('/api/settings/features/dayStart').send({ state: 'off' }).expect(200);
    await admin.get('/api/moods/team').expect(404);
  });
});
