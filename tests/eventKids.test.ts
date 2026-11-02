import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../server/config';
import { db, pool } from '../server/db/index';
import { news, specialEvents } from '../server/db/schema';
import { processSpecialEvents } from '../server/routes/specialEvents';
import { toJalali } from '../shared/jalali';
import { addJalaliDays } from '../shared/todos';
import { createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;

const today = toJalali(new Date());
const day = (offset: number) => addJalaliDays(today, offset);

interface Kid {
  count: number;
  mine: { id: string; url: string; shown: boolean } | null;
  canSend: boolean;
  photos: { id: string; employeeId: string; shown: boolean; revealed: boolean }[];
  current: {
    id: string;
    options: string[];
    revealed: boolean;
    ownerId: string | null;
    guessed: number;
    right: number | null;
    myPick: string | null;
    canGuess: boolean;
    isMine: boolean;
  } | null;
  gallery: { id: string; employeeId: string }[];
  leaders: { employeeId: string; correct: number; rank: number }[];
  me: { correct: number; rank: number } | null;
}
interface View {
  kid: Kid;
  event: { screen: { scene: string; kidPhotoId?: string | null } | null; closingNewsId: string | null };
}

/** A real file in the upload folder, to see it go when the page closes. */
function photoFile(name: string) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, name), 'not really a photo');
  return `/uploads/${name}`;
}

describe('«رویداد ویژه»: «این بچه کیه؟» and the closing news', () => {
  let admin: Agent;
  let organizer: Person;
  let ali: Person;
  let sara: Person;
  let reza: Person;
  let eventId: string;
  const files: string[] = [];

  const view = async (agent: Agent | Person['agent']) => (await agent.get('/api/special_events/current').expect(200)).body as View;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    organizer = await createEmployee(admin, { username: 'kd.organizer' });
    ali = await createEmployee(admin, { username: 'kd.ali' });
    sara = await createEmployee(admin, { username: 'kd.sara' });
    reza = await createEmployee(admin, { username: 'kd.reza' });
    const created = (await admin.post('/api/special_events').send({ title: 'یلدا', programDate: day(10), programTime: '15:00', signupEnd: day(5) }).expect(201)).body as {
      event: { id: string };
    };
    eventId = created.event.id;
    await admin.patch(`/api/special_events/${eventId}`).send({ organizerIds: [organizer.id] }).expect(200);
    await admin.post(`/api/special_events/${eventId}/activate`).send({ force: true }).expect(200);
  });
  afterAll(async () => {
    for (const f of files) fs.rmSync(path.join(config.uploadDir, path.basename(f)), { force: true });
    await pool.end();
  });

  it('keeps the photos to the organizers until they are shown', async () => {
    await ali.agent.put(`/api/special_events/${eventId}/kid_photo`).send({ url: 'https://example.com/a.png' }).expect(400);
    const first = photoFile('kid-test-ali-1.png');
    const second = photoFile('kid-test-ali-2.png');
    files.push(first, second);
    await ali.agent.put(`/api/special_events/${eventId}/kid_photo`).send({ url: first }).expect(200);
    // Changing it removes the earlier file.
    const mine = ((await ali.agent.put(`/api/special_events/${eventId}/kid_photo`).send({ url: second }).expect(200)).body as View).kid;
    expect(mine.mine).toMatchObject({ url: second, shown: false });
    expect(fs.existsSync(path.join(config.uploadDir, 'kid-test-ali-1.png'))).toBe(false);
    const saraFile = photoFile('kid-test-sara.png');
    files.push(saraFile);
    await sara.agent.put(`/api/special_events/${eventId}/kid_photo`).send({ url: saraFile }).expect(200);

    const forReza = (await view(reza.agent)).kid;
    expect(forReza).toMatchObject({ count: 2, mine: null, photos: [], current: null, gallery: [], canSend: true });
    const forOrganizer = (await view(organizer.agent)).kid;
    expect(forOrganizer.photos.map((p) => p.employeeId)).toEqual([ali.id, sara.id]);
    // Not before the program.
    await organizer.agent.post(`/api/event_kid_photos/${forOrganizer.photos[0].id}/show`).expect(400);
  });

  it('shows one on the screen, takes guesses on the phones, then tells whose it was', async () => {
    await db.update(specialEvents).set({ programDate: today, programTime: '00:00', signupEnd: day(-3), showUntil: day(2) }).where(eq(specialEvents.id, eventId));
    const aliPhoto = (await view(organizer.agent)).kid.photos.find((p) => p.employeeId === ali.id)!;
    await reza.agent.post(`/api/event_kid_photos/${aliPhoto.id}/show`).expect(403);
    const shown = (await organizer.agent.post(`/api/event_kid_photos/${aliPhoto.id}/show`).expect(200)).body as View;
    expect(shown.event.screen).toMatchObject({ scene: 'kid', kidPhotoId: aliPhoto.id });
    const options = shown.kid.current!.options;
    expect(options).toContain(ali.id);
    expect(options).toContain(sara.id);
    expect(options).not.toContain(organizer.id);

    // Colleagues do not see whose it is yet; the owner and the organizers do not guess.
    const forReza = (await view(reza.agent)).kid.current!;
    expect(forReza).toMatchObject({ ownerId: null, canGuess: true, isMine: false });
    expect((await view(ali.agent)).kid.current).toMatchObject({ canGuess: false, isMine: true });
    await ali.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: ali.id }).expect(403);
    await organizer.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: ali.id }).expect(403);
    await reza.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: organizer.id }).expect(400);
    await reza.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: sara.id }).expect(200);
    // Changed before the answer.
    const changed = ((await reza.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: ali.id }).expect(200)).body as View).kid.current!;
    expect(changed).toMatchObject({ myPick: ali.id, guessed: 1 });
    await sara.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: options.find((o) => o !== ali.id)! }).expect(200);
    // The one who sent a photo cannot take it back once it is on the screen.
    await ali.agent.delete(`/api/special_events/${eventId}/kid_photo`).expect(400);

    await organizer.agent.post(`/api/event_kid_photos/${aliPhoto.id}/reveal`).expect(200);
    const after = (await view(reza.agent)).kid;
    expect(after.current).toMatchObject({ revealed: true, ownerId: ali.id, right: 1, guessed: 2, canGuess: false });
    expect(after.gallery.map((g) => g.employeeId)).toEqual([ali.id]);
    expect(after.leaders).toMatchObject([{ employeeId: reza.id, correct: 1, rank: 1 }]);
    expect(after.me).toMatchObject({ correct: 1, rank: 1 });
    await reza.agent.put(`/api/event_kid_photos/${aliPhoto.id}/guess`).send({ pick: sara.id }).expect(400);
  });

  it('turns the night into a news draft, refreshed rather than made twice', async () => {
    await ali.agent.post(`/api/special_events/${eventId}/closing_news`).expect(403);
    const made = (await organizer.agent.post(`/api/special_events/${eventId}/closing_news`).expect(200)).body as { newsId: string; refreshed: boolean; canPublish: boolean };
    expect(made).toMatchObject({ refreshed: false, canPublish: false });
    const [draft] = await db.select().from(news).where(eq(news.id, made.newsId));
    expect(draft).toMatchObject({ isDraft: true, title: 'گزارش یلدا', contentFormat: 'html', authorId: organizer.id });
    expect(draft.content).toContain('این بچه کیه؟');
    expect(draft.content).toContain('با تشکر از برگزارکنندگان');
    expect((await view(organizer.agent)).event.closingNewsId).toBe(made.newsId);
    expect((await view(reza.agent)).event.closingNewsId).toBeNull();
    // Not a news item a colleague can read yet.
    const list = (await reza.agent.get('/api/news').expect(200)).body as { id: string }[] | { items: { id: string }[] };
    const ids = (Array.isArray(list) ? list : list.items).map((n) => n.id);
    expect(ids).not.toContain(made.newsId);

    const again = (await organizer.agent.post(`/api/special_events/${eventId}/closing_news`).expect(200)).body as { newsId: string; refreshed: boolean };
    expect(again).toMatchObject({ newsId: made.newsId, refreshed: true });
    expect(await db.select().from(news).where(eq(news.title, 'گزارش یلدا'))).toHaveLength(1);
  });

  it('deletes the photos, rows and files, once the page closes', async () => {
    await db.update(specialEvents).set({ programDate: day(-5), showUntil: day(-1), signupEnd: day(-8) }).where(eq(specialEvents.id, eventId));
    await processSpecialEvents();
    const [ev] = await db.select().from(specialEvents).where(eq(specialEvents.id, eventId));
    expect(ev).toBeTruthy();
    expect(fs.existsSync(path.join(config.uploadDir, 'kid-test-ali-2.png'))).toBe(false);
    expect(fs.existsSync(path.join(config.uploadDir, 'kid-test-sara.png'))).toBe(false);
    // The admin still sees the ended event as the current one (or none); either way there are no photos.
    const current = (await admin.get('/api/special_events/current').expect(200)).body as Partial<View>;
    expect(current.kid?.count ?? 0).toBe(0);
  });
});
