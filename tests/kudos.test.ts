import { EventEmitter } from 'events';
import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { kudos, notifications } from '../server/db/schema';
import { addClient } from '../server/events';
import { markActive, onlineIds } from '../server/presence';
import { pruneKudos } from '../server/routes/kudos';
import { monthlySummary } from '../server/reports';
import { DEFAULT_KUDOS_EMOJIS, KUDOS_DAILY_LIMIT, ONLINE_IDLE_MINUTES } from '../shared/kudos';
import { toJalali } from '../shared/jalali';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

/** A page of the portal left open: the live connection the server keeps for it, and what it was sent. */
class OpenPage extends EventEmitter {
  written: string[] = [];
  setHeader() {}
  flushHeaders() {}
  write(chunk: string) {
    this.written.push(chunk);
    return true;
  }
  close() {
    this.emit('close');
  }
  /** The emoji pushed to this page. */
  kudos() {
    return this.written
      .filter((w) => w.startsWith('event: kudos'))
      .map((w) => JSON.parse(w.split('\ndata: ')[1]) as { id: number; message: string; canReply: boolean; from: { id: string } });
  }
}

const openPage = (userId: string) => {
  const page = new OpenPage();
  addClient(userId, page as unknown as Response);
  return page;
};

const names = (body: { online: { id: string }[] }) => body.online.map((p) => p.id).sort();

describe('«همکاران آنلاین»: who has the portal open, and ready-made emoji between colleagues', () => {
  let admin: Agent;
  let maryam: Person;
  let reza: Person;
  let sara: Person;
  let adminId: string;
  const pages: OpenPage[] = [];

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    adminId = (await admin.get('/api/auth/me').expect(200)).body.user.id;
    maryam = await createEmployee(admin, { username: 'kudos.maryam' });
    reza = await createEmployee(admin, { username: 'kudos.reza' });
    sara = await createEmployee(admin, { username: 'kudos.sara' });
  });
  afterAll(async () => {
    for (const page of pages) page.close();
    await pool.end();
  });

  it('is on from the start, and out of reach once an administrator switches it off', async () => {
    expect((await maryam.agent.get('/api/settings').expect(200)).body.features.onlineColleagues).toBe('on');
    await admin.put('/api/settings/features/onlineColleagues').send({ state: 'off' }).expect(200);
    await maryam.agent.get('/api/presence').expect(404);
    await maryam.agent.post('/api/kudos').send({ to: reza.id, emoji: 'flower' }).expect(404);
    await admin.put('/api/settings/features/onlineColleagues').send({ state: 'on' }).expect(200);
  });

  it('lists everyone with a page open who did something lately, except oneself', async () => {
    pages.push(openPage(maryam.id), openPage(reza.id), openPage(sara.id));
    const body = (await maryam.agent.get('/api/presence').expect(200)).body;
    expect(names(body)).toEqual([reza.id, sara.id].sort());
    expect(body.emojis).toEqual(DEFAULT_KUDOS_EMOJIS);
    expect(body.me).toEqual({ showOnline: true, acceptKudos: true });
    // The administrator has no page open, so is not online.
    expect(onlineIds()).not.toContain(adminId);

    // Someone idle for longer than the limit drops off, and comes back with the next click.
    markActive(sara.id, Date.now() - (ONLINE_IDLE_MINUTES + 1) * 60_000);
    expect(onlineIds()).not.toContain(sara.id);
    await sara.agent.post('/api/presence/active').expect(204);
    expect(onlineIds()).toContain(sara.id);
  });

  it('sends an emoji to an online colleague: a notification, and a message on their open page', async () => {
    await maryam.agent.post('/api/kudos').send({ to: reza.id, emoji: 'flower' }).expect(201);
    const toReza = pages[1].kudos();
    expect(toReza).toHaveLength(1);
    expect(toReza[0]).toMatchObject({ canReply: true, from: { id: maryam.id } });
    expect(toReza[0].message).toContain('🌹');
    const inbox = await db.select().from(notifications).where(and(eq(notifications.userId, reza.id), eq(notifications.type, 'kudos')));
    expect(inbox).toHaveLength(1);
    expect(inbox[0].message).toBe(toReza[0].message);

    // Not again to the same colleague for a few minutes; another colleague is fine.
    const again = await maryam.agent.post('/api/kudos').send({ to: reza.id, emoji: 'thanks' }).expect(429);
    expect(again.body.error).toContain('دقیقه');
    expect((await maryam.agent.get('/api/presence').expect(200)).body.waits).toHaveProperty(reza.id);
    await maryam.agent.post('/api/kudos').send({ to: sara.id, emoji: 'thanks' }).expect(201);
  });

  it('allows one emoji back, and the exchange ends there', async () => {
    const [received] = pages[1].kudos();
    await reza.agent.post('/api/kudos').send({ to: maryam.id, emoji: 'smile', replyTo: received.id }).expect(201);
    const back = pages[0].kudos();
    expect(back).toHaveLength(1);
    expect(back[0].canReply).toBe(false);
    expect(back[0].message).toContain('در پاسخ');

    // No second answer, and no answer to the answer.
    await reza.agent.post('/api/kudos').send({ to: maryam.id, emoji: 'tea', replyTo: received.id }).expect(400);
    await maryam.agent.post('/api/kudos').send({ to: reza.id, emoji: 'tea', replyTo: back[0].id }).expect(400);
    // Nobody answers an emoji that was not sent to them.
    await sara.agent.post('/api/kudos').send({ to: maryam.id, emoji: 'tea', replyTo: received.id }).expect(400);
  });

  it('refuses text, unknown emoji, oneself and colleagues who are not online', async () => {
    await maryam.agent.post('/api/kudos').send({ to: maryam.id, emoji: 'flower' }).expect(400);
    await sara.agent.post('/api/kudos').send({ to: reza.id, emoji: 'سلام، چطوری؟' }).expect(400);
    await sara.agent.post('/api/kudos').send({ to: adminId, emoji: 'flower' }).expect(400);
    await sara.agent.post('/api/kudos').send({ to: 'nobody', emoji: 'flower' }).expect(404);
  });

  it('respects each person’s choices: hidden from the list (and not seeing it), or not receiving emoji', async () => {
    await sara.agent.put('/api/presence/me').send({ showOnline: false }).expect(200);
    expect(names((await maryam.agent.get('/api/presence').expect(200)).body)).toEqual([reza.id]);
    const own = (await sara.agent.get('/api/presence').expect(200)).body;
    expect(own.online).toEqual([]);
    expect(own.me.showOnline).toBe(false);
    await sara.agent.post('/api/kudos').send({ to: reza.id, emoji: 'flower' }).expect(400);
    await reza.agent.post('/api/kudos').send({ to: sara.id, emoji: 'flower' }).expect(400);
    await sara.agent.put('/api/presence/me').send({ showOnline: true }).expect(200);

    await reza.agent.put('/api/presence/me').send({ acceptKudos: false }).expect(200);
    const list = (await sara.agent.get('/api/presence').expect(200)).body.online as { id: string; acceptKudos: boolean }[];
    expect(list.find((p) => p.id === reza.id)?.acceptKudos).toBe(false);
    const refused = await sara.agent.post('/api/kudos').send({ to: reza.id, emoji: 'flower' }).expect(400);
    expect(refused.body.error).toContain('خاموش');
    await reza.agent.put('/api/presence/me').send({ acceptKudos: true }).expect(200);
  });

  it('closing the last page takes the colleague off the list at once', async () => {
    pages[2].close();
    expect(onlineIds()).not.toContain(sara.id);
    await maryam.agent.post('/api/kudos').send({ to: sara.id, emoji: 'bravo' }).expect(400);
    pages[2] = openPage(sara.id);
    expect(onlineIds()).toContain(sara.id);
  });

  it('caps how many emoji one person sends in a day', async () => {
    const today = new Date();
    await db.insert(kudos).values(
      Array.from({ length: KUDOS_DAILY_LIMIT }, () => ({ fromId: sara.id, toId: adminId, emoji: '🌹', label: 'گل', createdAt: today })),
    );
    const res = await sara.agent.post('/api/kudos').send({ to: maryam.id, emoji: 'flower' }).expect(429);
    expect(res.body.error).toContain('امروز');
    await db.delete(kudos).where(eq(kudos.fromId, sara.id));
  });

  it('lets the administrator change the list of emoji', async () => {
    const list = [
      { id: 'cake', emoji: '🎂', label: 'شیرینی' },
      { id: 'flower', emoji: '🌷', label: 'گل' },
    ];
    await admin.put('/api/settings').send({ kudosEmojis: list }).expect(200);
    expect((await sara.agent.get('/api/presence').expect(200)).body.emojis).toEqual(list);
    await sara.agent.post('/api/kudos').send({ to: reza.id, emoji: 'tea' }).expect(400);
    await sara.agent.post('/api/kudos').send({ to: reza.id, emoji: 'cake' }).expect(201);
    expect(pages[1].kudos().at(-1)?.message).toContain('🎂');
    // Employees cannot, repeated emoji are refused, and an empty list brings the built-in six back.
    await sara.agent.put('/api/settings').send({ kudosEmojis: [] }).expect(403);
    await admin.put('/api/settings').send({ kudosEmojis: [list[0], list[0]] }).expect(400);
    await admin.put('/api/settings').send({ kudosEmojis: [] }).expect(200);
    expect((await sara.agent.get('/api/presence').expect(200)).body.emojis).toEqual(DEFAULT_KUDOS_EMOJIS);
  });

  it('is not open to guests', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./helpers');
    await request(app).get('/api/presence').expect(401);
  });

  it('counts only the monthly total in the reports, and old emoji are removed', async () => {
    const summary = await monthlySummary(toJalali(new Date(), 'jYYYY/jMM'));
    expect(summary.kudos).toBe((await db.select().from(kudos)).length);
    expect(summary.kudos).toBeGreaterThan(0);

    const old = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000);
    await db.insert(kudos).values({ fromId: maryam.id, toId: reza.id, emoji: '🌹', label: 'گل', createdAt: old });
    const before = (await db.select().from(kudos)).length;
    await pruneKudos();
    expect((await db.select().from(kudos)).length).toBe(before - 1);
  });
});
