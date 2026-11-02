import { describe, expect, it } from 'vitest';
import {
  type BracketMatch,
  bracketSize,
  championOf,
  datesProblem,
  eventPhase,
  firstRoundPairs,
  juryProblem,
  roundName,
  seedOrder,
  settleBracket,
  suggestedDates,
  workdaysBetween,
} from '../shared/specialEvents';
import { jalaliToDate } from '../shared/jalali';

/** A bracket of `entries` (in draw order) with empty later rounds, as the draw writes it. */
function bracket(entries: string[], third = false): BracketMatch[] {
  const pairs = firstRoundPairs(entries);
  const rounds = Math.log2(bracketSize(entries.length));
  const matches: BracketMatch[] = pairs.map(([a, b], slot) => ({ id: `1-${slot}`, round: 1, slot, third: false, entryA: a, entryB: b, winnerId: null, bye: false }));
  for (let round = 2; round <= rounds; round++) {
    for (let slot = 0; slot < 2 ** (rounds - round); slot++) {
      matches.push({ id: `${round}-${slot}`, round, slot, third: false, entryA: null, entryB: null, winnerId: null, bye: false });
    }
  }
  if (third) matches.push({ id: 'third', round: rounds, slot: 1, third: true, entryA: null, entryB: null, winnerId: null, bye: false });
  return matches;
}

/** Applies settleBracket's changes, as the server writes them. */
function apply(matches: BracketMatch[]) {
  for (const c of settleBracket(matches)) Object.assign(matches.find((m) => m.id === c.id)!, c);
  return matches;
}

const win = (matches: BracketMatch[], id: string, side: 'a' | 'b') => {
  const m = matches.find((x) => x.id === id)!;
  m.winnerId = side === 'a' ? m.entryA : m.entryB;
  return apply(matches);
};

describe('knockout brackets of a special event', () => {
  it('seeds so the top two meet only in the final and empty places fall on the top seeds', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(2)).toBe(2);
    // 5 entries: three byes, never two empty places in one match.
    const pairs = firstRoundPairs(['a', 'b', 'c', 'd', 'e']);
    expect(pairs).toHaveLength(4);
    expect(pairs.every(([x, y]) => x !== null || y !== null)).toBe(true);
    expect(pairs.filter(([x, y]) => x === null || y === null)).toHaveLength(3);
    expect(roundName(3, 3)).toBe('فینال');
    expect(roundName(2, 3)).toBe('نیمه‌نهایی');
    expect(roundName(1, 3)).toBe('یک‌چهارم');
  });

  it('sends a lone entry through an empty place and fills the next round from the winners', () => {
    const m = apply(bracket(['a', 'b', 'c', 'd', 'e', 'f']));
    // 6 entries in 8 places: seeds 1 and 2 (a, b) go through without playing.
    const byes = m.filter((x) => x.bye);
    expect(byes.map((x) => x.winnerId).sort()).toEqual(['a', 'b']);
    // Semi-final 0 already has a on one side.
    expect(m.find((x) => x.id === '2-0')!.entryA).toBe('a');
    win(m, '1-1', 'a'); // d vs e → d
    expect(m.find((x) => x.id === '2-0')).toMatchObject({ entryA: 'a', entryB: 'd' });
  });

  it('clears later results when an earlier winner is corrected', () => {
    const m = apply(bracket(['a', 'b', 'c', 'd']));
    win(m, '1-0', 'a'); // a vs d → a
    win(m, '1-1', 'a'); // b vs c → b
    win(m, '2-0', 'a'); // final: a wins
    expect(championOf(m)).toBe('a');
    // The jury corrects the first match: d won.
    m.find((x) => x.id === '1-0')!.winnerId = 'd';
    const changes = settleBracket(m);
    const final = changes.find((c) => c.id === '2-0')!;
    expect(final).toMatchObject({ entryA: 'd', entryB: 'b', winnerId: null, cleared: true });
    apply(m);
    expect(championOf(m)).toBeNull();
  });

  it('puts the two semi-final losers in the match for third place', () => {
    const m = apply(bracket(['a', 'b', 'c', 'd'], true));
    win(m, '1-0', 'b'); // a vs d → d
    win(m, '1-1', 'a'); // b vs c → b
    expect(m.find((x) => x.id === 'third')).toMatchObject({ entryA: 'a', entryB: 'c' });
  });

  it('settles nothing twice', () => {
    const m = apply(bracket(['a', 'b', 'c']));
    expect(settleBracket(m)).toEqual([]);
  });
});

describe('the dates and jury of a special event', () => {
  it('suggests signup until three days before and the page until two days after', () => {
    expect(suggestedDates('1405/09/30')).toEqual({ signupEnd: '1405/09/27', showUntil: '1405/10/02' });
    expect(datesProblem({ programDate: '1405/09/30', programTime: '15:00', signupEnd: '1405/09/30', showUntil: '1405/10/02' })).toBeTruthy();
    expect(datesProblem({ programDate: '1405/09/30', programTime: '15:00', signupEnd: '1405/09/27', showUntil: '1405/10/02' })).toBeNull();
  });

  it('counts working days without Thursday and Friday', () => {
    // A whole week always has exactly five working days.
    expect(workdaysBetween('1405/09/23', '1405/09/29')).toBe(5);
    const weekday = jalaliToDate('1405/09/23')!.getDay();
    const days = workdaysBetween('1405/09/23', '1405/09/29');
    expect(days).toBe(7 - [0, 1, 2, 3, 4, 5, 6].map((i) => (weekday + i) % 7).filter((d) => d === 4 || d === 5).length);
  });

  it('moves through the phases with the calendar', () => {
    const dates = { programDate: '1405/09/30', programTime: '15:00', signupEnd: '1405/09/27', showUntil: '1405/10/02' };
    const at = (day: string, time = '12:00') => jalaliToDate(day, time)!;
    expect(eventPhase(dates, at('1405/09/25'))).toBe('signup');
    expect(eventPhase(dates, at('1405/09/27', '23:00'))).toBe('signup');
    expect(eventPhase(dates, at('1405/09/28'))).toBe('brackets');
    expect(eventPhase(dates, at('1405/09/30', '10:00'))).toBe('matchday');
    expect(eventPhase(dates, at('1405/09/30', '15:00'))).toBe('live');
    expect(eventPhase(dates, at('1405/10/02'))).toBe('memories');
    expect(eventPhase(dates, at('1405/10/03'))).toBe('ended');
  });

  it('wants an odd jury of three or five with a head among them', () => {
    expect(juryProblem([], null)).toBeNull();
    expect(juryProblem(['a', 'b'], 'a')).toBeTruthy();
    expect(juryProblem(['a', 'b', 'c', 'd'], 'a')).toBeTruthy();
    expect(juryProblem(['a', 'b', 'c'], 'x')).toBeTruthy();
    expect(juryProblem(['a', 'b', 'c'], 'b')).toBeNull();
    expect(juryProblem(['a', 'b', 'c', 'd', 'e'], 'e')).toBeNull();
  });
});
