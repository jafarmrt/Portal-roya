import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Journal {
  entries: { idx: number; tag: string; when: number }[];
}

const folder = path.resolve('drizzle');
const journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as Journal;

/**
 * Drizzle applies a migration only when its `when` is later than the last one the database ran. Two
 * branches that each add a migration can merge with the later file carrying the earlier time; the
 * servers that already ran the other one would then skip it without a word.
 */
describe('migrations', () => {
  it('are numbered in order and each has its SQL file', () => {
    const files = readdirSync(folder).filter((f) => f.endsWith('.sql')).sort();
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(files);
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(e.tag.startsWith(String(i).padStart(4, '0'))).toBe(true);
    });
  });

  it('have strictly increasing times, so none is skipped on a server that is already up to date', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const [before, after] = [journal.entries[i - 1], journal.entries[i]];
      expect(after.when, `${after.tag} must be newer than ${before.tag}`).toBeGreaterThan(before.when);
    }
  });
});
