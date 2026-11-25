import { eq } from 'drizzle-orm';
import moment from 'moment-jalaali';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isDayOff, processDayStartReminders } from '../server/dayWeek';
import { db, pool } from '../server/db/index';
import { assignedTasks, customHolidays, dayStepCounts, employees, moods, notifications, personalTodos, recognitions } from '../server/db/schema';
import { DAY_REMINDER, DAY_REMINDER_HOURS, DAY_WRAP_FROM, previousWeek, weekIsEmpty, wrapDue, wrapLine, type MyWeek } from '../shared/dayWeek';
import { FEATURES } from '../shared/features';
import { jalaliToDate, todayJalali, toPersianDigits } from '../shared/jalali';
import { pushCategoryOf } from '../shared/push';
import { addJalaliDays } from '../shared/todos';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// 1405/09/07 is a Saturday.
const SATURDAY = '1405/09/07';

describe('«شروع روز»: the afternoon wrap-up and «هفتهٔ من», the rules', () => {
  it('asks about the day’s notes once, in the afternoon, and not on a hard day', () => {
    const base = { hour: DAY_WRAP_FROM, mood: 'خوب' as const, done: 1, open: 2, settled: false };
    expect(DAY_WRAP_FROM).toBe(15);
    expect(wrapDue(base)).toBe(true);
    expect(wrapDue({ ...base, hour: 14 })).toBe(false);
    expect(wrapDue({ ...base, settled: true })).toBe(false);
    // Nothing was for today: nothing to wrap up.
    expect(wrapDue({ ...base, done: 0, open: 0 })).toBe(false);
    // Everything done still gets its line.
    expect(wrapDue({ ...base, done: 3, open: 0 })).toBe(true);
    expect(wrapDue({ ...base, mood: 'معمولی' })).toBe(true);
    expect(wrapDue({ ...base, mood: 'بد' })).toBe(false);
    expect(wrapDue({ ...base, mood: 'خیلی بد' })).toBe(false);
  });

  it('says what became of the day’s notes', () => {
    const fa = (n: number) => toPersianDigits(n);
    expect(wrapLine(2, 1, fa)).toBe('از ۳ کار امروز ۲ تا انجام شد. آن یکی را به فردا ببرم؟');
    expect(wrapLine(1, 3, fa)).toBe('از ۴ کار امروز ۱ تا انجام شد. بقیه را به فردا ببرم؟');
    expect(wrapLine(3, 0, fa)).toBe('هر ۳ کار امروز انجام شد. خسته نباشید!');
    expect(wrapLine(1, 0, fa)).toBe('کار امروزتان انجام شد. خسته نباشید!');
    expect(wrapLine(0, 2, fa)).toBe('۲ کار امروز هنوز باز است. به فردا ببرم؟');
    expect(wrapLine(0, 1, fa)).toBe('کار امروزتان هنوز باز است. به فردا ببرم؟');
  });

  it('takes the week before, from its Saturday to its Friday', () => {
    const before = { from: addJalaliDays(SATURDAY, -7), to: addJalaliDays(SATURDAY, -1) };
    // Any day of a week gives the same week before it.
    for (let i = 0; i < 7; i++) expect(previousWeek(addJalaliDays(SATURDAY, i))).toEqual(before);
    expect(previousWeek(addJalaliDays(SATURDAY, 7))).toEqual({ from: SATURDAY, to: addJalaliDays(SATURDAY, 6) });
  });

  it('gives no card for a week with nothing in it', () => {
    const empty: MyWeek = { from: SATURDAY, to: addJalaliDays(SATURDAY, 6), notesDone: 0, tasksDone: 0, given: 0, received: 0, moods: [null, null, null, null, null] };
    expect(weekIsEmpty(empty)).toBe(true);
    expect(weekIsEmpty({ ...empty, received: 1 })).toBe(false);
    expect(weekIsEmpty({ ...empty, moods: [null, 'بد', null, null, null] })).toBe(false);
  });

  it('files the reminder with the notes’ reminders and hides it with «شروع روز»', () => {
    expect(pushCategoryOf('dayStart')).toBe('todos');
    expect(FEATURES.find((f) => f.key === 'dayStart')!.notificationTypes).toContain('dayStart');
  });
});

describe('«شروع روز»: «هفتهٔ من» and the morning reminder, over the API', () => {
  let admin: Agent;
  let mina: Person;
  let omid: Person;
  const today = todayJalali();
  const last = previousWeek(today);
  /** A moment on a day of last week (noon), and one before and after it. */
  const at = (date: string, time = '12:00') => jalaliToDate(date, time)!;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    mina = await createEmployee(admin, { username: 'week.mina' });
    omid = await createEmployee(admin, { username: 'week.omid' });
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
    await admin.put('/api/settings/features/tasks').send({ state: 'on' }).expect(200);
  });
  beforeEach(async () => {
    await db.delete(moods);
    await db.delete(personalTodos);
    await db.delete(assignedTasks);
    await db.delete(recognitions);
    await db.delete(notifications);
    await db.delete(customHolidays);
    await db.delete(dayStepCounts);
    await db.update(employees).set({ dayStartReminder: false, dayStartRemindedOn: null });
    await admin.put('/api/settings/features/dayStart').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  const week = async (person: Person) => (await person.agent.get('/api/moods/week').expect(200)).body.week as MyWeek | null;
  const note = (userId: string, id: string, doneAt: Date | null) => ({ id, userId, title: id, dueDate: last.from, doneAt });
  const task = (id: string, assigneeId: string, status: 'done' | 'accepted', statusAt: Date) => ({ id, groupId: id, assignerId: omid.id, assigneeId, title: id, dueDate: last.from, status, statusAt });
  const thanks = (id: string, fromId: string, toId: string, when: Date, extra: Partial<typeof recognitions.$inferInsert> = {}) => ({
    id,
    fromId,
    toId,
    amount: 5,
    month: last.from.slice(0, 7),
    valueId: 'teamwork',
    valueLabel: 'همکاری',
    valueTone: 'sage',
    message: 'ممنون از کمک دیروز.',
    createdAt: when,
    deliverAt: when,
    deliveredAt: when,
    ...extra,
  });

  it('gives nobody a card for an empty week', async () => {
    expect(await week(mina)).toBeNull();
    await request(app).get('/api/moods/week').expect(401);
  });

  it('counts the colleague’s own last week: notes, handed-over work, recognitions and moods', async () => {
    const inWeek = at(addJalaliDays(last.from, 2));
    await db.insert(personalTodos).values([
      note(mina.id, 'n-first-minute', at(last.from, '00:00')),
      note(mina.id, 'n-mid', inWeek),
      note(mina.id, 'n-last-minute', at(last.to, '23:59')),
      // Not last week, not done, or somebody else's.
      note(mina.id, 'n-this-week', at(addJalaliDays(last.to, 1), '00:01')),
      note(mina.id, 'n-older', at(addJalaliDays(last.from, -1), '23:58')),
      note(mina.id, 'n-open', null),
      note(omid.id, 'n-omid', inWeek),
    ]);
    await db.insert(assignedTasks).values([task('t-done', mina.id, 'done', inWeek), task('t-accepted', mina.id, 'accepted', inWeek), task('t-old', mina.id, 'done', at(addJalaliDays(last.from, -3)))]);
    await db.insert(recognitions).values([
      thanks('r-given', mina.id, omid.id, inWeek),
      thanks('r-given-2', mina.id, omid.id, at(last.to)),
      // Taken back: it never happened.
      thanks('r-back', mina.id, omid.id, inWeek, { withdrawnAt: inWeek }),
      thanks('r-got', omid.id, mina.id, inWeek),
      // Reversed by the programme's owner, and one not handed over yet.
      thanks('r-reversed', omid.id, mina.id, inWeek, { reversedAt: inWeek }),
      thanks('r-waiting', omid.id, mina.id, inWeek, { deliveredAt: null }),
    ]);
    await db.insert(moods).values([
      { userId: mina.id, date: last.from, mood: 'خوب' },
      { userId: mina.id, date: addJalaliDays(last.from, 2), mood: 'بد' },
      // Thursday is not one of the five days shown; this week's answer is not last week's.
      { userId: mina.id, date: addJalaliDays(last.from, 5), mood: 'عالی' },
      { userId: mina.id, date: today, mood: 'عالی' },
      { userId: omid.id, date: addJalaliDays(last.from, 1), mood: 'خیلی بد' },
    ]);

    expect(await week(mina)).toEqual({ from: last.from, to: last.to, notesDone: 3, tasksDone: 1, given: 2, received: 1, moods: ['خوب', null, 'بد', null, null] });
    // Each sees their own week only. What Omid gave and is not handed over yet still counts as given.
    expect(await week(omid)).toEqual({ from: last.from, to: last.to, notesDone: 1, tasksDone: 0, given: 2, received: 2, moods: [null, 'خیلی بد', null, null, null] });
  });

  it('leaves out the parts hidden from the colleague, and is itself part of «شروع روز»', async () => {
    const inWeek = at(addJalaliDays(last.from, 1));
    await db.insert(personalTodos).values(note(mina.id, 'n-1', inWeek));
    await db.insert(assignedTasks).values(task('t-1', mina.id, 'done', inWeek));
    await db.insert(recognitions).values(thanks('r-1', omid.id, mina.id, inWeek));
    await admin.put('/api/settings/features/tasks').send({ state: 'off' }).expect(200);
    await admin.put('/api/settings/features/recognition').send({ state: 'preview' }).expect(200);
    expect(await week(mina)).toMatchObject({ notesDone: 1, tasksDone: 0, received: 0 });
    await admin.put('/api/settings/features/tasks').send({ state: 'on' }).expect(200);
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
    await admin.put('/api/settings/features/dayStart').send({ state: 'preview' }).expect(200);
    expect(await week(mina)).toBeNull();
  });

  it('counts the afternoon wrap-up like a step, without a name', async () => {
    await mina.agent.post('/api/moods/steps').send({ kind: 'wrap', outcome: 'shown' }).expect(204);
    await mina.agent.post('/api/moods/steps').send({ kind: 'wrap', outcome: 'done' }).expect(204);
    const rows = await db.select().from(dayStepCounts);
    expect(rows.map((r) => [r.kind, r.outcome, r.count]).sort()).toEqual([['wrap', 'done', 1], ['wrap', 'shown', 1]]);
  });

  /** A working morning: the next day from today that is not a day off, at nine. */
  const workingMorning = async (hour = 9) => {
    for (let i = 0; i < 14; i++) {
      const day = moment().add(i, 'days').hour(hour).minute(0).second(0).toDate();
      if (!(await isDayOff(day))) return day;
    }
    throw new Error('no working day in two weeks');
  };
  const reminded = async () => (await db.select().from(notifications)).filter((n) => n.type === 'dayStart').map((n) => n.userId).sort();
  const setReminder = (person: Person, on: boolean) => person.agent.put('/api/settings/day-start-reminder').send({ on }).expect(200);

  it('keeps the morning reminder off until a colleague switches it on for themselves', async () => {
    const settings = async (person: Person) => (await person.agent.get('/api/settings').expect(200)).body.dayStartReminder;
    expect(await settings(mina)).toBe(false);
    expect((await setReminder(mina, true)).body.dayStartReminder).toBe(true);
    expect(await settings(mina)).toBe(true);
    expect(await settings(omid)).toBe(false);
    expect((await setReminder(mina, false)).body.dayStartReminder).toBe(false);
    await request(app).put('/api/settings/day-start-reminder').send({ on: true }).expect(401);
  });

  it('reminds once on a working morning, only those who asked and have not answered yet', async () => {
    const morning = await workingMorning();
    expect(await processDayStartReminders(morning)).toBe(0);
    await setReminder(mina, true);
    await setReminder(omid, true);
    // Omid has answered that day already.
    await db.insert(moods).values({ userId: omid.id, date: moment(morning).format('jYYYY/jMM/jDD'), mood: 'خوب' });

    // Before eight and from eleven on, nothing goes out.
    expect(await processDayStartReminders(moment(morning).hour(DAY_REMINDER_HOURS.from - 1).toDate())).toBe(0);
    expect(await processDayStartReminders(moment(morning).hour(DAY_REMINDER_HOURS.until).toDate())).toBe(0);
    expect(await processDayStartReminders(morning)).toBe(1);
    expect(await reminded()).toEqual([mina.id]);
    const [sent] = (await db.select().from(notifications)).filter((n) => n.type === 'dayStart');
    expect(sent).toMatchObject({ title: DAY_REMINDER.title, message: DAY_REMINDER.message, linkTab: 'dashboard' });
    // The next tick of the same morning does not remind again.
    expect(await processDayStartReminders(moment(morning).add(10, 'minutes').toDate())).toBe(0);
    expect(await reminded()).toEqual([mina.id]);
    // The colleague reads it in their own bell.
    const bell = (await mina.agent.get('/api/notifications').expect(200)).body;
    expect(JSON.stringify(bell)).toContain(DAY_REMINDER.title);
  });

  it('sends no reminder on a Friday, a holiday, to someone who does not see «شروع روز», or who left', async () => {
    await setReminder(mina, true);
    const friday = moment().day(5).add(7, 'days').hour(9).toDate();
    expect(moment(friday).day()).toBe(5);
    expect(await isDayOff(friday)).toBe(true);
    expect(await processDayStartReminders(friday)).toBe(0);

    const morning = await workingMorning();
    const key = moment(morning).format('jYYYY-jMM-jDD');
    // The organisation marked the day as a holiday; and a built-in holiday it marked as a working day is one.
    await db.insert(customHolidays).values({ date: key, title: 'تعطیلی شرکت', isHoliday: true });
    expect(await processDayStartReminders(morning)).toBe(0);
    await db.update(customHolidays).set({ isHoliday: false }).where(eq(customHolidays.date, key));
    expect(await isDayOff(morning)).toBe(false);
    // 22 Bahman is an official holiday unless the organisation says otherwise.
    expect(await isDayOff(jalaliToDate('1405/11/22', '09:00')!)).toBe(true);

    await admin.put('/api/settings/features/dayStart').send({ state: 'preview' }).expect(200);
    expect(await processDayStartReminders(morning)).toBe(0);
    await admin.put('/api/settings/features/dayStart').send({ state: 'on' }).expect(200);
    await db.update(employees).set({ isActive: false }).where(eq(employees.id, mina.id));
    expect(await processDayStartReminders(morning)).toBe(0);
    await db.update(employees).set({ isActive: true }).where(eq(employees.id, mina.id));
    expect(await processDayStartReminders(morning)).toBe(1);
    expect(await reminded()).toEqual([mina.id]);
  });
});
