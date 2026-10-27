import { readFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../server/db/index';
import { notifications } from '../server/db/schema';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

type Agent = Awaited<ReturnType<typeof setupAdmin>>;
type Person = Awaited<ReturnType<typeof createEmployee>>;
interface Item {
  id: string;
  status: string;
  editedAt: string | null;
  openQuestions: number;
}

const article = {
  title: 'ساعت کاری جدید',
  summary: 'از شنبه ساعت کاری تغییر می‌کند.',
  content: '<p>از شنبه ساعت کاری ۸ تا ۱۶ است.</p>',
  contentFormat: 'html',
  category: 'اطلاعیه مهم',
};

const titlesFor = async (userId: string, newsId: string) =>
  (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.linkId, newsId)))).map((n) => n.title);
const listed = async (agent: Agent) => ((await agent.get('/api/news').expect(200)).body.items as Item[]).map((n) => n.id);

describe('publisher tools: drafts, edit history, questions and templates', () => {
  let admin: Agent;
  let publisher: Person;
  let reader: Person;
  let other: Person;

  beforeAll(async () => {
    await resetDatabase();
    admin = await setupAdmin();
    publisher = await createEmployee(admin, { username: 'pub.writer', department: 'فناوری اطلاعات', role: 'manager' });
    reader = await createEmployee(admin, { username: 'pub.reader', department: 'فروش' });
    other = await createEmployee(admin, { username: 'pub.other', department: 'طراحی' });
  });
  afterAll(() => pool.end());

  it('keeps a draft away from colleagues until it is published, then announces it', async () => {
    // A draft needs only a title.
    await publisher.agent.post('/api/news').send({ title: 'نیمه‌کاره', draft: false }).expect(400);
    const draft = (await publisher.agent.post('/api/news').send({ title: 'نیمه‌کاره', draft: true }).expect(201)).body as Item;
    expect(draft.status).toBe('draft');

    expect(await listed(publisher.agent)).not.toContain(draft.id);
    expect(await listed(reader.agent)).not.toContain(draft.id);
    await reader.agent.get(`/api/news/${draft.id}`).expect(404);
    await reader.agent.post(`/api/news/${draft.id}/read`).expect(404);
    await reader.agent.get('/api/news-drafts').expect(403);
    const drafts = (await admin.get('/api/news-drafts').expect(200)).body as Item[];
    expect(drafts.map((d) => d.id)).toEqual([draft.id]);
    expect(await titlesFor(reader.id, draft.id)).toEqual([]);

    // Saving the draft again is not history and still announces nothing.
    await publisher.agent.patch(`/api/news/${draft.id}`).send({ ...article, title: 'پیش‌نویس دوم', summary: '', content: '', draft: true }).expect(200);
    expect(await titlesFor(reader.id, draft.id)).toEqual([]);
    expect((await admin.get(`/api/news/${draft.id}/revisions`).expect(200)).body.entries).toEqual([]);

    // Publishing needs the full text, then everyone is told.
    await publisher.agent.patch(`/api/news/${draft.id}`).send({ ...article, content: '', draft: false }).expect(400);
    const published = (await publisher.agent.patch(`/api/news/${draft.id}`).send({ ...article, draft: false }).expect(200)).body as Item;
    expect(published.status).toBe('published');
    expect(await listed(reader.agent)).toContain(draft.id);
    expect(await titlesFor(reader.id, draft.id)).toEqual(['خبر/اطلاعیهٔ جدید 📰']);
    expect((await admin.get('/api/news-drafts').expect(200)).body).toEqual([]);

    // A published item cannot go back to being a draft.
    await publisher.agent.patch(`/api/news/${draft.id}`).send({ ...article, draft: true }).expect(400);
  });

  it('records who changed a published item and what it looked like before', async () => {
    const id = (await publisher.agent.post('/api/news').send(article).expect(201)).body.id as string;
    expect(((await reader.agent.get(`/api/news/${id}`).expect(200)).body as Item).editedAt).toBeNull();

    await admin.patch(`/api/news/${id}`).send({ ...article, title: 'ساعت کاری جدید (اصلاح)', isPinned: true }).expect(200);
    // Saving without changes adds nothing.
    await admin.patch(`/api/news/${id}`).send({ ...article, title: 'ساعت کاری جدید (اصلاح)', isPinned: true }).expect(200);

    const before = (await publisher.agent.get(`/api/news/${id}/revisions`).expect(200)).body.entries[0].before.publishAt;
    expect(((await reader.agent.get(`/api/news/${id}`).expect(200)).body as { publishAt: string }).publishAt).toBe(before);
    const history = (await publisher.agent.get(`/api/news/${id}/revisions`).expect(200)).body;
    expect(history.author).toBe('همکار pub.writer');
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ action: 'edit', editor: 'مدیر سیستم', changed: ['title', 'isPinned'] });
    expect(history.entries[0].before).toMatchObject({ title: 'ساعت کاری جدید', isPinned: false, content: article.content });
    expect(((await reader.agent.get(`/api/news/${id}`).expect(200)).body as Item).editedAt).not.toBeNull();
    await reader.agent.get(`/api/news/${id}/revisions`).expect(403);
  });

  it('lets colleagues ask the publisher privately and the publisher share the answer', async () => {
    const id = (await publisher.agent.post('/api/news').send(article).expect(201)).body.id as string;
    await publisher.agent.post(`/api/news/${id}/questions`).send({ question: 'خودم؟' }).expect(400);
    await reader.agent.post(`/api/news/${id}/questions`).send({ question: '' }).expect(400);
    const asked = (await reader.agent.post(`/api/news/${id}/questions`).send({ question: 'برای شعبهٔ شیراز هم همین است؟ من ساعت ۷ می‌رسم.' }).expect(201)).body.id;
    await other.agent.post(`/api/news/${id}/questions`).send({ question: 'ناهار چه ساعتی است؟' }).expect(201);
    expect(await titlesFor(publisher.id, id)).toEqual(['پرسش دربارهٔ اطلاعیه ❓', 'پرسش دربارهٔ اطلاعیه ❓']);
    expect(((await publisher.agent.get(`/api/news/${id}`).expect(200)).body as Item).openQuestions).toBe(2);
    expect(((await reader.agent.get(`/api/news/${id}`).expect(200)).body as Item).openQuestions).toBe(0);
    expect((await publisher.agent.get('/api/news-questions/pending').expect(200)).body).toHaveLength(2);
    expect((await reader.agent.get('/api/news-questions/pending').expect(200)).body).toEqual([]);

    // Before an answer each colleague sees only their own question; the publisher sees all with names.
    const forOther = (await other.agent.get(`/api/news/${id}/questions`).expect(200)).body;
    expect(forOther.canAnswer).toBe(false);
    expect(forOther.items.map((q: { question: string }) => q.question)).toEqual(['ناهار چه ساعتی است؟']);
    const forPublisher = (await publisher.agent.get(`/api/news/${id}/questions`).expect(200)).body;
    expect(forPublisher.canAnswer).toBe(true);
    expect(forPublisher.items[0]).toMatchObject({ askerName: 'همکار pub.reader', askerDepartment: 'فروش' });

    await other.agent.put(`/api/news-questions/${asked}`).send({ answer: 'نه' }).expect(403);
    await publisher.agent
      .put(`/api/news-questions/${asked}`)
      .send({ answer: 'بله، همهٔ شعبه‌ها.', isPublic: true, publicQuestion: 'برای شعبهٔ شیراز هم همین است؟' })
      .expect(200);
    expect(await titlesFor(reader.id, id)).toContain('پاسخ پرسش شما 💬');

    // Shared answers appear for everyone, reworded and without the asker's name.
    const shared = (await other.agent.get(`/api/news/${id}/questions`).expect(200)).body.items;
    expect(shared.find((q: { id: string }) => q.id === asked)).toMatchObject({
      question: 'برای شعبهٔ شیراز هم همین است؟',
      answer: 'بله، همهٔ شعبه‌ها.',
      mine: false,
      askerName: null,
    });
    const own = (await reader.agent.get(`/api/news/${id}/questions`).expect(200)).body.items;
    expect(own.find((q: { id: string }) => q.id === asked)).toMatchObject({ question: 'برای شعبهٔ شیراز هم همین است؟ من ساعت ۷ می‌رسم.', mine: true });
    expect((await admin.get(`/api/news/${id}/questions`).expect(200)).body.canAnswer).toBe(true);

    // Visitors (guest access) read the shared answers only.
    await admin.put('/api/settings').send({ guestAccess: true }).expect(200);
    const visitor = (await request(app).get(`/api/news/${id}/questions`).expect(200)).body;
    expect(visitor.items).toHaveLength(1);
    expect(visitor.items[0]).toMatchObject({ question: 'برای شعبهٔ شیراز هم همین است؟', askerName: null });
    await request(app).post(`/api/news/${id}/questions`).send({ question: 'مهمان' }).expect(401);

    // An answered question stays; the asker can withdraw only an open one.
    await reader.agent.delete(`/api/news-questions/${asked}`).expect(403);
    const open = forOther.items[0].id;
    await other.agent.delete(`/api/news-questions/${open}`).expect(200);
    expect((await publisher.agent.get('/api/news-questions/pending').expect(200)).body).toEqual([]);
  });

  it('offers ready-made templates that publishers can add to', async () => {
    // The test database is emptied between files, so put back what the migration added.
    const seed = readFileSync('drizzle/0014_news_drafts_questions_templates.sql', 'utf8')
      .split('--> statement-breakpoint')
      .find((statement) => statement.includes('INSERT INTO "news_templates"'))!;
    await db.execute(sql.raw(seed));
    await reader.agent.get('/api/news-templates').expect(403);
    const builtIn = (await publisher.agent.get('/api/news-templates').expect(200)).body as { id: string; name: string; title: string }[];
    expect(builtIn.map((t) => t.name).sort()).toEqual(['تبریک مناسبت', 'تسلیت', 'تعطیلی', 'تغییر ساعت کاری', 'قطعی سامانه'].sort());
    expect(builtIn.find((t) => t.name === 'قطعی سامانه')!.title).toContain('[نام سامانه]');

    const created = (
      await publisher.agent
        .post('/api/news-templates')
        .send({ name: 'جلسهٔ ماهانه', title: 'جلسهٔ ماهانه [ماه]', content: '<p>جلسه [روز] برگزار می‌شود.</p><script>x</script>', tags: ['جلسه'] })
        .expect(201)
    ).body;
    expect(created.content).toBe('<p>جلسه [روز] برگزار می‌شود.</p>');
    await publisher.agent.put(`/api/news-templates/${created.id}`).send({ name: 'جلسهٔ ماهانهٔ مدیران', title: 'جلسهٔ ماهانه [ماه]' }).expect(200);
    await reader.agent.delete(`/api/news-templates/${created.id}`).expect(403);
    await publisher.agent.delete(`/api/news-templates/${created.id}`).expect(200);
    await publisher.agent.delete(`/api/news-templates/${created.id}`).expect(404);
  });
});
