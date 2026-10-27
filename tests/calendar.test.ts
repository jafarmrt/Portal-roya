import { and, eq } from 'drizzle-orm';
import moment from 'moment-jalaali';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentJalaliYear } from '../shared/jalali';
import { db, pool } from '../server/db/index';
import { calendarEvents, employees, notifications } from '../server/db/schema';
import { eventToIcs, foldLine } from '../server/ics';
import { processEventReminders } from '../server/routes/calendar';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;
interface CalendarEvent {
  id: string;
  title: string;
  forMe: boolean;
  rsvp: boolean;
  myRsvp: boolean | null;
  going?: number;
  notGoing?: number;
  audienceCount?: number;
}

const NEXT_YEAR = currentJalaliYear() + 1;
const meeting = { title: 'جلسهٔ فروش فصل', date: `${NEXT_YEAR}/02/10`, type: 'meeting', time: '10:00', endTime: '11:30', location: 'اتاق جلسات' };

const eventsOf = async (agent: Agent) => (await agent.get('/api/calendar_events').expect(200)).body as CalendarEvent[];
const notificationsOf = async (userId: string, eventId?: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'calendar'), ...(eventId ? [eq(notifications.linkId, eventId)] : [])));

describe('calendar files', () => {
  it('folds long lines at 75 bytes without breaking Persian letters', () => {
    const line = `SUMMARY:${'جلسهٔ هماهنگی واحد فروش و انبار '.repeat(5)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('turns the Jalali date and Tehran time into an event Outlook understands', () => {
    const ics = eventToIcs({ id: 'evt1', title: 'جشن نوروز; کارکنان', date: '1405/01/01', time: '10:00', endTime: '12:30', location: 'سالن', url: 'http://portal/#calendar/evt1' });
    expect(ics).toContain('DTSTART;TZID=Asia/Tehran:20260321T100000');
    expect(ics).toContain('DTEND;TZID=Asia/Tehran:20260321T123000');
    expect(ics).toContain('SUMMARY:جشن نوروز\\; کارکنان');
    expect(ics).toContain('TZOFFSETTO:+0330');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);

    const allDay = eventToIcs({ id: 'evt2', title: 'تعطیلی', date: '1405/08/20' });
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261111');
    expect(allDay).toContain('DTEND;VALUE=DATE:20261112');
    expect(allDay).not.toContain('VTIMEZONE');
  });
});

describe('calendar events with an audience, notifications and attendance', () => {
  let admin: Agent;
  let sales: Person;
  let sales2: Person;
  let design: Person;
  let adminId: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    sales = await createEmployee(admin, { username: 'cal.sales', department: 'فروش' });
    sales2 = await createEmployee(admin, { username: 'cal.sales2', department: 'فروش' });
    design = await createEmployee(admin, { username: 'cal.design', department: 'طراحی' });
    [{ id: adminId }] = await db.select({ id: employees.id }).from(employees).where(eq(employees.username, 'admin'));
  });
  afterAll(() => pool.end());

  it('shows an event only to its audience and tells them about it', async () => {
    const event = (await admin.post('/api/calendar_events').send({ ...meeting, targetDepartments: ['فروش'] }).expect(201)).body as CalendarEvent;
    expect((await eventsOf(sales.agent)).map((e) => e.id)).toContain(event.id);
    expect((await eventsOf(design.agent)).map((e) => e.id)).not.toContain(event.id);
    expect((await eventsOf(admin)).find((e) => e.id === event.id)).toMatchObject({ forMe: false });

    const [note] = await notificationsOf(sales.id, event.id);
    expect(note.message).toContain('ساعت ۱۰:۰۰ تا ۱۱:۳۰');
    expect(note.message).toContain('اتاق جلسات');
    expect(await notificationsOf(design.id, event.id)).toHaveLength(0);
    expect(await notificationsOf(adminId, event.id)).toHaveLength(0);

    // Without notifications, or for a day that has passed, nobody is told.
    const quiet = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'بی‌صدا', notify: false }).expect(201)).body;
    const past = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'گذشته', date: '1400/01/15' }).expect(201)).body;
    expect(await notificationsOf(sales.id, quiet.id)).toHaveLength(0);
    expect(await notificationsOf(sales.id, past.id)).toHaveLength(0);
  });

  it('checks the hours and the audience', async () => {
    await admin.post('/api/calendar_events').send({ ...meeting, endTime: '09:00' }).expect(400);
    await admin.post('/api/calendar_events').send({ ...meeting, time: '', endTime: '11:00' }).expect(400);
    await admin.post('/api/calendar_events').send({ ...meeting, time: '25:00' }).expect(400);
    await admin.post('/api/calendar_events').send({ ...meeting, targetDepartments: ['ناموجود'] }).expect(400);
    await sales.agent.post('/api/calendar_events').send(meeting).expect(403);
  });

  it('tells the audience when an event moves or is cancelled', async () => {
    const event = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'جلسهٔ بودجه', targetDepartments: ['فروش'] }).expect(201)).body;
    await admin.put(`/api/calendar_events/${event.id}`).send({ ...meeting, title: 'جلسهٔ بودجه', location: 'سالن', targetDepartments: ['فروش'] }).expect(200);
    expect(await notificationsOf(sales.id, event.id)).toHaveLength(1);

    await admin.put(`/api/calendar_events/${event.id}`).send({ ...meeting, title: 'جلسهٔ بودجه', time: '14:00', endTime: '', targetDepartments: ['فروش'] }).expect(200);
    const moved = await notificationsOf(sales.id, event.id);
    expect(moved.map((n) => n.title)).toContain('تغییر زمان جلسه 📅');

    await admin.delete(`/api/calendar_events/${event.id}`).expect(200);
    const cancelled = (await notificationsOf(sales.id)).filter((n) => n.title === 'جلسه لغو شد');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].message).toContain('جلسهٔ بودجه');
  });

  it('counts who is coming; colleagues may change their answer', async () => {
    const event = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'جشن پایان سال', type: 'event', rsvp: true, targetDepartments: ['فروش'] }).expect(201)).body;
    const rsvp = (agent: Agent, attending: boolean) => agent.post(`/api/calendar_events/${event.id}/rsvp`).send({ attending });

    expect((await rsvp(sales.agent, true).expect(200)).body).toMatchObject({ myRsvp: true, going: 1, notGoing: 0 });
    await rsvp(sales2.agent, true).expect(200);
    expect((await rsvp(sales2.agent, false).expect(200)).body).toMatchObject({ myRsvp: false, going: 1, notGoing: 1 });
    await rsvp(design.agent, true).expect(404);
    // Poll-like counts for colleagues, names for the calendar managers.
    const seen = (await eventsOf(sales.agent)).find((e) => e.id === event.id)!;
    expect(seen).toMatchObject({ going: 1, notGoing: 1 });
    expect(seen.audienceCount).toBeUndefined();
    expect((await eventsOf(admin)).find((e) => e.id === event.id)?.audienceCount).toBe(2);
    const list = (await admin.get(`/api/calendar_events/${event.id}/rsvps`).expect(200)).body as { id: string; attending: boolean | null }[];
    expect(list.map((r) => [r.id, r.attending]).sort()).toEqual([[sales.id, true], [sales2.id, false]].sort());
    await sales.agent.get(`/api/calendar_events/${event.id}/rsvps`).expect(403);

    const plain = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'بدون اعلام حضور' }).expect(201)).body;
    await sales.agent.post(`/api/calendar_events/${plain.id}/rsvp`).send({ attending: true }).expect(400);
    await db.update(calendarEvents).set({ date: '1400/01/01' }).where(eq(calendarEvents.id, event.id));
    await rsvp(sales.agent, false).expect(400);
  });

  it('reminds the day before, except those who are not coming', async () => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    const tomorrow = moment(now).add(1, 'day').format('jYYYY/jMM/jDD');
    const event = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'بازدید از کارخانه', date: tomorrow, rsvp: true, targetDepartments: ['فروش'] }).expect(201)).body;
    const fresh = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'تازه', date: tomorrow, targetDepartments: ['فروش'] }).expect(201)).body;
    await db.update(calendarEvents).set({ createdAt: new Date(now.getTime() - 3 * 24 * 3600_000) }).where(eq(calendarEvents.id, event.id));
    await sales2.agent.post(`/api/calendar_events/${event.id}/rsvp`).send({ attending: false }).expect(200);

    const early = new Date(now);
    early.setHours(6);
    expect(await processEventReminders(early)).toBe(0);
    expect(await processEventReminders(now)).toBe(1);
    expect(await processEventReminders(now)).toBe(0);

    const reminded = (id: string, eventId: string) => notificationsOf(id, eventId).then((rows) => rows.filter((n) => n.title.startsWith('یادآوری')));
    expect(await reminded(sales.id, event.id)).toHaveLength(1);
    expect(await reminded(sales2.id, event.id)).toHaveLength(0);
    // Added today: the announcement was the reminder.
    expect(await reminded(sales.id, fresh.id)).toHaveLength(0);
  });

  it('downloads an event for Outlook', async () => {
    const event = (await admin.post('/api/calendar_events').send({ ...meeting, title: 'جلسهٔ فروش/بازاریابی', targetDepartments: ['فروش'] }).expect(201)).body;
    const res = await sales.agent.get(`/api/calendar_events/${event.id}/ics`).expect(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('.ics');
    const unfolded = res.text.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:جلسهٔ فروش/بازاریابی');
    expect(unfolded).toContain(`URL:http://localhost:3000/#calendar/${event.id}`);
    await design.agent.get(`/api/calendar_events/${event.id}/ics`).expect(404);
    // Visitors only get events meant for everyone.
    await request(app).get(`/api/calendar_events/${event.id}/ics`).expect(404);
  });
});
