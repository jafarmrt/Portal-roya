import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { specialEvents } from '../server/db/schema';
import { quizPoints } from '../shared/specialEvents';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface Quiz {
  count: number;
  asked: number;
  questions: { id: string; correct: number }[];
  current: {
    id: string;
    index: number;
    open: boolean;
    revealed: boolean;
    correct: number | null;
    answered: number;
    counts: number[] | null;
    myChoice: number | null;
    myPoints: number | null;
  } | null;
  leaders: { employeeId: string; points: number; correct: number; rank: number }[];
  me: { points: number; correct: number; rank: number } | null;
  canPlay: boolean;
  live: boolean;
}
interface View {
  quiz: Quiz;
}

describe('points of «مسابقهٔ همه»', () => {
  it('gives nothing for a wrong answer and more for a faster right one', () => {
    expect(quizPoints(false, 100, 20)).toBe(0);
    expect(quizPoints(true, 0, 20)).toBe(1000);
    expect(quizPoints(true, 10_000, 20)).toBe(750);
    expect(quizPoints(true, 25_000, 20)).toBe(500);
  });
});

describe('«رویداد ویژه»: the quiz everyone answers on their phone', () => {
  let admin: Agent;
  let organizer: Person;
  let ali: Person;
  let sara: Person;
  let eventId: string;

  const view = async (agent: Agent | Person['agent']) => ((await agent.get('/api/special_events/current').expect(200)).body as View).quiz;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'qz.organizer' });
    ali = await createEmployee(admin, { username: 'qz.ali' });
    sara = await createEmployee(admin, { username: 'qz.sara' });
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin.patch(`/api/special_events/${eventId}`).send({ organizerIds: [organizer.id] }).expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
  });
  afterAll(() => pool.end());

  it('lets the organizers write questions that colleagues cannot read beforehand', async () => {
    const questions = [
      { text: 'بلندترین شب سال کدام است؟', options: ['یلدا', 'نوروز', 'سده'], correct: 0, seconds: 20 },
      { text: 'انار چند دانه دارد؟', options: ['زیاد', 'کم'], correct: 1 },
    ];
    await ali.agent.put(`/api/special_events/${eventId}/quiz_questions`).send({ questions }).expect(403);
    await organizer.agent.put(`/api/special_events/${eventId}/quiz_questions`).send({ questions: [{ text: 'سؤال؟', options: ['یک'], correct: 0 }] }).expect(400);
    await organizer.agent.put(`/api/special_events/${eventId}/quiz_questions`).send({ questions: [{ text: 'سؤال؟', options: ['یک', 'دو'], correct: 2 }] }).expect(400);
    const saved = ((await organizer.agent.put(`/api/special_events/${eventId}/quiz_questions`).send({ questions }).expect(200)).body as View).quiz;
    expect(saved.questions).toHaveLength(2);
    expect(saved.canPlay).toBe(false);
    const forAli = await view(ali.agent);
    expect(forAli).toMatchObject({ count: 2, questions: [], current: null, canPlay: true, live: false });
    // Not before the program.
    await organizer.agent.post(`/api/special_events/${eventId}/quiz/next`).send({}).expect(400);
  });

  it('opens one question at a time; answers once, before the clock; the answer and the table after the reveal', async () => {
    await db.update(specialEvents).set({ programDate: today, programTime: '00:00', signupEnd: day(-3), showUntil: day(2) }).where(eq(specialEvents.id, eventId));
    await ali.agent.post(`/api/special_events/${eventId}/quiz/next`).send({}).expect(403);
    const opened = ((await organizer.agent.post(`/api/special_events/${eventId}/quiz/next`).send({}).expect(200)).body as View & { event: { screen: { scene: string } } });
    expect(opened.event.screen.scene).toBe('quiz');
    const q1 = opened.quiz.current!;
    expect(q1).toMatchObject({ index: 1, open: true, revealed: false, correct: 0 });

    const forAli = await view(ali.agent);
    expect(forAli.current).toMatchObject({ correct: null, counts: null, myChoice: null });
    await organizer.agent.put(`/api/event_quiz/${q1.id}/answer`).send({ choice: 0 }).expect(403);
    await ali.agent.put(`/api/event_quiz/${q1.id}/answer`).send({ choice: 5 }).expect(400);
    const answered = ((await ali.agent.put(`/api/event_quiz/${q1.id}/answer`).send({ choice: 0 }).expect(200)).body as View).quiz;
    expect(answered.current).toMatchObject({ myChoice: 0, myPoints: null, answered: 1 });
    await ali.agent.put(`/api/event_quiz/${q1.id}/answer`).send({ choice: 1 }).expect(409);
    await sara.agent.put(`/api/event_quiz/${q1.id}/answer`).send({ choice: 2 }).expect(200);
    // The next one waits for this one's answer.
    await organizer.agent.post(`/api/special_events/${eventId}/quiz/next`).send({}).expect(400);

    await organizer.agent.post(`/api/special_events/${eventId}/quiz/reveal`).expect(200);
    const shown = await view(ali.agent);
    expect(shown.current).toMatchObject({ revealed: true, open: false, correct: 0, counts: [1, 0, 1] });
    expect(shown.current!.myPoints).toBeGreaterThan(900);
    // Only those with points are on the table.
    expect(shown.leaders.map((l) => l.employeeId)).toEqual([ali.id]);
    expect((await view(sara.agent)).me).toMatchObject({ points: 0, correct: 0, rank: 2 });
    expect(shown.me).toMatchObject({ correct: 1, rank: 1 });
    await sara.agent.put(`/api/event_quiz/${q1.id}/answer`).send({ choice: 0 }).expect(400);

    // The second, then everything has been asked.
    const second = ((await organizer.agent.post(`/api/special_events/${eventId}/quiz/next`).send({}).expect(200)).body as View).quiz;
    expect(second.current).toMatchObject({ index: 2, answered: 0 });
    // Before its reveal, the second question's answers do not count yet.
    await sara.agent.put(`/api/event_quiz/${second.current!.id}/answer`).send({ choice: 1 }).expect(200);
    expect((await view(sara.agent)).me).toMatchObject({ points: 0 });
    await organizer.agent.post(`/api/special_events/${eventId}/quiz/reveal`).expect(200);
    expect((await view(sara.agent)).me!.points).toBeGreaterThan(900);
    await organizer.agent.post(`/api/special_events/${eventId}/quiz/next`).send({}).expect(400);
    // While a question is open the questions cannot be rewritten; after its reveal they can.
    expect((await view(organizer.agent)).asked).toBe(2);
  });

  it('starts again from nothing after the rehearsal', async () => {
    await ali.agent.post(`/api/special_events/${eventId}/quiz/reset`).expect(403);
    await organizer.agent.post(`/api/special_events/${eventId}/quiz/reset`).expect(200);
    const fresh = await view(ali.agent);
    expect(fresh).toMatchObject({ asked: 0, current: null, leaders: [], me: null });
  });
});
