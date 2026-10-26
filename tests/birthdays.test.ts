import moment from 'moment-jalaali';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { announceBirthdays, birthdayKeysFor } from '../server/scheduler';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

interface Profile {
  id: string;
  birthDate: string;
  birthDay: string;
}

const find = (list: Profile[], id: string) => list.find((e) => e.id === id)!;

async function notificationsOf(agent: Agent) {
  return (await agent.get('/api/notifications').expect(200)).body as { title: string; type: string }[];
}

describe('birthdays and new colleagues', () => {
  let admin: Agent;
  let sara: Person;
  let reza: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sara = await createEmployee(admin, { username: 'sara' });
    reza = await createEmployee(admin, { username: 'reza' });
    await admin.patch(`/api/employees/${sara.id}`).send({ birthDate: '1370/05/12' }).expect(200);
  });
  afterAll(() => pool.end());

  it('shows the birth year only to the colleague and user managers', async () => {
    const own = await sara.agent.get('/api/auth/me').expect(200);
    expect(own.body.user.birthDate).toBe('1370/05/12');
    expect(own.body.user.birthDay).toBe('05/12');

    const seenByReza = find((await reza.agent.get('/api/employees').expect(200)).body, sara.id);
    expect(seenByReza.birthDate).toBe('');
    expect(seenByReza.birthDay).toBe('05/12');

    const seenByAdmin = find((await admin.get('/api/employees').expect(200)).body, sara.id);
    expect(seenByAdmin.birthDate).toBe('1370/05/12');
  });

  it('lets a colleague hide their birthday', async () => {
    await sara.agent.patch(`/api/employees/${sara.id}`).send({ hideBirthday: true }).expect(200);
    const seenByReza = find((await reza.agent.get('/api/employees').expect(200)).body, sara.id);
    expect(seenByReza.birthDay).toBe('');
    await reza.agent.post(`/api/employees/${sara.id}/birthday_wishes`).send({ message: 'تولدت مبارک' }).expect(403);
    const own = await sara.agent.get('/api/auth/me').expect(200);
    expect(own.body.user.birthDay).toBe('05/12');
    expect(own.body.user.hideBirthday).toBe(true);
    await sara.agent.patch(`/api/employees/${sara.id}`).send({ hideBirthday: false }).expect(200);
  });

  it('never shows birthdays to guests, even with the directory open', async () => {
    await admin.put('/api/settings').send({ guestDirectory: true }).expect(200);
    const guestView = find((await request(app).get('/api/employees').expect(200)).body, sara.id);
    expect(guestView.birthDate).toBe('');
    expect(guestView.birthDay).toBe('');
    expect((await request(app).get('/api/birthday_wishes').expect(200)).body).toEqual({});
    await admin.put('/api/settings').send({ guestDirectory: false }).expect(200);
  });

  it('introduces an existing colleague, and lets a manager edit or remove the card', async () => {
    await reza.agent.post(`/api/employees/${sara.id}/introduce`).send({}).expect(403);
    await admin.post(`/api/employees/${sara.id}/introduce`).send({ message: 'به تیم خوش آمدی', joinDate: '1405/08/01' }).expect(201);
    await admin.post(`/api/employees/${sara.id}/introduce`).send({}).expect(409);

    const cards = (await reza.agent.get('/api/new_colleagues').expect(200)).body;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ userId: sara.id, welcomeMessage: 'به تیم خوش آمدی', joinDate: '1405/08/01' });
    expect((await notificationsOf(reza.agent)).some((n) => n.type === 'welcome')).toBe(true);

    await reza.agent.patch(`/api/new_colleagues/${cards[0].id}`).send({ welcomeMessage: 'x' }).expect(403);
    await admin.patch(`/api/new_colleagues/${cards[0].id}`).send({ welcomeMessage: 'متن تازه' }).expect(200);
    expect((await admin.get('/api/new_colleagues').expect(200)).body[0].welcomeMessage).toBe('متن تازه');

    await admin.delete(`/api/new_colleagues/${cards[0].id}`).expect(204);
    expect((await admin.get('/api/new_colleagues').expect(200)).body).toEqual([]);
  });

  it('introduces imported colleagues only when asked, with one combined notification', async () => {
    const before = (await notificationsOf(reza.agent)).length;
    await admin
      .post('/api/employees/import')
      .send({ rows: [{ firstName: 'قدیمی', lastName: 'یک', username: 'old.one', position: 'کارشناس', department: 'فروش' }] })
      .expect(201);
    expect((await admin.get('/api/new_colleagues').expect(200)).body).toEqual([]);

    await admin
      .post('/api/employees/import')
      .send({
        introduce: true,
        rows: [
          { firstName: 'تازه', lastName: 'یک', username: 'new.one', position: 'کارشناس', department: 'فروش' },
          { firstName: 'تازه', lastName: 'دو', username: 'new.two', position: 'کارشناس', department: 'فروش', hireDate: '1405/07/20' },
        ],
      })
      .expect(201);
    const cards = (await admin.get('/api/new_colleagues').expect(200)).body;
    expect(cards).toHaveLength(2);
    expect((await notificationsOf(reza.agent)).length).toBe(before + 1);

    const list = (await admin.get('/api/employees').expect(200)).body as { username: string; hireDate: string }[];
    // A blank hire date stays blank instead of becoming the import day.
    expect(list.find((e) => e.username === 'new.one')!.hireDate).toBe('');
    expect(list.find((e) => e.username === 'new.two')!.hireDate).toBe('1405/07/20');
  });

  it('announces a birthday once, in the morning, and skips hidden birthdays', async () => {
    const morning = moment().hour(9).minute(0).toDate();
    const early = moment().hour(6).minute(0).toDate();
    const todayKey = moment(morning).format('jMM/jDD');
    await admin.patch(`/api/employees/${sara.id}`).send({ birthDate: `1368/${todayKey}` }).expect(200);
    await admin.patch(`/api/employees/${reza.id}`).send({ birthDate: `1372/${todayKey}`, hideBirthday: true }).expect(200);

    expect(await announceBirthdays(early)).toBe(0);
    expect(await announceBirthdays(morning)).toBe(1);
    expect(await announceBirthdays(morning)).toBe(0);

    expect((await notificationsOf(sara.agent)).some((n) => n.title.includes('تولدتان مبارک'))).toBe(true);
    expect((await notificationsOf(admin)).some((n) => n.type === 'birthday')).toBe(true);
    expect((await notificationsOf(reza.agent)).some((n) => n.title.includes('تولدتان مبارک'))).toBe(false);
  });

  it('celebrates Esfand 30 birthdays on the 29th in common years', () => {
    // 1403 is a leap year, 1404 is not.
    expect(birthdayKeysFor(moment('1404/12/29', 'jYYYY/jMM/jDD').toDate())).toEqual(['12/29', '12/30']);
    expect(birthdayKeysFor(moment('1403/12/29', 'jYYYY/jMM/jDD').toDate())).toEqual(['12/29']);
  });
});
