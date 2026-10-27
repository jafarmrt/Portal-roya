import request from 'supertest';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import { parseChangelog } from '../server/version';
import { app } from './helpers';

describe('version and what is new', () => {
  it('tells anyone, even before signing in, which version runs', async () => {
    const res = await request(app).get('/api/version').expect(200);
    expect(res.body).toMatchObject({ version: packageJson.version, build: null });
    expect(new Date(res.body.startedAt).getTime()).toBeGreaterThan(0);

    const health = await request(app).get('/healthz');
    expect(health.body.version).toBe(packageJson.version);
  });

  it('lists the changelog newest first, starting with the running version', async () => {
    const res = await request(app).get('/api/version/changelog').expect(200);
    expect(res.body[0].version).toBe(packageJson.version);
    expect(res.body[0].title).not.toBe('');
    expect(res.body[0].items.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(15);
  });

  it('reads titles, items and wrapped lines', () => {
    const entries = parseChangelog(
      '# Changelog\n\n## [2.1.0] - 2026-10-27\n### تازه\n- **اول:** متن\n  ادامه\n- دوم\n\n## [2.0.0] - 2026-10-26\n### امنیت\n- الف\n### داده‌ها\n- ب\n',
    );
    expect(entries).toEqual([
      { version: '2.1.0', date: '2026-10-27', title: 'تازه', items: ['**اول:** متن ادامه', 'دوم'] },
      { version: '2.0.0', date: '2026-10-26', title: 'امنیت، داده‌ها', items: ['الف', 'ب'] },
    ]);
  });
});
