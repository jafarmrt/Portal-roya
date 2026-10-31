import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { aboutMeAnswers, profileCompleteness } from '../shared/aboutMe';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

describe('«دربارهٔ من»', () => {
  let admin: Awaited<ReturnType<typeof setupAdmin>>;
  let sara: Awaited<ReturnType<typeof createEmployee>>;
  let reza: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sara = await createEmployee(admin, { username: 'sara.about' });
    reza = await createEmployee(admin, { username: 'reza.about' });
    // The directory is open to visitors, to check what they get.
    await admin.put('/api/settings').send({ guestAccess: true, guestDirectory: true }).expect(200);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('a colleague answers some questions; empty answers are not kept', async () => {
    const res = await sara.agent
      .patch(`/api/employees/${sara.id}`)
      .send({ aboutMe: { freeTime: '  کوه‌نوردی ', food: '', funFact: 'سه زبان بلدم' } })
      .expect(200);
    expect(res.body.aboutMe).toEqual({ freeTime: 'کوه‌نوردی', funFact: 'سه زبان بلدم' });
  });

  it('colleagues see the answers on the card', async () => {
    const list = (await reza.agent.get('/api/employees').expect(200)).body as { id: string; aboutMe: object }[];
    expect(list.find((e) => e.id === sara.id)?.aboutMe).toEqual({ freeTime: 'کوه‌نوردی', funFact: 'سه زبان بلدم' });
  });

  it('nobody else writes them, not even a user manager', async () => {
    await reza.agent.patch(`/api/employees/${sara.id}`).send({ aboutMe: { food: 'پیتزا' } }).expect(403);
    await admin.patch(`/api/employees/${sara.id}`).send({ aboutMe: { food: 'پیتزا' } }).expect(403);
    // A manager's other edits still go through and leave the answers as they are.
    const res = await admin.patch(`/api/employees/${sara.id}`).send({ extension: '214' }).expect(200);
    expect(res.body.aboutMe.freeTime).toBe('کوه‌نوردی');
  });

  it('refuses unknown questions and long answers', async () => {
    await sara.agent.patch(`/api/employees/${sara.id}`).send({ aboutMe: { secret: 'x' } }).expect(400);
    await sara.agent.patch(`/api/employees/${sara.id}`).send({ aboutMe: { food: 'ق'.repeat(121) } }).expect(400);
  });

  it('visitors do not get them', async () => {
    const list = (await request(app).get('/api/employees').expect(200)).body as { id: string; aboutMe: object }[];
    const card = list.find((e) => e.id === sara.id);
    expect(card).toBeDefined();
    expect(card?.aboutMe).toEqual({});
  });
});

describe('what is missing from one’s card', () => {
  it('counts photo, extension, mobile and at least one answer', () => {
    expect(profileCompleteness({ avatar: '', extension: '', mobile: '', aboutMe: {} })).toEqual({
      percent: 0,
      missing: [
        { key: 'avatar', label: 'عکس' },
        { key: 'extension', label: 'شمارهٔ داخلی' },
        { key: 'mobile', label: 'شمارهٔ همراه' },
        { key: 'aboutMe', label: '«دربارهٔ من»' },
      ],
    });
    expect(profileCompleteness({ avatar: '/uploads/a.png', extension: '214', mobile: '', aboutMe: { food: 'کباب' } }).percent).toBe(75);
    expect(profileCompleteness({ avatar: '/uploads/a.png', extension: '214', mobile: '0912', aboutMe: { food: 'کباب' } }).missing).toEqual([]);
  });

  it('lists answers in the order of the questions, skipping blanks', () => {
    expect(aboutMeAnswers({ funFact: 'الف', freeTime: 'ب', food: ' ' }).map((a) => a.key)).toEqual(['freeTime', 'funFact']);
  });
});
