import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { pushSubscriptions, settings } from '../server/db/schema';
import { createNotifications } from '../server/notify';
import { setPushSender, wantsPush } from '../server/push';
import { isPushEndpoint } from '../server/routes/push';
import { pushCategoryOf, pushUrl } from '../shared/push';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const sent: { endpoint: string; payload: { title: string; body: string; url: string; tag: string } }[] = [];
const gone = new Set<string>();

const device = (name: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
  keys: { p256dh: `p256-${name}`, auth: `auth-${name}` },
  device: 'Chrome روی اندروید',
});

const sentTo = (name: string) => sent.filter((s) => s.endpoint.endsWith(`/${name}`));
/** Push runs after the bell is filled, without holding it up. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe('notifications on phones and computers (Web Push)', () => {
  let admin: Agent;
  let colleague: Person;

  beforeAll(async () => {
    await resetDatabase();
    setPushSender(async (target, payload) => {
      if (gone.has(target.endpoint)) return 410;
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
      return 201;
    });
    admin = await setupAdmin();
    colleague = await createEmployee(admin, { username: 'push.colleague' });
  });
  afterAll(async () => {
    setPushSender(null);
    await pool.end();
  });

  it('starts in preview: only the administrator sees it, and the key pair stays the same', async () => {
    await colleague.agent.get('/api/push').expect(404);
    await colleague.agent.post('/api/push/subscribe').send(device('c1')).expect(404);
    const first = (await admin.get('/api/push').expect(200)).body;
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(first.muted).toEqual([]);
    expect(first.status).toMatchObject({ people: 0, devices: 0 });
    expect((await admin.get('/api/push').expect(200)).body.publicKey).toBe(first.publicKey);
    // Neither half of the key is in the settings every page loads.
    const pub = (await admin.get('/api/settings').expect(200)).body;
    expect(JSON.stringify(pub)).not.toContain(first.publicKey);
    expect(pub).not.toHaveProperty('vapidPrivateKey');
  });

  it('accepts only the browsers’ own push services as an address', async () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushEndpoint('https://192.168.0.4/')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    await admin.post('/api/push/subscribe').send({ ...device('x'), endpoint: 'https://intranet.local/hook' }).expect(400);
  });

  it('sends every kind of notification to a subscribed device until the colleague switches a kind off', async () => {
    await admin.post('/api/push/subscribe').send(device('a1')).expect(200);
    const adminId = (await admin.get('/api/auth/me').expect(200)).body.user.id;
    await createNotifications([adminId], { title: 'کار تازه', message: 'گزارش را ببینید', type: 'task', linkTab: 'tasks', linkId: 't1' });
    await settle();
    expect(sentTo('a1')).toHaveLength(1);
    expect(sentTo('a1')[0].payload).toEqual({ title: 'کار تازه', body: 'گزارش را ببینید', url: '/#tasks/t1', tag: 'task:tasks:t1' });

    await admin.put('/api/push/me').send({ muted: ['polls', 'not-a-kind'] }).expect(200, { muted: ['polls'] });
    await createNotifications([adminId], { title: 'نظرسنجی', message: 'شرکت کنید', type: 'poll', linkTab: 'polls' });
    await createNotifications([adminId], { title: 'خبر', message: 'تازه', type: 'announcement', linkTab: 'news' });
    await settle();
    expect(sentTo('a1').map((s) => s.payload.title)).toEqual(['کار تازه', 'خبر']);
    await admin.put('/api/push/me').send({ muted: [] }).expect(200);
  });

  it('reaches colleagues once it is on for everyone, and keeps back parts hidden from them', async () => {
    await admin.put('/api/settings/features/pushNotifications').send({ state: 'on' }).expect(200);
    await colleague.agent.post('/api/push/subscribe').send(device('c1')).expect(200);
    await createNotifications([colleague.id], { title: 'سلام', message: 'به پرتال خوش آمدید', type: 'welcome' });
    // «کارهای ارجاعی» is still in preview, so a colleague outside the pilot group gets none of it.
    await createNotifications([colleague.id], { title: 'کار', message: 'x', type: 'task', linkTab: 'tasks' });
    await settle();
    expect(sentTo('c1').map((s) => s.payload.title)).toEqual(['سلام']);
    const info = (await colleague.agent.get('/api/push').expect(200)).body;
    expect(info).not.toHaveProperty('status');
    expect(info.devices).toEqual([expect.objectContaining({ device: 'Chrome روی اندروید' })]);
  });

  it('moves a shared browser to whoever signed in last, and forgets devices the push service dropped', async () => {
    await admin.post('/api/push/subscribe').send(device('c1')).expect(200);
    const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, device('c1').endpoint));
    expect(row.userId).not.toBe(colleague.id);
    await admin.post('/api/push/subscribe').send(device('a2')).expect(200);
    gone.add(device('a2').endpoint);
    const test = (await admin.post('/api/push/test').expect(200)).body;
    expect(test).toMatchObject({ devices: 3, sent: 2 });
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, device('a2').endpoint))).toHaveLength(0);
  });

  it('stops for a device on sign-out from it, and everywhere on «خروج از همهٔ دستگاه‌ها»', async () => {
    await colleague.agent.post('/api/push/subscribe').send(device('c2')).expect(200);
    await colleague.agent.post('/api/push/unsubscribe').send({ endpoint: device('c2').endpoint }).expect(200);
    // Someone else cannot remove another person's device.
    await colleague.agent.post('/api/push/unsubscribe').send({ endpoint: device('a1').endpoint }).expect(200);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, device('a1').endpoint))).toHaveLength(1);
    await colleague.agent.post('/api/push/subscribe').send(device('c3')).expect(200);
    await colleague.agent.post('/api/auth/logout-everywhere').expect(200);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, colleague.id))).toHaveLength(0);
  });

  it('never sends to a colleague who left', async () => {
    const leaver = await createEmployee(admin, { username: 'push.leaver' });
    await leaver.agent.post('/api/push/subscribe').send(device('l1')).expect(200);
    await admin.patch(`/api/employees/${leaver.id}`).send({ isActive: false }).expect(200);
    await createNotifications([leaver.id], { title: 'x', message: 'y', type: 'system' });
    await settle();
    expect(sentTo('l1')).toHaveLength(0);
  });

  it('works out kinds, links and who wants what', async () => {
    expect(pushCategoryOf('document')).toBe('news');
    expect(pushCategoryOf('something-new')).toBe('other');
    expect(pushUrl('news', 'a b')).toBe('/#news/a%20b');
    expect(pushUrl(undefined)).toBe('/#notifications');
    const features = { states: { pushNotifications: 'on' as const }, pilotRoles: [], pilotUserIds: [] };
    const person = { id: 'p', role: 'employee', pushMuted: ['people'] };
    expect(wantsPush(features, person, { type: 'birthday' })).toBe(false);
    expect(wantsPush(features, person, { type: 'announcement', linkTab: 'news' })).toBe(true);
    expect(wantsPush({ ...features, states: {} }, person, { type: 'announcement' })).toBe(false);
  });

  it('keeps the key pair in settings', async () => {
    const [row] = await db.select().from(settings);
    expect(row.vapidPrivateKey.length).toBeGreaterThan(20);
  });
});
