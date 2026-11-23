import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { dayAnswers, dayQuestionDays, dayQuestions, dayStepCounts, moods, news } from '../server/db/schema';
import { clearDayQuestionCache } from '../server/dayQuestions';
import { clearMoodReportCache } from '../server/moodReport';
import { todayJalali } from '../shared/jalali';
import { MOOD_MIN_ANSWERS, type Mood } from '../shared/mood';
import { buildMoodReport, heardDraft, MOOD_REPORT_RANGES, OTHER_UNITS, unitRows, weekStart, type MoodAnswerRow } from '../shared/moodReport';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// 1405/09/07 is a Saturday.
const SATURDAY = '1405/09/07';
const day = (i: number) => addJalaliDays(SATURDAY, i);

const row = (userId: string, date: string, mood: Mood, unit = 'فروش', reasons: string[] = []): MoodAnswerRow => ({ userId, date, mood, unit, reasons });
/** One answer from each of `moods.length` colleagues of a unit on a day. */
const dayOf = (date: string, list: Mood[], unit = 'فروش', prefix = 'u') => list.map((mood, i) => row(`${prefix}${i}`, date, mood, unit));
const build = (answers: MoodAnswerRow[], extra: Partial<Parameters<typeof buildMoodReport>[0]> = {}) =>
  buildMoodReport({ from: day(0), to: day(13), days: 30, answers, activeOn: () => 10, active: 10, steps: [], ...extra });

describe('the managers’ mood report: what is counted', () => {
  it('counts only days with five answers, in every number', () => {
    const report = build([
      ...dayOf(day(0), ['عالی', 'عالی', 'خوب', 'معمولی', 'بد']),
      // Four answers: this day is in no total, trend or unit.
      ...dayOf(day(1), ['خیلی بد', 'خیلی بد', 'خیلی بد', 'خیلی بد']),
      ...dayOf(day(2), ['خوب', 'خوب', 'خوب', 'خوب', 'خوب', 'خوب']),
      // Outside the range.
      ...dayOf(day(20), ['بد', 'بد', 'بد', 'بد', 'بد']),
    ]);
    expect(report.daily.map((d) => d.date)).toEqual([day(0), day(2)]);
    expect(report.daily[0]).toEqual({ date: day(0), answers: 5, average: 3.8, good: 60, participation: 50 });
    expect(report.daily[1]).toMatchObject({ answers: 6, average: 4, good: 100, participation: 60 });
    expect(report.totals).toEqual({ answers: 11, countedDays: 2, average: 3.9, good: 82, participation: 55, active: 10 });
    expect(report.weekly).toEqual([{ from: SATURDAY, answers: 11, average: 3.9, good: 82 }]);
  });

  it('puts each day in the week that starts on its Saturday', () => {
    expect(weekStart(day(0))).toBe(SATURDAY);
    expect(weekStart(day(6))).toBe(SATURDAY);
    expect(weekStart(day(7))).toBe(day(7));
    const report = build([...dayOf(day(3), ['خوب', 'خوب', 'خوب', 'خوب', 'خوب']), ...dayOf(day(9), ['بد', 'بد', 'بد', 'بد', 'بد'])]);
    expect(report.weekly).toEqual([
      { from: day(0), answers: 5, average: 4, good: 100 },
      { from: day(7), answers: 5, average: 2, good: 0 },
    ]);
  });

  it('names a unit only when five different colleagues of it answered', () => {
    const answers = [
      // Six colleagues of «فروش» on one day.
      ...dayOf(day(0), ['عالی', 'عالی', 'عالی', 'عالی', 'عالی', 'عالی'], 'فروش', 's'),
      // One colleague of «طراحی» answering on nine days: nine answers, but one person.
      ...Array.from({ length: 9 }, (_, i) => row('solo', day(i), 'خیلی بد', 'طراحی')),
      // The other days need five answers to be counted at all.
      ...Array.from({ length: 8 }, (_, i) => dayOf(day(i + 1), ['خوب', 'خوب', 'خوب', 'خوب', 'خوب'], 'تولید', 't')).flat(),
    ];
    const report = build(answers);
    expect(report.units.map((u) => u.name)).toEqual(['فروش', OTHER_UNITS]);
    // «طراحی» (one person) is not named and cannot be worked out: the unit next in size went into the rest with it.
    const rest = report.units.find((u) => u.name === OTHER_UNITS)!;
    expect(rest.people).toBe(6);
    expect(rest.answers).toBe(49);
    expect(JSON.stringify(report)).not.toContain('طراحی');
    expect(JSON.stringify(report)).not.toContain('solo');
  });

  it('gathers small units, takes the next unit in when they are still too few, and shows nothing when nothing can be named', () => {
    const group = (people: number, score = 5) => ({ people: new Set(Array.from({ length: people }, (_, i) => `${Math.random()}${i}`)), tally: { answers: people, score: people * score, good: score >= 4 ? people : 0 } });
    // Two small units together reach five: both stay hidden behind one row.
    expect(unitRows(new Map([['الف', group(8)], ['ب', group(2)], ['ج', group(3)]])).map((u) => [u.name, u.people])).toEqual([['الف', 8], [OTHER_UNITS, 5]]);
    // One small unit of two: the smallest named unit joins it.
    expect(unitRows(new Map([['الف', group(8)], ['ب', group(6)], ['ج', group(2)]])).map((u) => [u.name, u.people])).toEqual([['الف', 8], [OTHER_UNITS, 8]]);
    // Every unit large enough: no «سایر».
    expect(unitRows(new Map([['الف', group(8)], ['ب', group(5)]])).map((u) => u.name)).toEqual(['الف', 'ب']);
    // Only one unit would be left to name beside nothing: a table of one row that equals the total says nothing new, but it is harmless.
    expect(unitRows(new Map([['الف', group(8)]])).map((u) => u.name)).toEqual(['الف']);
    // Nothing can be named.
    expect(unitRows(new Map([['الف', group(4)], ['ب', group(3)]]))).toEqual([]);
    expect(unitRows(new Map([['الف', group(5)], ['ب', group(2)]]))).toEqual([]);
  });

  it('shows what affected good and hard days once five different colleagues gave a reason', () => {
    const answers = [
      row('a', day(0), 'عالی', 'فروش', ['goodNews', 'people']),
      row('b', day(0), 'خوب', 'فروش', ['people']),
      row('c', day(0), 'بد', 'فروش', ['load']),
      row('d', day(0), 'خیلی بد', 'فروش', ['load', 'meetings']),
      row('e', day(0), 'معمولی', 'فروش', []),
    ];
    // Four colleagues with reasons: not yet.
    expect(build(answers).reasons).toEqual([]);
    const report = build([...answers, row('f', day(0), 'معمولی', 'فروش', ['load'])]);
    expect(report.reasons.map((r) => [r.id, r.good, r.hard, r.total])).toEqual([
      ['load', 0, 2, 3],
      ['people', 2, 0, 2],
      ['meetings', 0, 1, 1],
      ['goodNews', 1, 0, 1],
      ['tools', 0, 0, 0],
      ['personal', 0, 0, 0],
    ]);
  });

  it('raises the flag when the average fell three days in a row, while that is recent', () => {
    const falling = [
      ...dayOf(day(0), ['عالی', 'عالی', 'عالی', 'عالی', 'عالی']),
      ...dayOf(day(1), ['عالی', 'عالی', 'عالی', 'عالی', 'خوب']),
      ...dayOf(day(2), ['خوب', 'خوب', 'خوب', 'خوب', 'خوب']),
      ...dayOf(day(3), ['خوب', 'خوب', 'خوب', 'معمولی', 'معمولی']),
    ];
    expect(build(falling, { to: day(4) }).falling?.map((d) => d.average)).toEqual([5, 4.8, 4, 3.6]);
    // Old news: the last counted day is more than a week back.
    expect(build(falling, { to: day(13) }).falling).toBeNull();
    // Two drops and a rise: no flag.
    expect(build([...falling.slice(0, 15), ...dayOf(day(3), ['عالی', 'عالی', 'عالی', 'عالی', 'عالی'])], { to: day(4) }).falling).toBeNull();
    // Three counted days only: not enough to say.
    expect(build(falling.slice(5), { to: day(4) }).falling).toBeNull();
  });

  it('says how many of the colleagues of four weeks ago still answer', () => {
    const to = day(40);
    const then = Array.from({ length: 6 }, (_, i) => row(`p${i}`, addJalaliDays(to, -30), 'خوب'));
    const now = [row('p0', addJalaliDays(to, -2), 'خوب'), row('p1', to, 'خوب'), row('p2', addJalaliDays(to, -6), 'خوب'), row('new', to, 'خوب')];
    expect(build([...then, ...now], { from: addJalaliDays(to, -29), to }).stillAnswering).toEqual({ then: 6, now: 3, share: 50 });
    // Fewer than five colleagues then: no number.
    expect(build([...then.slice(0, 4), ...now], { from: addJalaliDays(to, -29), to }).stillAnswering).toBeNull();
  });

  it('adds up the day’s steps by kind and leaves out a kind shown fewer than five times', () => {
    const steps = [
      { kind: 'plan', outcome: 'shown', count: 6 },
      { kind: 'plan', outcome: 'shown', count: 4 },
      { kind: 'plan', outcome: 'done', count: 7 },
      { kind: 'plan', outcome: 'closed', count: 2 },
      { kind: 'plan', outcome: 'muted', count: 1 },
      { kind: 'care', outcome: 'shown', count: 4 },
      { kind: 'care', outcome: 'done', count: 1 },
    ];
    expect(build([], { steps }).steps).toEqual([{ kind: 'plan', label: 'سه کار امروز', shown: 10, done: 7, closed: 2, muted: 1, taken: 70 }]);
  });

  it('drafts «شنیدیم» from the totals, with room for what was done', () => {
    const report = build([
      row('a', day(0), 'عالی', 'فروش', ['people']),
      row('b', day(0), 'خوب', 'فروش', ['people']),
      row('c', day(0), 'بد', 'فروش', ['load']),
      row('d', day(0), 'خیلی بد', 'فروش', ['load']),
      row('e', day(0), 'معمولی', 'فروش', ['tools']),
    ]);
    const draft = heardDraft(report, { text: 'چای یا قهوه؟', option: 'چای', share: 60 });
    expect(draft.title).toContain('شنیدیم');
    expect(draft.content).toContain('۵ بار');
    expect(draft.content).toContain('۴۰٪ پاسخ‌ها «خوب» یا «عالی» بود و میانگین حال ۳ از ۵');
    expect(draft.content).toContain('در روزهای سخت، بیشتر از همه «حجم کار» اثر داشت');
    expect(draft.content).toContain('در روزهای خوب، بیشتر از همه «همکاران» اثر داشت');
    expect(draft.content).toContain('به پرسش «چای یا قهوه؟» بیشتر گفتید «چای» (۶۰٪)');
    expect(draft.content).toContain('آنچه انجام دادیم');
    expect(draft.content).not.toMatch(/\b[a-e]\b/);
    expect(heardDraft(build([])).content).not.toContain('میانگین حال');
  });
});

describe('the managers’ mood report: over the API', () => {
  let admin: Agent;
  let people: Person[];
  const today = todayJalali();

  const seed = async (date: string, list: Mood[], reasons: string[][] = []) => {
    await db.insert(moods).values(list.map((mood, i) => ({ userId: people[i].id, date, mood, reasons: reasons[i] ?? [] })));
    clearMoodReportCache();
  };
  const report = async (days = 30, agent: Agent = admin) => (await agent.get(`/api/moods/report?days=${days}`).expect(200)).body;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    people = [];
    // Five in «فروش», two in «طراحی», one in «تولید».
    for (let i = 1; i <= 5; i++) people.push(await createEmployee(admin, { username: `rep.s${i}`, department: 'فروش' }));
    for (let i = 1; i <= 2; i++) people.push(await createEmployee(admin, { username: `rep.d${i}`, department: 'طراحی' }));
    people.push(await createEmployee(admin, { username: `rep.t1`, department: 'تولید' }));
  });
  beforeEach(async () => {
    await db.delete(moods);
    await db.delete(dayStepCounts);
    await db.delete(dayAnswers);
    await db.delete(dayQuestionDays);
    await db.delete(dayQuestions);
    await db.delete(news);
    clearMoodReportCache();
    clearDayQuestionCache();
  });
  afterAll(() => pool.end());

  it('is for those who may see reports, in one of the three ranges', async () => {
    await request(app).get('/api/moods/report').expect(401);
    await people[0].agent.get('/api/moods/report').expect(403);
    await admin.get('/api/moods/report?days=7').expect(400);
    expect(MOOD_REPORT_RANGES.map((r) => r.days)).toEqual([30, 90, 365]);
    for (const days of [30, 90, 365]) expect(await report(days)).toMatchObject({ days, to: today, totals: { answers: 0, countedDays: 0, average: null, participation: null } });
    // Nine active colleagues: the administrator and the eight above.
    expect((await report()).totals.active).toBe(9);
  });

  it('gives the trend, participation and units without a name, an id or a day of too few answers', async () => {
    const yesterday = addJalaliDays(today, -1);
    await seed(today, ['عالی', 'خوب', 'خوب', 'معمولی', 'بد', 'خیلی بد', 'خیلی بد', 'بد'], [['people'], ['people'], ['goodNews'], [], ['load'], ['load'], ['personal']]);
    await seed(yesterday, ['بد', 'بد', 'بد', 'بد']);
    const r = await report();
    expect(r.daily).toEqual([{ date: today, answers: 8, average: 2.8, good: 38, participation: 89 }]);
    expect(r.totals).toMatchObject({ answers: 8, countedDays: 1, average: 2.8, good: 38, participation: 89 });
    // «فروش» has five colleagues; «طراحی» (two) and «تولید» (one) are too few even together, so nothing is named.
    expect(r.units).toEqual([]);
    expect(r.reasons.find((x: { id: string }) => x.id === 'load')).toMatchObject({ good: 0, hard: 2, total: 2 });
    const text = JSON.stringify(r);
    for (const person of people) expect(text).not.toContain(person.id);
    expect(text).not.toContain(yesterday);
    expect(text).not.toContain('طراحی');
    expect(text).not.toContain('تولید');

    // A longer range reads the same answers; a new answer shows at once although the report is kept for a minute.
    expect((await report(90)).totals.answers).toBe(8);
    await db.delete(moods);
    clearMoodReportCache();
    for (const person of people.slice(0, 5)) await person.agent.post('/api/moods').send({ mood: 'عالی' }).expect(200);
    expect((await report()).totals).toMatchObject({ answers: 5, average: 5 });
    await people[5].agent.post('/api/moods').send({ mood: 'بد' }).expect(200);
    expect((await report()).totals).toMatchObject({ answers: 6, average: 4.5 });
  });

  it('counts the day’s steps of the range', async () => {
    await db.insert(dayStepCounts).values([
      { date: today, kind: 'plan', outcome: 'shown', count: 9 },
      { date: today, kind: 'plan', outcome: 'done', count: 3 },
      { date: addJalaliDays(today, -40), kind: 'plan', outcome: 'shown', count: 50 },
      { date: today, kind: 'poll', outcome: 'shown', count: 2 },
    ]);
    expect((await report()).steps).toEqual([{ kind: 'plan', label: 'سه کار امروز', shown: 9, done: 3, closed: 0, muted: 0, taken: 33 }]);
    expect((await report(90)).steps[0]).toMatchObject({ shown: 59, taken: 5 });
  });

  it('gives the questions of the range asked for', async () => {
    await db.insert(dayQuestions).values({ id: 'dq-old', text: 'پرسش قدیمی؟', options: ['بله', 'نه'], theme: 'load' });
    const old = addJalaliDays(today, -50);
    await db.insert(dayQuestionDays).values({ date: old, questionId: 'dq-old' });
    await db.insert(dayAnswers).values(people.slice(0, 5).map((p, i) => ({ userId: p.id, date: old, questionId: 'dq-old', option: i % 2 })));
    expect((await admin.get('/api/moods/questions/results').expect(200)).body).toEqual([]);
    expect((await admin.get('/api/moods/questions/results?days=90').expect(200)).body).toEqual([{ date: old, text: 'پرسش قدیمی؟', theme: 'load', options: ['بله', 'نه'], counts: [3, 2] }]);
    await admin.get('/api/moods/questions/results?days=1').expect(400);
  });

  it('makes a «شنیدیم» news draft for someone who may see reports and publish news', async () => {
    await admin.post('/api/moods/report/heard').send({ days: 30 }).expect(400);
    await seed(today, ['عالی', 'خوب', 'خوب', 'معمولی', 'بد']);
    const role = (await admin.post('/api/roles').send({ name: 'گزارش‌بین', description: '', permissions: ['reports.view'] }).expect(201)).body;
    const viewer = await createEmployee(admin, { username: 'rep.viewer', role: role.id });
    clearMoodReportCache();
    await viewer.agent.post('/api/moods/report/heard').send({ days: 30 }).expect(403);
    await people[0].agent.post('/api/moods/report/heard').send({ days: 30 }).expect(403);

    const { draftId } = (await admin.post('/api/moods/report/heard').send({ days: 30 }).expect(201)).body;
    const [draft] = await db.select().from(news);
    expect(draft).toMatchObject({ id: draftId, isDraft: true, title: 'شنیدیم: حال‌وهوای این روزهای ما' });
    expect(draft.content).toContain('۶۰٪ پاسخ‌ها «خوب» یا «عالی» بود');
    expect(draft.content).toContain('آنچه انجام دادیم');
    // Colleagues do not see it until it is published.
    const seen = (await people[0].agent.get('/api/news').expect(200)).body;
    expect(JSON.stringify(seen)).not.toContain('شنیدیم');
    expect(MOOD_MIN_ANSWERS).toBe(5);
  });
});
