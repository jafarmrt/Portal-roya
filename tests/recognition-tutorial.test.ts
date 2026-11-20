import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { employees, recognitions, settings } from '../server/db/schema';
import { DEFAULT_RECOGNITION_VALUES, recognitionMonth, recognitionValues } from '../shared/recognition';
import { cleanTutorial, withTutorialChange } from '../shared/recognitionTutorial';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

// «سپاس», stage 6b: the tutorials' progress (kept per colleague on the server), the five missions read
// from what the colleague did, and the values' descriptions.

const MESSAGE = 'ممنون که دیروز تا دیروقت برای تحویل نقشه‌ها ماندی.';

let seq = 0;
const row = (fromId: string, toId: string, extra: Partial<typeof recognitions.$inferInsert> = {}) => {
  const at = new Date(Date.now() - 60 * 60 * 1000);
  return {
    id: `tut-${++seq}`,
    fromId,
    toId,
    amount: 2,
    month: recognitionMonth(at),
    valueId: 'teamwork',
    valueLabel: 'همکاری',
    valueTone: 'sage',
    message: MESSAGE,
    isPublic: true,
    deliverAt: at,
    deliveredAt: at,
    createdAt: at,
    ...extra,
  };
};

describe('«سپاس»: tutorials, missions and value descriptions', () => {
  let admin: Agent;
  let ali: Person;
  let sara: Person;
  let reza: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    ali = await createEmployee(admin, { username: 'tut.ali' });
    sara = await createEmployee(admin, { username: 'tut.sara' });
    reza = await createEmployee(admin, { username: 'tut.reza' });
    await db.update(employees).set({ createdAt: new Date('2020-01-01T08:00:00Z') });
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
  });
  afterAll(() => pool.end());

  it('starts with nothing done, and keeps each step on the server so another device carries on from it', async () => {
    expect((await ali.agent.get('/api/recognitions/tutorial').expect(200)).body).toEqual({
      progress: {},
      missions: { sent: false, opened: false, joined: false, reacted: false, twoValues: false },
    });
    await ali.agent.put('/api/recognitions/tutorial').send({ main: { state: 'active', step: 4 } }).expect(200);
    // The same colleague on the phone: one more step, and the short tour of a first recognition.
    const phone = await ali.agent.put('/api/recognitions/tutorial').send({ received: 'done' }).expect(200);
    expect(phone.body.progress).toEqual({ main: { state: 'active', step: 4 }, received: 'done' });
    await ali.agent.put('/api/recognitions/tutorial').send({ missions: { hidden: true } }).expect(200);
    await ali.agent.put('/api/recognitions/tutorial').send({ missions: { celebrated: true } }).expect(200);
    expect((await ali.agent.get('/api/recognitions/tutorial').expect(200)).body.progress).toEqual({
      main: { state: 'active', step: 4 },
      received: 'done',
      missions: { hidden: true, celebrated: true },
    });
    // Each colleague has their own.
    expect((await sara.agent.get('/api/recognitions/tutorial').expect(200)).body.progress).toEqual({});
  });

  it('refuses a step that does not exist', async () => {
    await ali.agent.put('/api/recognitions/tutorial').send({ main: { state: 'active', step: 40 } }).expect(400);
    await ali.agent.put('/api/recognitions/tutorial').send({ main: { state: 'halfway', step: 1 } }).expect(400);
    await ali.agent.put('/api/recognitions/tutorial').send({ owner: 'maybe' }).expect(400);
  });

  it('keeps only the known parts of what is stored', () => {
    expect(cleanTutorial({ main: { state: 'done', step: 99 }, received: 'x', other: 1 })).toEqual({ main: { state: 'done', step: 12 } });
    expect(cleanTutorial(null)).toEqual({});
    expect(withTutorialChange({ main: { state: 'active', step: 3 }, missions: { hidden: true } }, { missions: { celebrated: true } })).toEqual({
      main: { state: 'active', step: 3 },
      missions: { hidden: true, celebrated: true },
    });
  });

  it('ticks the missions from what the colleague did before, the tutorial or not', async () => {
    // Sara sent one whose minutes for taking it back are still running: not yet «sent».
    const soon = new Date(Date.now() + 3 * 60 * 1000);
    await db.insert(recognitions).values(row(sara.id, ali.id, { deliverAt: soon, deliveredAt: null }));
    expect((await sara.agent.get('/api/recognitions/tutorial').expect(200)).body.missions).toMatchObject({ sent: false, twoValues: false });
    // One taken back counts for nothing; one handed over does.
    await db.insert(recognitions).values(row(sara.id, ali.id, { valueId: 'learning', withdrawnAt: new Date() }));
    expect((await sara.agent.get('/api/recognitions/tutorial').expect(200)).body.missions).toMatchObject({ sent: false, twoValues: false });
    const delivered = row(sara.id, reza.id, { valueId: 'ownership', valueLabel: 'مسئولیت‌پذیری' });
    await db.insert(recognitions).values(delivered);
    expect((await sara.agent.get('/api/recognitions/tutorial').expect(200)).body.missions).toEqual({
      sent: true,
      opened: false,
      joined: false,
      reacted: false,
      twoValues: true,
    });

    // Reza opens it, adds «من هم» to another card and reacts to one on the wall.
    await reza.agent.post(`/api/recognitions/${delivered.id}/open`).expect(200);
    const onWall = row(ali.id, sara.id);
    await db.insert(recognitions).values(onWall);
    await reza.agent.post(`/api/recognitions/${onWall.id}/join`).expect(201);
    await reza.agent.put('/api/reactions').send({ target: 'recognition', id: onWall.id, emoji: '👍' }).expect(200);
    expect((await reza.agent.get('/api/recognitions/tutorial').expect(200)).body.missions).toEqual({
      sent: false,
      opened: true,
      joined: true,
      reacted: true,
      twoValues: false,
    });
  });

  it('gives every value a description the owner writes, shown with the wallet', async () => {
    // The five samples come with theirs.
    const wallet = (await ali.agent.get('/api/recognitions/wallet').expect(200)).body;
    expect(wallet.values).toEqual(DEFAULT_RECOGNITION_VALUES);
    expect(wallet.values[0]).toMatchObject({ label: 'همکاری', description: 'کار را همراه دیگران پیش برد، نه تنها.' });
    // The whole month's allowance, for telling a colleague who joined this month apart.
    expect(wallet.rules).toMatchObject({ allowance: 50 });

    const role = (await admin.post('/api/roles').send({ name: 'مسئول سپاس', description: '', permissions: ['recognition.manage'] }).expect(201)).body;
    await db.update(employees).set({ role: role.id }).where(eq(employees.id, reza.id));
    const values = [
      { id: 'teamwork', label: 'همکاری', tone: 'sage', description: '  با هم، نه تنها.  ' },
      { id: 'quality', label: 'کیفیت', tone: 'plum', description: '' },
    ];
    const saved = (await reza.agent.put('/api/settings/recognition').send({ values }).expect(200)).body;
    expect(saved.values).toEqual([
      { id: 'teamwork', label: 'همکاری', tone: 'sage', description: 'با هم، نه تنها.' },
      { id: 'quality', label: 'کیفیت', tone: 'plum', description: '' },
    ]);
    expect((await ali.agent.get('/api/recognitions/wallet').expect(200)).body.values[1]).toEqual({ id: 'quality', label: 'کیفیت', tone: 'plum', description: '' });
    // Too long is refused.
    const long = (await reza.agent.put('/api/settings/recognition').send({ values: [{ ...values[1], description: 'ا'.repeat(121) }] }).expect(400)).body;
    expect(long.error).toContain('۱۲۰');
    // «پنج ارزش نمونه» brings the samples back with their lines.
    expect((await reza.agent.put('/api/settings/recognition').send({ values: DEFAULT_RECOGNITION_VALUES }).expect(200)).body.values).toEqual(DEFAULT_RECOGNITION_VALUES);
  });

  it('gives values saved before descriptions existed the sample line when their name is a sample’s', async () => {
    await db
      .update(settings)
      .set({
        recognitionValues: [
          { id: 'teamwork', label: 'همکاری', tone: 'sage' },
          { id: 'quality', label: 'کیفیت', tone: 'plum' },
          { id: 'ownership', label: 'مسئولیت‌پذیری', tone: 'crimson', description: '' },
        ],
      })
      .where(eq(settings.id, 'global'));
    expect((await ali.agent.get('/api/recognitions/wallet').expect(200)).body.values).toEqual([
      { id: 'teamwork', label: 'همکاری', tone: 'sage', description: 'کار را همراه دیگران پیش برد، نه تنها.' },
      { id: 'quality', label: 'کیفیت', tone: 'plum', description: '' },
      // Emptied on purpose by the owner: stays empty.
      { id: 'ownership', label: 'مسئولیت‌پذیری', tone: 'crimson', description: '' },
    ]);
    expect(recognitionValues([])).toBe(DEFAULT_RECOGNITION_VALUES);
  });

  it('keeps the tutorial in reach of the programme’s owner while «سپاس» is hidden from them', async () => {
    await admin.put('/api/settings/features/recognition').send({ state: 'off' }).expect(200);
    await reza.agent.put('/api/recognitions/tutorial').send({ owner: 'done' }).expect(200);
    expect((await reza.agent.get('/api/recognitions/tutorial').expect(200)).body.progress).toMatchObject({ owner: 'done' });
    await ali.agent.put('/api/recognitions/tutorial').send({ owner: 'done' }).expect(404);
    await admin.put('/api/settings/features/recognition').send({ state: 'on' }).expect(200);
  });

  it('says why a limit is there, in the same words the page uses', async () => {
    const give = (to: string, extra: object = {}) =>
      ali.agent.post('/api/recognitions').send({ to, amount: 20, valueId: 'teamwork', message: MESSAGE, isPublic: true, ...extra });
    expect((await give(reza.id, { message: 'ممنون' }).expect(400)).body.error).toBe('کمی بیشتر بنویسید: دست‌کم ۱۵ حرف، تا همکار tut.reza بداند برای چه کاری از او قدردانی کردید.');
    await give(reza.id).expect(201);
    expect((await give(reza.id, { amount: 1, message: `${MESSAGE} دوباره.` }).expect(400)).body.error).toContain('سقف ماهانه است («من هم» هم حساب می‌شود)');
  });
});
