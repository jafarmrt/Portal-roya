import { describe, expect, it } from 'vitest';
import {
  type LeagueResult,
  cleanWords,
  formatRankValue,
  leagueTable,
  parseRankTime,
  rankingTable,
  roundRobin,
  tableChampion,
} from '../shared/specialEvents';

const result = (entryA: string, entryB: string, scoreA: number, scoreB: number): LeagueResult => ({
  entryA,
  entryB,
  scoreA,
  scoreB,
  winnerId: scoreA > scoreB ? entryA : scoreB > scoreA ? entryB : null,
  done: true,
});

describe('points tables and rankings of a special event', () => {
  it('pairs everyone with everyone exactly once, one match each per round', () => {
    for (const n of [2, 3, 4, 5, 8, 10]) {
      const ids = Array.from({ length: n }, (_, i) => `e${i}`);
      const rounds = roundRobin(ids);
      expect(rounds).toHaveLength(n % 2 === 0 ? n - 1 : n);
      const seen = new Set<string>();
      for (const pairs of rounds) {
        const inRound = pairs.flat();
        expect(new Set(inRound).size).toBe(inRound.length);
        for (const [a, b] of pairs) seen.add([a, b].sort().join('|'));
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    }
  });

  it('ranks a points table by points, goal difference, goals, then the matches between those level', () => {
    const table = leagueTable(['a', 'b', 'c', 'd'], [
      result('a', 'b', 2, 0),
      result('c', 'd', 1, 1),
      result('a', 'c', 0, 1),
      result('b', 'd', 3, 0),
      { entryA: 'a', entryB: 'd', scoreA: null, scoreB: null, winnerId: null, done: false },
    ]);
    // c: 4 pts; a and b 3 pts and +1 each, b scored more (3 to 2); d: 1 pt.
    expect(table.map((r) => r.entryId)).toEqual(['c', 'b', 'a', 'd']);
    expect(table.find((r) => r.entryId === 'c')).toMatchObject({ points: 4, won: 1, drawn: 1, played: 2 });
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);

    // Level on points, difference and goals: the match between them decides.
    const h2h = leagueTable(['x', 'y', 'z'], [result('x', 'y', 1, 0), result('y', 'z', 1, 0), result('z', 'x', 1, 0)]);
    expect(h2h.map((r) => r.rank)).toEqual([1, 1, 1]);
    const decided = leagueTable(['x', 'y'], [result('y', 'x', 2, 1), result('x', 'y', 2, 1)]);
    expect(decided.map((r) => r.rank)).toEqual([1, 1]);
    const twoOfThree = leagueTable(['p', 'q', 'r'], [result('p', 'q', 1, 0), result('q', 'r', 2, 0), result('r', 'p', 1, 0)]);
    // q: 3 pts, +1; p: 3 pts, 0; r: 3 pts, -1.
    expect(twoOfThree.map((r) => r.entryId)).toEqual(['q', 'p', 'r']);
  });

  it('crowns the first of a finished table, or waits for a pick when first place is shared', () => {
    const rows = [
      { entryId: 'a', rank: 1 },
      { entryId: 'b', rank: 1 },
      { entryId: 'c', rank: 3 },
    ];
    expect(tableChampion(rows, false, null)).toEqual({ champion: null, tie: [] });
    expect(tableChampion(rows, true, null)).toEqual({ champion: null, tie: ['a', 'b'] });
    expect(tableChampion(rows, true, 'b')).toEqual({ champion: 'b', tie: [] });
    expect(tableChampion(rows, true, 'c')).toEqual({ champion: null, tie: ['a', 'b'] });
    expect(tableChampion([{ entryId: 'a', rank: 1 }, { entryId: 'b', rank: 2 }], true, null)).toEqual({ champion: 'a', tie: [] });
  });

  it('ranks performances by the best score or the shortest time, absent ones last', () => {
    const perf = [
      { entryId: 'a', value: 40, done: true },
      { entryId: 'b', value: 55, done: true },
      { entryId: 'c', value: 40, done: true },
      { entryId: 'd', value: null, done: true },
      { entryId: 'e', value: null, done: false },
    ];
    expect(rankingTable(perf, 'high').map((r) => [r.entryId, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', null],
      ['e', null],
    ]);
    expect(rankingTable(perf, 'time').map((r) => r.entryId).slice(0, 3)).toEqual(['a', 'c', 'b']);
    expect(rankingTable(perf, 'high')[3].absent).toBe(true);
  });

  it('reads and writes times in tenths of a second, in Persian or Latin digits', () => {
    expect(parseRankTime('1:05.3')).toBe(653);
    expect(parseRankTime('۱:۰۵٫۳')).toBe(653);
    expect(parseRankTime('65')).toBe(650);
    expect(parseRankTime('12.7')).toBe(127);
    expect(parseRankTime('1:75')).toBeNull();
    expect(parseRankTime('abc')).toBeNull();
    expect(formatRankValue(653, 'time')).toBe('۱:۰۵٫۳');
    expect(formatRankValue(127, 'time')).toBe('۱۲٫۷');
    expect(formatRankValue(42, 'high')).toBe('۴۲');
  });

  it('keeps one copy of each pantomime word', () => {
    expect(cleanWords(' شب یلدا \n\nانار\nانار\n  هندوانه  ')).toEqual(['شب یلدا', 'انار', 'هندوانه']);
  });
});
