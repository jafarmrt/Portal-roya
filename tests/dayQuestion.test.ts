import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { dayAnswers, dayQuestionDays, dayQuestions, moods } from '../server/db/schema';
import { addSampleQuestions, clearDayQuestionCache, ensureSampleQuestions } from '../server/dayQuestions';
import {
  DAY_QUESTION_REST_DAYS,
  DAY_QUESTION_THEME_IDS,
  DAY_QUESTIONS_LOW,
  pickQuestion,
  questionProblem,
  questionResults,
  restedCount,
  SAMPLE_DAY_QUESTIONS,
  themeOfDay,
  WEEKDAY_THEMES,
  weekdayOf,
  type DayQuestion,
} from '../shared/dayQuestion';
import { DAY_STEPS, dayStepOrder } from '../shared/dayStep';
import { todayJalali } from '../shared/jalali';
import { MOOD_MIN_ANSWERS, MOOD_REASONS, reasonsFor } from '../shared/mood';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const q = (id: string, theme: DayQuestion['theme'], extra: Partial<DayQuestion> = {}): DayQuestion => ({ id, text: id, options: ['الف', 'ب'], theme, active: true, pinnedDate: '', ...extra });

// 1405/09/07 is a Saturday.
const SATURDAY = '1405/09/07';
/** The first day from that Saturday on whose subject is `theme` (a week may give one day's turn to «سبک»). */
const dayOf = (theme: DayQuestion['theme']) => Array.from({ length: 14 }, (_, i) => addJalaliDays(SATURDAY, i)).find((d) => themeOfDay(d) === theme)!;

describe('«پرسش روز»: which question a day gets', () => {
  it('gives Saturday to Wednesday their own subject, and one of them to «سبک» each week', () => {
    expect(weekdayOf(SATURDAY)).toBe(0);
    const lightDays: number[] = [];
    for (let week = 0; week < 5; week++) {
      const days = Array.from({ length: 7 }, (_, i) => themeOfDay(addJalaliDays(SATURDAY, week * 7 + i)));
      // Thursday and Friday are always light.
      expect(days.slice(5)).toEqual(['light', 'light']);
      const light = days.slice(0, 5).flatMap((theme, i) => (theme === 'light' ? [i] : []));
      expect(light).toHaveLength(1);
      lightDays.push(light[0]);
      days.slice(0, 5).forEach((theme, i) => i !== light[0] && expect(theme).toBe(WEEKDAY_THEMES[i]));
    }
    // A different working day gives its turn each week: in five weeks, each of them once.
    expect([...lightDays].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('takes the question of the day’s subject that has waited longest, never-asked first', () => {
    const date = dayOf('load');
    const bank = [q('a', 'load'), q('b', 'load'), q('c', 'load'), q('x', 'start')];
    expect(pickQuestion(date, bank, new Map())?.id).toBe('a');
    expect(pickQuestion(date, bank, new Map([['a', addJalaliDays(date, -40)]]))?.id).toBe('b');
    expect(pickQuestion(date, bank, new Map([['a', addJalaliDays(date, -40)], ['b', addJalaliDays(date, -90)], ['c', addJalaliDays(date, -60)]]))?.id).toBe('b');
  });

  it('never asks a question again sooner than thirty days, and then turns to the other subjects', () => {
    const date = dayOf('load');
    const bank = [q('a', 'load'), q('x', 'start'), q('y', 'wrap')];
    const recently = new Map([['a', addJalaliDays(date, -(DAY_QUESTION_REST_DAYS - 1))], ['x', addJalaliDays(date, -50)]]);
    // «a» is of today's subject but has not rested; «y» was never asked.
    expect(pickQuestion(date, bank, recently)?.id).toBe('y');
    expect(pickQuestion(date, bank, new Map([['a', addJalaliDays(date, -DAY_QUESTION_REST_DAYS)]]))?.id).toBe('a');
    // Nothing rested: no question that day.
    const all = new Map(bank.map((b) => [b.id, addJalaliDays(date, -3)]));
    expect(pickQuestion(date, bank, all)).toBeNull();
    expect(restedCount(bank, all, date)).toBe(0);
  });

  it('asks a question picked for a day on that day, whatever its subject, and keeps it until then', () => {
    const date = addJalaliDays(SATURDAY, 2);
    const bank = [q('a', themeOfDay(date)), q('yalda', 'occasion', { pinnedDate: date }), q('later', 'load', { pinnedDate: addJalaliDays(date, 9) }), q('free', 'occasion')];
    expect(pickQuestion(date, bank, new Map())?.id).toBe('yalda');
    // Asked 5 days ago or not: the day it was picked for wins.
    expect(pickQuestion(date, bank, new Map([['yalda', addJalaliDays(date, -5)]]))?.id).toBe('yalda');
    // The day before: neither the occasion question nor one kept for a later day takes a turn.
    const before = addJalaliDays(date, -1);
    expect(['yalda', 'later', 'free']).not.toContain(pickQuestion(before, bank, new Map())?.id);
    expect(pickQuestion(before, [bank[1], bank[2], bank[3]], new Map())).toBeNull();
    // Once its day has passed, a question that is not «مناسبتی» joins the turns again.
    expect(pickQuestion(addJalaliDays(date, 40), [bank[2]], new Map([['later', addJalaliDays(date, 9)]]))?.id).toBe('later');
    // A switched-off question is never asked, even on its day.
    expect(pickQuestion(date, [q('off', 'load', { active: false, pinnedDate: date })], new Map())).toBeNull();
  });

  it('with the sample bank asks something every day for months and repeats nothing within thirty days', () => {
    const bank = SAMPLE_DAY_QUESTIONS.map((sample) => q(sample.key, sample.theme));
    const last = new Map<string, string>();
    const seen: string[] = [];
    for (let i = 0; i < 150; i++) {
      const date = addJalaliDays(SATURDAY, i);
      const picked = pickQuestion(date, bank, last);
      expect(picked, date).not.toBeNull();
      const before = last.get(picked!.id);
      if (before) expect(i - seen.lastIndexOf(picked!.id)).toBeGreaterThanOrEqual(DAY_QUESTION_REST_DAYS);
      expect(picked!.theme).not.toBe('occasion');
      last.set(picked!.id, date);
      seen.push(picked!.id);
    }
    // In the first two weeks, while every subject still has fresh questions, each day gets its own subject.
    for (let i = 0; i < 14; i++) expect(bank.find((b) => b.id === seen[i])!.theme).toBe(themeOfDay(addJalaliDays(SATURDAY, i)));
  });

  it('starts with forty sample questions that are all well-formed', () => {
    expect(SAMPLE_DAY_QUESTIONS).toHaveLength(40);
    expect(new Set(SAMPLE_DAY_QUESTIONS.map((s) => s.key)).size).toBe(40);
    expect(new Set(SAMPLE_DAY_QUESTIONS.map((s) => s.text)).size).toBe(40);
    for (const sample of SAMPLE_DAY_QUESTIONS) {
      expect(DAY_QUESTION_THEME_IDS).toContain(sample.theme);
      // An occasion question only lacks its day.
      expect(questionProblem({ ...sample, pinnedDate: sample.theme === 'occasion' ? SATURDAY : '' }), sample.text).toBeNull();
    }
    for (const theme of WEEKDAY_THEMES) expect(SAMPLE_DAY_QUESTIONS.filter((s) => s.theme === theme).length).toBeGreaterThanOrEqual(5);
    expect(SAMPLE_DAY_QUESTIONS.filter((s) => s.theme === 'light').length).toBeGreaterThanOrEqual(5);
  });

  it('shows shares that add up to a hundred, and nothing below the minimum', () => {
    expect(questionResults([2, 2])).toBeNull();
    expect(questionResults([1, 1, 1, 1, 1, 1])).toEqual({ answers: 6, shares: [17, 17, 17, 17, 16, 16] });
    expect(questionResults([3, 2, 0])).toEqual({ answers: 5, shares: [60, 40, 0] });
    expect(questionResults([1, 2, 4])!.shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('says what is wrong with a question', () => {
    const base = { text: 'چطورید؟', options: ['خوب', 'بد'], theme: 'load' as const, pinnedDate: '' };
    expect(questionProblem(base)).toBeNull();
    expect(questionProblem({ ...base, text: ' ' })).toContain('متن پرسش');
    expect(questionProblem({ ...base, options: ['خوب'] })).toContain('دو گزینه');
    expect(questionProblem({ ...base, options: ['خوب', ' خوب '] })).toContain('یکی باشند');
    expect(questionProblem({ ...base, options: ['۱', '۲', '۳', '۴', '۵', '۶'] })).toContain('پنج گزینه');
    expect(questionProblem({ ...base, theme: 'occasion' })).toContain('روز آن را انتخاب کنید');
  });

  it('cleans a saved order of the steps and completes it with the built-in one', () => {
    expect(dayStepOrder()).toEqual([...DAY_STEPS]);
    expect(dayStepOrder(['poll', 'nonsense', 'plan', 'poll'])).toEqual(['poll', 'plan', ...DAY_STEPS.filter((k) => k !== 'poll' && k !== 'plan')]);
  });

  it('does not offer «یک خبر خوب» as a reason on a hard day', () => {
    expect(reasonsFor('عالی')).toHaveLength(MOOD_REASONS.length);
    expect(reasonsFor('معمولی').map((r) => r.id)).toContain('goodNews');
    expect(reasonsFor('بد').map((r) => r.id)).not.toContain('goodNews');
    expect(reasonsFor('خیلی بد')).toHaveLength(MOOD_REASONS.length - 1);
  });
});

describe('«پرسش روز»: the day’s question, its answers and the bank', () => {
  let admin: Agent;
  let people: Person[];
  let owner: Person;
  const today = todayJalali();

  const bank = async (agent: Agent = admin) => (await agent.get('/api/moods/questions').expect(200)).body as {
    questions: (DayQuestion & { lastAsked: string | null; timesAsked: number })[];
    rested: number;
    todayId: string | null;
    samplesMissing: number;
  };
  const add = (data: Partial<DayQuestion>, agent: Agent = admin) =>
    agent.post('/api/moods/questions').send({ text: 'پرسش آزمایشی؟', options: ['بله', 'نه'], theme: themeOfDay(today), ...data });
  const todayQuestion = async (person: Person) => (await person.agent.get('/api/moods/question').expect(200)).body;
  const choose = (person: Person, option: number) => person.agent.post('/api/moods/question').send({ option });

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    people = [];
    for (let i = 1; i <= 6; i++) people.push(await createEmployee(admin, { username: `ask.${i}` }));
    const role = (await admin.post('/api/roles').send({ name: 'مسئول شروع روز', description: '', permissions: ['mood.manage'] }).expect(201)).body;
    owner = await createEmployee(admin, { username: 'ask.owner', role: role.id });
  });
  beforeEach(async () => {
    await db.delete(dayAnswers);
    await db.delete(dayQuestionDays);
    await db.delete(dayQuestions);
    await db.delete(moods);
    clearDayQuestionCache();
    await admin.put('/api/settings/features/dayStart').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  it('a portal that never had a question starts with the samples; they are added once', async () => {
    expect(await ensureSampleQuestions()).toBe(40);
    expect(await ensureSampleQuestions()).toBe(0);
    const first = await bank();
    expect(first.questions).toHaveLength(40);
    expect(first.samplesMissing).toBe(0);
    // Two of them are «مناسبتی» and wait for a day; the rest are ready.
    expect(first.rested).toBe(38);
    // A sample that was deleted comes back with «افزودن پرسش‌های نمونه», the others are not doubled.
    await admin.delete(`/api/moods/questions/${first.questions[0].id}`).expect(200);
    expect((await bank()).samplesMissing).toBe(1);
    expect((await admin.post('/api/moods/questions/samples').expect(200)).body).toMatchObject({ added: 1, samplesMissing: 0 });
    expect((await bank()).questions).toHaveLength(40);
    // A bank that was pruned down to its owner's own questions is not filled up again at the next start.
    for (const question of (await bank()).questions) await admin.delete(`/api/moods/questions/${question.id}`).expect(200);
    await add({ text: 'تنها پرسش ما؟' }).expect(201);
    expect(await ensureSampleQuestions()).toBe(0);
    expect((await bank()).questions.map((x) => x.text)).toEqual(['تنها پرسش ما؟']);
  });

  it('gives everyone the same question for the whole day, even after the bank changes', async () => {
    await addSampleQuestions();
    const first = await todayQuestion(people[0]);
    expect(first).toMatchObject({ date: today, mine: null, results: null });
    expect(first.question.theme).toBe(themeOfDay(today));
    expect(Object.keys(first.question).sort()).toEqual(['id', 'options', 'text', 'theme']);
    // A question picked for today afterwards does not replace the one already given.
    await add({ text: 'دیر رسیده؟', pinnedDate: today }).expect(400);
    clearDayQuestionCache();
    expect((await todayQuestion(people[1])).question.id).toBe(first.question.id);
    expect(await db.select().from(dayQuestionDays)).toEqual([{ date: today, questionId: first.question.id }]);
    expect((await bank()).todayId).toBe(first.question.id);
  });

  it('has no question on a day the bank has nothing to ask, and the card goes on without it', async () => {
    expect(await todayQuestion(people[0])).toEqual({ date: today, question: null, mine: null, results: null });
    await choose(people[0], 0).expect(400);
    expect(await db.select().from(dayQuestionDays)).toEqual([]);
  });

  it('shows what everyone said only to someone who answered, and only from five answers', async () => {
    await add({ text: 'چای یا قهوه؟', options: ['چای', 'قهوه', 'هیچ‌کدام'], pinnedDate: today }).expect(201);
    for (const [i, option] of [0, 0, 1, 1].entries()) expect((await choose(people[i], option).expect(200)).body).toMatchObject({ mine: option, results: null });
    // The fifth answer: shares appear, for those who answered.
    expect((await choose(people[4], 0).expect(200)).body).toMatchObject({ mine: 0, results: { answers: MOOD_MIN_ANSWERS, shares: [60, 40, 0] } });
    expect((await todayQuestion(people[0])).results).toEqual({ answers: 5, shares: [60, 40, 0] });
    // Not for someone who has not: nobody is led by the crowd.
    expect(await todayQuestion(people[5])).toMatchObject({ mine: null, results: null });
    // A changed answer is counted once.
    expect((await choose(people[4], 2).expect(200)).body).toMatchObject({ mine: 2, results: { answers: 5, shares: [40, 40, 20] } });
    await choose(people[5], 3).expect(400);
    await choose(people[5], -1).expect(400);
    await request(app).get('/api/moods/question').expect(401);
  });

  it('reports the totals to managers, without names and without the days of too few answers', async () => {
    await add({ text: 'چای یا قهوه؟', options: ['چای', 'قهوه'], pinnedDate: today }).expect(201);
    for (const person of people.slice(0, 4)) await choose(person, 1).expect(200);
    expect((await admin.get('/api/moods/questions/results').expect(200)).body).toEqual([]);
    await choose(people[4], 0).expect(200);
    const report = (await admin.get('/api/moods/questions/results').expect(200)).body;
    expect(report).toEqual([{ date: today, text: 'چای یا قهوه؟', theme: themeOfDay(today), options: ['چای', 'قهوه'], counts: [1, 4] }]);
    const text = JSON.stringify([report, await todayQuestion(people[0]), await bank()]);
    for (const person of people) expect(text).not.toContain(person.id);
    await people[0].agent.get('/api/moods/questions/results').expect(403);
    // Whoever looks after the bank does not see the answers either.
    await owner.agent.get('/api/moods/questions/results').expect(403);
  });

  it('keeps the bank for whoever looks after «شروع روز», also while it is hidden from them', async () => {
    await people[0].agent.get('/api/moods/questions').expect(403);
    await add({}, people[0].agent).expect(403);
    await people[0].agent.put('/api/moods/programme').send({ stepOrder: [] }).expect(403);
    await admin.put('/api/settings/features/dayStart').send({ state: 'preview' }).expect(200);
    // In preview the card and its question are not for the owner, but the bank is.
    expect(await todayQuestion(owner)).toEqual({ date: '', question: null, mine: null, results: null });
    await choose(owner, 0).expect(404);
    await add({ text: 'از مسئول برنامه؟' }, owner.agent).expect(201);
    expect((await bank(owner.agent)).questions.map((x) => x.text)).toEqual(['از مسئول برنامه؟']);
    // With the daily mood switched off altogether the bank can still be prepared.
    await admin.put('/api/settings/features/mood').send({ state: 'off' }).expect(200);
    await owner.agent.get('/api/moods/questions').expect(200);
    await people[0].agent.get('/api/moods/questions').expect(404);
    await admin.put('/api/settings/features/mood').send({ state: 'on' }).expect(200);
  });

  it('edits the bank: a question that was asked keeps its options and cannot be deleted', async () => {
    await add({ text: 'بدون گزینه؟', options: ['فقط یکی'] }).expect(400);
    await add({ text: 'مناسبتی بدون روز؟', theme: 'occasion' }).expect(400);
    await add({ text: 'روز گذشته؟', pinnedDate: addJalaliDays(today, -1) }).expect(400);
    const created = (await add({ text: 'پرسش اول؟' }).expect(201)).body.questions[0];
    const asked = await todayQuestion(people[0]);
    expect(asked.question.id).toBe(created.id);
    await choose(people[0], 1).expect(200);

    const edit = (data: Record<string, unknown>) => admin.put(`/api/moods/questions/${created.id}`).send({ text: 'پرسش اول؟', options: ['بله', 'نه'], theme: created.theme, active: true, pinnedDate: '', ...data });
    await edit({ options: ['بله', 'نه', 'شاید'] }).expect(400);
    // The wording and whether it is asked can still change.
    const edited = (await edit({ text: 'پرسش اول (اصلاح‌شده)؟', active: false }).expect(200)).body.questions[0];
    expect(edited).toMatchObject({ text: 'پرسش اول (اصلاح‌شده)؟', active: false, lastAsked: today, timesAsked: 1 });
    await admin.delete(`/api/moods/questions/${created.id}`).expect(409);
    // Switched off, it stays the day's question for those who already saw it.
    clearDayQuestionCache();
    expect((await todayQuestion(people[1])).question.text).toBe('پرسش اول (اصلاح‌شده)؟');

    // A day can be picked for one question only.
    const yalda = addJalaliDays(today, 10);
    await add({ text: 'یلدا؟', theme: 'occasion', pinnedDate: yalda }).expect(201);
    await add({ text: 'یلدای دوم؟', theme: 'occasion', pinnedDate: yalda }).expect(400);
    const fresh = (await add({ text: 'حذف‌شدنی؟' }).expect(201)).body.questions.find((x: DayQuestion) => x.text === 'حذف‌شدنی؟');
    expect((await admin.delete(`/api/moods/questions/${fresh.id}`).expect(200)).body.questions.map((x: DayQuestion) => x.text)).not.toContain('حذف‌شدنی؟');
    await admin.delete('/api/moods/questions/nothing').expect(404);
  });

  it('warns when fewer than ten questions are left to ask', async () => {
    for (let i = 0; i < DAY_QUESTIONS_LOW; i++) await add({ text: `پرسش ${i}؟` }).expect(201);
    expect((await bank()).rested).toBe(DAY_QUESTIONS_LOW);
    await todayQuestion(people[0]);
    // Today's question has just been asked and rests for thirty days.
    expect((await bank()).rested).toBe(DAY_QUESTIONS_LOW - 1);
  });

  it('adds up to three reasons to today’s mood; another mood starts without them', async () => {
    const person = people[0];
    await person.agent.put('/api/moods/reasons').send({ reasons: ['load'] }).expect(409);
    await person.agent.post('/api/moods').send({ mood: 'خوب' }).expect(200);
    expect((await person.agent.put('/api/moods/reasons').send({ reasons: ['load', 'people', 'load'] }).expect(200)).body.mood.reasons).toEqual(['load', 'people']);
    await person.agent.put('/api/moods/reasons').send({ reasons: ['load', 'people', 'tools', 'meetings'] }).expect(400);
    await person.agent.put('/api/moods/reasons').send({ reasons: ['weather'] }).expect(400);
    // Tapping the same mood again keeps them; another mood clears them.
    expect((await person.agent.post('/api/moods').send({ mood: 'خوب' }).expect(200)).body.mood.reasons).toEqual(['load', 'people']);
    expect((await person.agent.post('/api/moods').send({ mood: 'بد' }).expect(200)).body.mood.reasons).toEqual([]);
    await person.agent.put('/api/moods/reasons').send({ reasons: ['personal'] }).expect(200);
    expect((await person.agent.get('/api/moods/me').expect(200)).body).toMatchObject([{ date: today, mood: 'بد', reasons: ['personal'] }]);
    // The reasons are part of «شروع روز».
    await admin.put('/api/settings/features/dayStart').send({ state: 'preview' }).expect(200);
    await person.agent.put('/api/moods/reasons').send({ reasons: [] }).expect(404);
  });

  it('saves the order of the day’s steps for everyone; the built-in order is kept as none', async () => {
    const settingsOf = async (agent: Agent) => (await agent.get('/api/settings').expect(200)).body.dayStepOrder;
    expect(await settingsOf(people[0].agent)).toEqual([]);
    const order = ['care', 'plan', 'poll', 'acks'];
    expect((await owner.agent.put('/api/moods/programme').send({ stepOrder: order }).expect(200)).body.stepOrder).toEqual(dayStepOrder(order));
    expect(await settingsOf(people[0].agent)).toEqual(dayStepOrder(order));
    await owner.agent.put('/api/moods/programme').send({ stepOrder: ['nonsense'] }).expect(400);
    expect((await owner.agent.put('/api/moods/programme').send({ stepOrder: [...DAY_STEPS] }).expect(200)).body.stepOrder).toEqual([]);
    expect(await settingsOf(people[0].agent)).toEqual([]);
  });
});
