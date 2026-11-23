import { describe, expect, it } from 'vitest';
import {
  DAY_STEP_LABELS,
  DAY_STEPS,
  eligibleSteps,
  NO_STEP_MEMORY,
  pickStep,
  readStepMemory,
  type DayStepFacts,
  type DayStepKind,
  type DayStepMemory,
} from '../shared/dayStep';

// «یک قدم برای امروز»: which step a colleague is offered. One test for each row of the plan's table
// (claude/day-start-plan.md, stage 3), then the rules around them.

const TODAY = '1405/09/03';
const YESTERDAY = '1405/09/02';

/** A quiet Sunday afternoon with a middling mood: nothing waits, so no step. */
const quiet: DayStepFacts = {
  mood: 'معمولی',
  hour: 14,
  weekday: 1,
  pendingAcks: 0,
  tasksWaiting: 0,
  notes: true,
  overdueNotes: 0,
  notesToday: 0,
  suggestions: true,
  coinsLeft: 0,
  openPolls: 0,
  trainingSoon: false,
};
const pick = (facts: Partial<DayStepFacts>, memory: DayStepMemory = NO_STEP_MEMORY) => pickStep({ ...quiet, ...facts }, memory, TODAY);
const shown = (kind: DayStepKind, state: 'open' | 'done' | 'closed', date = YESTERDAY): DayStepMemory => ({ muted: [], last: { date, kind, state } });

describe('«یک قدم برای امروز»: the rows of the table', () => {
  it('has a name for every kind, and nothing on a day when nothing waits', () => {
    for (const kind of DAY_STEPS) expect(DAY_STEP_LABELS[kind]).toBeTruthy();
    expect(pick({})).toBeNull();
  });

  it('row 1: on a hard day only the quiet way to be heard, never work', () => {
    const busy = { pendingAcks: 2, tasksWaiting: 1, overdueNotes: 3, coinsLeft: 20, openPolls: 1, trainingSoon: true, hour: 9 };
    expect(eligibleSteps({ ...quiet, ...busy, mood: 'بد' })).toEqual(['care']);
    expect(pick({ ...busy, mood: 'خیلی بد' })).toBe('care');
    // Without a suggestion box there is nothing to offer, and still no work.
    expect(pick({ ...busy, mood: 'خیلی بد', suggestions: false })).toBeNull();
    // On other days it is never offered.
    expect(eligibleSteps({ ...quiet, ...busy, mood: 'خوب' })).not.toContain('care');
  });

  it('row 2: a circular waiting for confirmation comes first', () => {
    expect(pick({ pendingAcks: 1, tasksWaiting: 2, overdueNotes: 1, hour: 9 })).toBe('acks');
  });

  it('row 3: work handed over and not answered', () => {
    expect(pick({ tasksWaiting: 2, overdueNotes: 1, hour: 9 })).toBe('tasksWaiting');
  });

  it('row 4: notes left from earlier days', () => {
    expect(pick({ overdueNotes: 3, hour: 9 })).toBe('overdue');
    // Not where «یادداشت‌های من» is hidden from the colleague.
    expect(pick({ overdueNotes: 3, hour: 9, notes: false })).toBeNull();
  });

  it('row 5: «سه کار امروز» in the morning, when nothing is written for today', () => {
    expect(pick({ hour: 9 })).toBe('plan');
    expect(pick({ hour: 5 })).toBe('plan');
    expect(pick({ hour: 12 })).toBeNull();
    expect(pick({ hour: 4 })).toBeNull();
    expect(pick({ hour: 9, notesToday: 1 })).toBeNull();
    expect(pick({ hour: 9, notes: false })).toBeNull();
  });

  it('row 7: a good mood and coins left', () => {
    expect(pick({ mood: 'خوب', coinsLeft: 10 })).toBe('thanks');
    expect(pick({ mood: 'عالی', coinsLeft: 1 })).toBe('thanks');
    expect(pick({ mood: 'عالی', coinsLeft: 0 })).toBeNull();
    expect(pick({ mood: 'معمولی', coinsLeft: 10 })).toBeNull();
  });

  it('row 8: an open survey', () => {
    expect(pick({ openPolls: 1 })).toBe('poll');
  });

  it('row 9: a course in the coming week', () => {
    expect(pick({ trainingSoon: true })).toBe('training');
    expect(pick({ trainingSoon: true, openPolls: 1 })).toBe('poll');
  });

  it('row 10: unspent coins on the last working day', () => {
    expect(pick({ weekday: 4, coinsLeft: 12 })).toBe('coins');
    expect(pick({ weekday: 3, coinsLeft: 12 })).toBeNull();
    expect(pick({ weekday: 4, coinsLeft: 0 })).toBeNull();
    // With a good mood the thanks itself comes before the reminder of coins.
    expect(pick({ weekday: 4, coinsLeft: 12, mood: 'خوب' })).toBe('thanks');
  });

  it('follows another order when one is given', () => {
    const facts = { ...quiet, pendingAcks: 1, openPolls: 1 };
    expect(pickStep(facts, NO_STEP_MEMORY, TODAY, ['poll', 'acks'])).toBe('poll');
    // A kind left out of the order is never offered.
    expect(pickStep(facts, NO_STEP_MEMORY, TODAY, ['training'])).toBeNull();
  });
});

describe('«یک قدم برای امروز»: one step a day, and no asking twice', () => {
  it('keeps the morning’s step for the day while it still holds', () => {
    // «سه کار امروز» was shown at nine; a survey opens later: the step stays.
    expect(pick({ hour: 10, openPolls: 1 }, shown('plan', 'open', TODAY))).toBe('plan');
    // Past noon the form is not taken away from under the colleague's hands.
    expect(pick({ hour: 13 }, shown('plan', 'open', TODAY))).toBe('plan');
    // Once something is written for today, it has done its work.
    expect(pick({ hour: 10, notesToday: 2, openPolls: 1 }, shown('plan', 'open', TODAY))).toBeNull();
  });

  it('offers nothing more on a day whose step was taken or closed', () => {
    const busy = { pendingAcks: 2, openPolls: 1, hour: 9 };
    expect(pick(busy, shown('plan', 'done', TODAY))).toBeNull();
    expect(pick(busy, shown('poll', 'closed', TODAY))).toBeNull();
  });

  it('does not repeat a kind that was shown last time and not taken', () => {
    // «امروز نه» yesterday, or simply ignored: something else today, or nothing.
    expect(pick({ hour: 9, openPolls: 1 }, shown('plan', 'closed'))).toBe('poll');
    expect(pick({ hour: 9 }, shown('plan', 'open'))).toBeNull();
    // Taken yesterday: welcome again today (a habit, not a nag).
    expect(pick({ hour: 9 }, shown('plan', 'done'))).toBe('plan');
  });

  it('lets what the portal itself waits for come back every day', () => {
    expect(pick({ pendingAcks: 1 }, shown('acks', 'closed'))).toBe('acks');
    expect(pick({ tasksWaiting: 1 }, shown('tasksWaiting', 'open'))).toBe('tasksWaiting');
  });

  it('never offers a kind the colleague switched off', () => {
    const muted: DayStepMemory = { muted: ['plan', 'poll'], last: null };
    expect(pick({ hour: 9, openPolls: 1, trainingSoon: true }, muted)).toBe('training');
    expect(pick({ hour: 9 }, muted)).toBeNull();
    // Switched off while it was on screen: gone at once.
    expect(pick({ hour: 9 }, { muted: ['plan'], last: { date: TODAY, kind: 'plan', state: 'open' } })).toBeNull();
  });

  it('reads the browser’s memory safely', () => {
    expect(readStepMemory(null)).toEqual(NO_STEP_MEMORY);
    expect(readStepMemory('x')).toEqual(NO_STEP_MEMORY);
    expect(readStepMemory({ muted: ['plan', 'nonsense', 3], last: { date: TODAY, kind: 'poll', state: 'done' } })).toEqual({
      muted: ['plan'],
      last: { date: TODAY, kind: 'poll', state: 'done' },
    });
    expect(readStepMemory({ muted: 'plan', last: { date: TODAY, kind: 'nonsense', state: 'done' } })).toEqual(NO_STEP_MEMORY);
  });
});
