import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// «سپاس», phase 2, 2.1: how a colleague would rather be thanked. It is theirs to set, others see it only
// in the list the give form chooses from, and it changes nothing else.

describe('«سپاس»: how a colleague would rather be thanked', () => {
  let admin: Agent;
  let ali: Person;
  let sara: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    ali = await createEmployee(admin, { username: 'pref.ali' });
    sara = await createEmployee(admin, { username: 'pref.sara' });
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  it('starts as «no preference», is set by the colleague, and shows in the wallet', async () => {
    expect((await sara.agent.get('/api/recognitions/wallet').expect(200)).body.preference).toBe('any');
    expect((await sara.agent.put('/api/recognitions/preference').send({ preference: 'private' }).expect(200)).body).toEqual({ preference: 'private' });
    expect((await sara.agent.get('/api/recognitions/wallet').expect(200)).body.preference).toBe('private');
    await sara.agent.put('/api/recognitions/preference').send({ preference: 'secret' }).expect(400);
  });

  it('others see it only beside the colleague in the give form’s list', async () => {
    const list = (await ali.agent.get('/api/recognitions/colleagues').expect(200)).body as { id: string; prefers: string }[];
    expect(list.find((c) => c.id === sara.id)?.prefers).toBe('private');
    expect(list.filter((c) => c.id !== sara.id).every((c) => c.prefers === 'any')).toBe(true);
    // Not on the wall, not in the wallet of anyone else.
    expect((await ali.agent.get('/api/recognitions/wallet').expect(200)).body.preference).toBe('any');
  });

  it('only sets a default: a public recognition still goes to someone who prefers private ones', async () => {
    const sent = await ali.agent
      .post('/api/recognitions')
      .send({ to: sara.id, amount: 1, valueId: 'teamwork', message: 'ممنون که جلسهٔ دیروز را این‌قدر خوب گرداندی.', isPublic: true })
      .expect(201);
    expect(sent.body.id).toBeTruthy();
  });

  it('is out of reach while «سپاس» is off', async () => {
    await admin.put('/api/settings/features/recognition').send({ state: 'off' }).expect(200);
    await sara.agent.put('/api/recognitions/preference').send({ preference: 'public' }).expect(404);
  });
});
