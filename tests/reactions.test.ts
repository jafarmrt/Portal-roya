import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '../server/db/index';
import { pruneReactions } from '../server/routes/reactions';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;
interface Count { emoji: string; count: number; mine: boolean; names: string[] }
interface Intro { id: string; userId: string; reactions: Count[]; wishes: { id: string; reactions: Count[] }[] }

describe('emoji reactions to introductions, welcome messages and greeting cards', () => {
  let admin: Agent;
  let newbie: Person;
  let sara: Person;
  let reza: Person;
  let intro: Intro;

  const intros = async (agent: Agent) => (await agent.get('/api/new_colleagues').expect(200)).body as Intro[];
  const react = (agent: Agent, target: string, id: string, emoji: string) => agent.put('/api/reactions').send({ target, id, emoji });

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    newbie = await createEmployee(admin, { username: 'newbie' });
    sara = await createEmployee(admin, { username: 'sara' });
    reza = await createEmployee(admin, { username: 'reza' });
    await admin.post(`/api/employees/${newbie.id}/introduce`).send({ message: 'خوش آمدی' }).expect(201);
    [intro] = await intros(admin);
  });
  afterAll(() => pool.end());

  it('lets every colleague give one emoji to an introduction, and change or take it back', async () => {
    expect(intro.reactions).toEqual([]);
    expect((await react(sara.agent, 'intro', intro.id, '❤️').expect(200)).body).toEqual([{ emoji: '❤️', count: 1, mine: true, names: ['همکار sara'] }]);
    await react(reza.agent, 'intro', intro.id, '❤️').expect(200);
    await react(sara.agent, 'intro', intro.id, '🎉').expect(200);
    const [seen] = await intros(reza.agent);
    expect(seen.reactions).toEqual([
      { emoji: '❤️', count: 1, mine: true, names: ['همکار reza'] },
      { emoji: '🎉', count: 1, mine: false, names: ['همکار sara'] },
    ]);
    await react(sara.agent, 'intro', intro.id, '').expect(200);
    expect((await intros(sara.agent))[0].reactions).toEqual([{ emoji: '❤️', count: 1, mine: false, names: ['همکار reza'] }]);
    await react(sara.agent, 'intro', intro.id, '🍕').expect(400);
    await react(sara.agent, 'intro', 'nope', '❤️').expect(404);
    await request(app).put('/api/reactions').send({ target: 'intro', id: intro.id, emoji: '❤️' }).expect(401);
  });

  it('lets only the new colleague react to the welcome messages', async () => {
    await sara.agent.post(`/api/new_colleagues/${intro.id}/wishes`).send({ message: 'خیلی خوش آمدی' }).expect(201);
    const wish = (await intros(sara.agent))[0].wishes[0];
    expect(wish.reactions).toEqual([]);
    await react(reza.agent, 'welcome', wish.id, '👍').expect(403);
    await react(newbie.agent, 'welcome', wish.id, '🙏').expect(200);
    expect((await intros(sara.agent))[0].wishes[0].reactions).toMatchObject([{ emoji: '🙏', count: 1, mine: false }]);

    // Removing the message removes its reactions.
    await sara.agent.delete(`/api/colleague_wishes/${wish.id}`).expect(200);
    const { rows } = await pool.query(`select count(*)::int as n from reactions where target_type = 'welcome'`);
    expect(rows[0].n).toBe(0);
  });

  it('lets colleagues react to greeting cards that are not private, but not the one the card is for', async () => {
    await reza.agent.post(`/api/employees/${sara.id}/birthday_wishes`).send({ message: 'تولدت مبارک', isPrivate: false }).expect(201);
    await reza.agent.post(`/api/employees/${sara.id}/birthday_wishes`).send({ message: 'فقط برای تو', isPrivate: true }).expect(201);
    const cards = (await reza.agent.get('/api/birthday_wishes').expect(200)).body[sara.id] as { id: string; isPrivate: boolean; reactions: Count[] }[];
    const open = cards.find((c) => !c.isPrivate)!;
    const closed = cards.find((c) => c.isPrivate)!;

    await react(newbie.agent, 'greeting', open.id, '🎉').expect(200);
    await react(newbie.agent, 'greeting', closed.id, '🎉').expect(404);
    // Sara answers the card with its own reaction, as before.
    await react(sara.agent, 'greeting', open.id, '🎉').expect(400);

    const seen = (await sara.agent.get('/api/birthday_wishes').expect(200)).body[sara.id] as { id: string; reactions: Count[] }[];
    expect(seen.find((c) => c.id === open.id)!.reactions).toMatchObject([{ emoji: '🎉', count: 1, names: ['همکار newbie'] }]);
    expect(seen.find((c) => c.id === closed.id)!.reactions).toEqual([]);
  });

  it('drops the reactions of a removed introduction, also in the nightly clean-up', async () => {
    await pool.query(`insert into reactions (target_type, target_id, user_id, emoji) values ('greeting', '999999', $1, '❤️')`, [sara.id]);
    await admin.delete(`/api/new_colleagues/${intro.id}`).expect(204);
    await pruneReactions();
    const { rows } = await pool.query(`select target_type from reactions order by target_type`);
    expect(rows.map((r) => r.target_type)).toEqual(['greeting']);
  });
});
