import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications, polls } from '../server/db/schema';
import { processPollDeadlines } from '../server/routes/polls';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

interface Question {
  id: string;
  type: string;
  text: string;
  required: boolean;
  options: { id: string; text: string }[];
  results?: { answered: number; votes?: Record<string, number>; ratings?: number[]; average?: number | null; texts?: string[] };
}
interface Poll {
  id: string;
  title: string;
  forMe: boolean;
  canManage: boolean;
  resultsVisible: boolean;
  hasVoted: boolean;
  responseCount: number;
  questions: Question[];
}

/** A lunch survey with one question of each kind. */
const SURVEY = {
  title: 'برنامهٔ جشن پایان سال',
  description: 'برای برنامه‌ریزی جشن',
  questions: [
    { text: 'کدام روز؟', type: 'single', options: [{ text: 'چهارشنبه' }, { text: 'پنجشنبه' }] },
    { text: 'چه غذاهایی؟', type: 'multiple', options: [{ text: 'کباب' }, { text: 'سبزی' }, { text: 'ماهی' }] },
    { text: 'جشن پارسال چطور بود؟', type: 'rating' },
    { text: 'پیشنهاد دیگری دارید؟', type: 'text', required: false },
  ],
};

const listOf = async (agent: Agent) => (await agent.get('/api/polls').expect(200)).body as Poll[];
const pollOf = async (agent: Agent, id: string) => (await listOf(agent)).find((p) => p.id === id);
const notificationsOf = async (userId: string, pollId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.linkId, pollId)));

/** Answers every question of SURVEY: the first options, a rating and a written answer. */
const fullAnswer = (poll: Poll, text = 'موسیقی زنده') => ({
  answers: [
    { questionId: poll.questions[0].id, optionIds: [poll.questions[0].options[1].id] },
    { questionId: poll.questions[1].id, optionIds: [poll.questions[1].options[0].id, poll.questions[1].options[2].id] },
    { questionId: poll.questions[2].id, rating: 4 },
    { questionId: poll.questions[3].id, text },
  ],
});

describe('polls with several questions', () => {
  let admin: Agent;
  let sales: Person;
  let sales2: Person;
  let design: Person;
  let production: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sales = await createEmployee(admin, { username: 'poll.sales', department: 'فروش' });
    sales2 = await createEmployee(admin, { username: 'poll.sales2', department: 'فروش' });
    design = await createEmployee(admin, { username: 'poll.design', department: 'طراحی' });
    production = await createEmployee(admin, { username: 'poll.production', department: 'تولید' });
  });
  afterAll(() => pool.end());

  it('mixes single-choice, multiple-choice, rating and written questions in one form', async () => {
    const created = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll & { anonymous: boolean; resultsVisibility: string };
    expect(created).toMatchObject({ anonymous: true, resultsVisibility: 'after_answer', responseCount: 0 });
    expect(created.questions.map((q) => [q.type, q.required, q.options.length])).toEqual([
      ['single', true, 2],
      ['multiple', true, 3],
      ['rating', true, 0],
      ['text', false, 0],
    ]);

    await sales.agent.post(`/api/polls/${created.id}/vote`).send(fullAnswer(created)).expect(200);
    // The written answer is optional.
    const [day0, food0, rating0] = created.questions;
    await design.agent
      .post(`/api/polls/${created.id}/vote`)
      .send({
        answers: [
          { questionId: day0.id, optionIds: [day0.options[1].id] },
          { questionId: food0.id, optionIds: [food0.options[0].id] },
          { questionId: rating0.id, rating: 2 },
        ],
      })
      .expect(200);

    const results = (await pollOf(admin, created.id))!;
    expect(results.responseCount).toBe(2);
    const [day, food, rating, text] = results.questions.map((q) => q.results!);
    expect(day.votes).toEqual({ [created.questions[0].options[1].id]: 2 });
    expect(food.votes).toEqual({ [created.questions[1].options[0].id]: 2, [created.questions[1].options[2].id]: 1 });
    expect(rating).toMatchObject({ answered: 2, ratings: [0, 1, 0, 1, 0], average: 3 });
    expect(text).toMatchObject({ answered: 1, texts: ['موسیقی زنده'] });

    const mine = (await sales.agent.get('/api/polls').expect(200)).body.find((p: Poll) => p.id === created.id);
    expect(mine.hasVoted).toBe(true);
    expect(mine.myAnswers[created.questions[1].id].optionIds).toHaveLength(2);
    expect(mine.myAnswers[created.questions[2].id].rating).toBe(4);
  });

  it('checks the answers against the questions', async () => {
    const poll = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll;
    const vote = (body: object) => sales.agent.post(`/api/polls/${poll.id}/vote`).send(body);
    const answer = fullAnswer(poll);

    // A required question left empty.
    const missing = await vote({ answers: answer.answers.filter((a) => a.questionId !== poll.questions[2].id) }).expect(400);
    expect(missing.body.error).toContain('امتیاز');
    // Two options on a single-choice question.
    await vote({ answers: [{ ...answer.answers[0], optionIds: poll.questions[0].options.map((o) => o.id) }, ...answer.answers.slice(1)] }).expect(400);
    // An option of another question.
    await vote({ answers: [{ ...answer.answers[0], optionIds: [poll.questions[1].options[0].id] }, ...answer.answers.slice(1)] }).expect(400);
    await vote({ answers: [] }).expect(400);

    const results = await Promise.all([vote(answer), vote(answer)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await pollOf(admin, poll.id))!.responseCount).toBe(1);
  });

  it('rejects malformed forms', async () => {
    const post = (questions: object[]) => admin.post('/api/polls').send({ title: 'فرم', questions });
    await post([]).expect(400);
    await post([{ text: 'یکی؟', type: 'single', options: [{ text: 'فقط یکی' }] }]).expect(400);
    await post([{ text: 'تکراری؟', type: 'multiple', options: [{ text: 'الف' }, { text: 'الف' }] }]).expect(400);
    await post([{ text: 'نظر؟', type: 'text', options: [{ text: 'الف' }, { text: 'ب' }] }]).expect(400);
    await post([{ text: '', type: 'rating' }]).expect(400);
  });

  it('rejects answers after the deadline and on closed polls', async () => {
    const late = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll;
    await db.update(polls).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(polls.id, late.id));
    await design.agent.post(`/api/polls/${late.id}/vote`).send(fullAnswer(late)).expect(400);

    const closed = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll;
    await admin.patch(`/api/polls/${closed.id}/status`).send({ isActive: false }).expect(200);
    await design.agent.post(`/api/polls/${closed.id}/vote`).send(fullAnswer(closed)).expect(400);
    await design.agent.patch(`/api/polls/${closed.id}/status`).send({ isActive: true }).expect(403);
  });

  describe('who sees the results', () => {
    const create = async (extra: object) => ((await admin.post('/api/polls').send({ ...SURVEY, ...extra }).expect(201)).body as Poll);

    it('keeps results for the creator and poll managers only, when asked', async () => {
      const poll = await create({ resultsVisibility: 'managers', showTextAnswers: true });
      await sales.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(200);
      const seen = (await pollOf(sales.agent, poll.id))!;
      expect(seen).toMatchObject({ hasVoted: true, resultsVisible: false });
      expect(seen.questions.every((q) => q.results === undefined)).toBe(true);

      await admin.patch(`/api/polls/${poll.id}/status`).send({ isActive: false }).expect(200);
      expect((await pollOf(sales.agent, poll.id))!.resultsVisible).toBe(false);
      expect((await pollOf(admin, poll.id))!.questions[3].results!.texts).toEqual(['موسیقی زنده']);
    });

    it('shows results after answering, with written answers only when the creator allows it', async () => {
      const poll = await create({ resultsVisibility: 'after_answer' });
      expect((await pollOf(sales.agent, poll.id))!.resultsVisible).toBe(false);
      await sales.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(200);
      const seen = (await pollOf(sales.agent, poll.id))!;
      expect(seen.resultsVisible).toBe(true);
      expect(seen.questions[0].results!.votes).toEqual({ [poll.questions[0].options[1].id]: 1 });
      expect(seen.questions[3].results!.texts).toBeUndefined();

      const open = await create({ resultsVisibility: 'after_answer', showTextAnswers: true });
      await sales.agent.post(`/api/polls/${open.id}/vote`).send(fullAnswer(open, 'کیک')).expect(200);
      expect((await pollOf(sales.agent, open.id))!.questions[3].results!.texts).toEqual(['کیک']);
    });

    it('shows results to everyone only once the poll has closed', async () => {
      const poll = await create({ resultsVisibility: 'after_close' });
      await sales.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(200);
      expect((await pollOf(sales.agent, poll.id))!.resultsVisible).toBe(false);
      expect((await pollOf(design.agent, poll.id))!.resultsVisible).toBe(false);

      await admin.patch(`/api/polls/${poll.id}/status`).send({ isActive: false }).expect(200);
      expect((await pollOf(sales.agent, poll.id))!.resultsVisible).toBe(true);
      // Colleagues who did not answer see them too once it is over.
      expect((await pollOf(design.agent, poll.id))!.resultsVisible).toBe(true);
    });
  });

  describe('anonymous and named polls', () => {
    it('exports answer sheets without names for anonymous polls', async () => {
      const poll = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll;
      await sales.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(200);
      const sheet = (await admin.get(`/api/polls/${poll.id}/responses`).expect(200)).body;
      expect(sheet.anonymous).toBe(true);
      expect(sheet.questions).toEqual(SURVEY.questions.map((q) => q.text));
      expect(sheet.responses).toEqual([{ name: '', department: '', submittedAt: null, answers: ['پنجشنبه', 'کباب، ماهی', '4', 'موسیقی زنده'] }]);
      await sales.agent.get(`/api/polls/${poll.id}/responses`).expect(403);
    });

    it('names the colleagues of a named poll, and never turns an anonymous poll with answers into a named one', async () => {
      const named = (await admin.post('/api/polls').send({ ...SURVEY, anonymous: false }).expect(201)).body as Poll;
      await sales.agent.post(`/api/polls/${named.id}/vote`).send(fullAnswer(named)).expect(200);
      const sheet = (await admin.get(`/api/polls/${named.id}/responses`).expect(200)).body;
      expect(sheet.responses[0]).toMatchObject({ name: 'همکار poll.sales', department: 'فروش' });
      expect(sheet.responses[0].submittedAt).toBeTruthy();

      const anonymous = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll;
      const edit = { ...SURVEY, anonymous: false, questions: anonymous.questions.map((q) => ({ ...q, options: q.options })) };
      // Before anyone answers it may still change.
      await admin.put(`/api/polls/${anonymous.id}`).send(edit).expect(200);
      await admin.put(`/api/polls/${anonymous.id}`).send({ ...edit, anonymous: true }).expect(200);
      const current = (await pollOf(admin, anonymous.id))!;
      await sales.agent.post(`/api/polls/${anonymous.id}/vote`).send(fullAnswer(current)).expect(200);
      const refused = await admin.put(`/api/polls/${anonymous.id}`).send({ ...edit, questions: current.questions }).expect(400);
      expect(refused.body.error).toContain('ناشناس');
    });
  });

  it('asks only the chosen departments, and reminds those who have not answered', async () => {
    const poll = (await admin.post('/api/polls').send({ ...SURVEY, targetDepartments: ['فروش', 'طراحی'] }).expect(201)).body as Poll;
    expect(await pollOf(production.agent, poll.id)).toBeUndefined();
    await production.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(404);
    // Poll managers see every poll but answer only those meant for them.
    expect((await pollOf(admin, poll.id))!).toMatchObject({ forMe: false, canManage: true });
    await admin.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(403);
    expect(await notificationsOf(production.id, poll.id)).toHaveLength(0);
    expect(await notificationsOf(sales2.id, poll.id)).toHaveLength(1);

    const counted = (await admin.get('/api/polls').expect(200)).body.find((p: Poll) => p.id === poll.id);
    expect(counted.audienceCount).toBe(3);

    await sales.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(200);
    await sales.agent.post(`/api/polls/${poll.id}/remind`).expect(403);
    const reminded = await admin.post(`/api/polls/${poll.id}/remind`).expect(200);
    // Sales 2 and design have not answered; sales has, and production is not asked.
    expect(reminded.body.sent).toBe(2);
    expect(await notificationsOf(sales.id, poll.id)).toHaveLength(1);
    expect(await notificationsOf(sales2.id, poll.id)).toHaveLength(2);
    expect(await notificationsOf(design.id, poll.id)).toHaveLength(2);
    await admin.post(`/api/polls/${poll.id}/remind`).expect(429);
  });

  it('reminds once on the last day, unless the poll was only just published', async () => {
    const hour = 60 * 60 * 1000;
    const now = new Date();
    const poll = (await admin.post('/api/polls').send({ ...SURVEY, targetDepartments: ['فروش'] }).expect(201)).body as Poll;
    const fresh = (await admin.post('/api/polls').send({ ...SURVEY, title: 'تازه', targetDepartments: ['فروش'] }).expect(201)).body as Poll;
    await sales.agent.post(`/api/polls/${poll.id}/vote`).send(fullAnswer(poll)).expect(200);
    await db.update(polls).set({ createdAt: new Date(now.getTime() - 72 * hour), expiresAt: new Date(now.getTime() + 6 * hour) }).where(eq(polls.id, poll.id));
    await db.update(polls).set({ expiresAt: new Date(now.getTime() + 6 * hour) }).where(eq(polls.id, fresh.id));

    await processPollDeadlines(now);
    await processPollDeadlines(now);
    const soon = (id: string, poll: string) => notificationsOf(id, poll).then((rows) => rows.filter((n) => n.title.includes('مهلت')));
    expect(await soon(sales2.id, poll.id)).toHaveLength(1);
    expect(await soon(sales.id, poll.id)).toHaveLength(0);
    expect(await soon(sales2.id, fresh.id)).toHaveLength(0);
  });

  describe('editing', () => {
    it('changes everything before the first answer, and keeps answered questions after it', async () => {
      const poll = (await admin.post('/api/polls').send(SURVEY).expect(201)).body as Poll;
      const replaced = (
        await admin
          .put(`/api/polls/${poll.id}`)
          .send({ ...SURVEY, questions: [{ text: 'فقط یک سؤال؟', type: 'single', options: [{ text: 'بله' }, { text: 'خیر' }] }] })
          .expect(200)
      ).body as Poll;
      expect(replaced.questions.map((q) => q.text)).toEqual(['فقط یک سؤال؟']);

      const [question] = replaced.questions;
      await sales.agent.post(`/api/polls/${poll.id}/vote`).send({ answers: [{ questionId: question.id, optionIds: [question.options[0].id] }] }).expect(200);
      const edit = (questions: object[], extra: object = {}) => admin.put(`/api/polls/${poll.id}`).send({ ...SURVEY, title: 'نسخهٔ دوم', questions, ...extra });

      // Removing an option or a question, or changing the type, would change what people answered.
      await edit([{ ...question, options: [question.options[0]] }]).expect(400);
      await edit([{ text: 'سؤال دیگر', type: 'text' }]).expect(400);
      await edit([{ ...question, type: 'multiple' }]).expect(400);
      await edit([question], { expiryDate: '1390/01/01' }).expect(400);

      const updated = (
        await edit([
          { ...question, text: 'فقط یک سؤال داریم؟', options: [{ ...question.options[0], text: 'آری' }, question.options[1], { text: 'نمی‌دانم' }] },
          { text: 'چرا؟', type: 'text', required: false },
        ]).expect(200)
      ).body as Poll;
      expect(updated.title).toBe('نسخهٔ دوم');
      expect(updated.questions.map((q) => q.text)).toEqual(['فقط یک سؤال داریم؟', 'چرا؟']);
      expect(updated.questions[0].options.map((o) => o.text)).toEqual(['آری', 'خیر', 'نمی‌دانم']);
      expect(updated.questions[0].results!.votes).toEqual({ [question.options[0].id]: 1 });

      await sales.agent.put(`/api/polls/${poll.id}`).send({ ...SURVEY }).expect(403);
      await sales.agent.delete(`/api/polls/${poll.id}`).expect(403);
      await admin.delete(`/api/polls/${poll.id}`).expect(200);
      expect(await pollOf(admin, poll.id)).toBeUndefined();
    });
  });
});
