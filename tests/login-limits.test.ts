import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { pool } from '../server/db/index';
import { parse } from '../server/http';
import { loginLimiters } from '../server/routes/auth';
import { app, resetDatabase, setupAdmin } from './helpers';

// A training session: the whole room signs in at once, often from one address (the office router).
function signInApp(limits: { perAddress: number; perAccount: number }) {
  const limiters = loginLimiters(limits);
  const mini = express();
  mini.use(express.json());
  mini.post('/login', limiters.address, limiters.account, (req, res) => {
    // A sign-in takes a moment (the password check), so many are in flight together.
    setTimeout(() => {
      if (req.body.password === 'right') res.json({ ok: true });
      else res.status(401).json({ error: 'wrong' });
    }, 30);
  });
  return mini;
}

describe('sign-in limits', () => {
  it('lets a whole room sign in at the same moment from one address', async () => {
    const mini = signInApp({ perAddress: 200, perAccount: 5 });
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, i) => request(mini).post('/login').send({ username: `user${i}`, password: 'right' })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(80);
  });

  it('stops one person after their own wrong tries without stopping the colleague next to them', async () => {
    const mini = signInApp({ perAddress: 200, perAccount: 5 });
    for (let i = 0; i < 5; i++) await request(mini).post('/login').send({ username: 'Sara', password: 'typo' }).expect(401);
    // The same person, written differently (capitals, domain), is the same person.
    const blocked = await request(mini).post('/login').send({ username: 'ROYA\\sara', password: 'right' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain('تلاش‌های ورود زیاد');
    await request(mini).post('/login').send({ username: 'ali', password: 'right' }).expect(200);
  });

  it('still stops someone trying many colleagues from one address', async () => {
    const mini = signInApp({ perAddress: 10, perAccount: 5 });
    for (let i = 0; i < 10; i++) await request(mini).post('/login').send({ username: `guess${i}`, password: 'typo' }).expect(401);
    await request(mini).post('/login').send({ username: 'someone.else', password: 'typo' }).expect(429);
  });
});

describe('sign-in and form messages in Persian', () => {
  beforeAll(async () => {
    await resetDatabase();
    await setupAdmin();
  });
  afterAll(() => pool.end());

  it('says the username is in English when the Persian keyboard was on', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'سشقش', password: 'whatever-123' }).expect(400);
    expect(res.body.error).toContain('حروف انگلیسی');
  });

  it("explains zod's own checks in Persian", () => {
    const schema = z.object({ title: z.string().max(5), count: z.number().min(2), kind: z.enum(['a', 'b']), list: z.array(z.string()).max(1) });
    const message = (data: unknown) => {
      try {
        parse(schema, data);
        return '';
      } catch (err) {
        return (err as Error).message;
      }
    };
    expect(message({ title: 'خیلی بلند است', count: 3, kind: 'a', list: [] })).toContain('حداکثر ۵ حرف');
    expect(message({ title: 'کوتاه', count: 1, kind: 'a', list: [] })).toContain('حداقل ۲');
    expect(message({ title: 'کوتاه', count: 3, kind: 'c', list: [] })).toContain('گزینهٔ انتخاب‌شده درست نیست');
    expect(message({ title: 'کوتاه', count: 3, kind: 'a', list: ['x', 'y'] })).toContain('حداکثر ۱ مورد');
    expect(message({ count: 3, kind: 'a', list: [] })).toContain('این فیلد الزامی است');
    expect(message({ title: 'کوتاه', count: 3, kind: 'a', list: [] })).toBe('');
    // A message written on the schema still wins.
    expect(() => parse(z.string().min(3, 'پیام خودم'), 'a')).toThrow('پیام خودم');
  });
});
