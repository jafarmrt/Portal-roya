import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { jalaliToDate } from '../../shared/jalali.js';
import { audit } from '../audit.js';
import { can, requirePermission, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { employees, guideFeedback, guides } from '../db/schema.js';
import { requireDepartment } from '../departments.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { createNotifications } from '../notify.js';
import { richTextToPlain, sanitizeRichText } from '../richText.js';
import { fullName } from '../serializers.js';
import { jalaliDate, optionalText, requiredText } from '../validation.js';

export const guidesRouter = Router();

type GuideRow = typeof guides.$inferSelect;

// Guides are written by the people who manage documents and kept current by their owner.
const looksAfter = (viewer: SessionUser | null, guide: GuideRow) => Boolean(viewer && (can(viewer, 'documents.manage') || guide.ownerId === viewer.id));

async function serializeMany(rows: GuideRow[], viewer: SessionUser | null) {
  if (rows.length === 0) return [];
  const people = new Map((await db.select().from(employees)).map((e) => [e.id, e]));
  const feedback = await db.select().from(guideFeedback).where(inArray(guideFeedback.guideId, rows.map((g) => g.id)));
  const now = new Date();
  return rows.map((g) => {
    const owner = g.ownerId ? people.get(g.ownerId) : undefined;
    const editor = people.get(g.updatedById);
    const answers = feedback.filter((f) => f.guideId === g.id);
    const caretaker = looksAfter(viewer, g);
    return {
      id: g.id,
      title: g.title,
      category: g.category,
      summary: g.summary,
      content: g.content,
      department: g.department,
      ownerId: g.ownerId,
      owner: owner ? fullName(owner) : '',
      ownerExtension: owner?.extension ?? '',
      updatedBy: editor ? fullName(editor) : '',
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      reviewAt: caretaker ? (g.reviewAt?.toISOString() ?? null) : null,
      needsReview: caretaker && Boolean(g.reviewAt && g.reviewAt <= now),
      myFeedback: viewer ? (answers.find((f) => f.userId === viewer.id)?.helpful ?? null) : null,
      // How useful colleagues found it, for the people who keep it current.
      feedback: caretaker ? { helpful: answers.filter((f) => f.helpful).length, notHelpful: answers.filter((f) => !f.helpful).length } : undefined,
    };
  });
}

async function load(id: string) {
  const [guide] = await db.select().from(guides).where(eq(guides.id, id));
  if (!guide) throw new HttpError(404, 'راهنما یافت نشد.');
  return guide;
}

guidesRouter.get(
  '/guides',
  route(async (req, res) => {
    const rows = await db.select().from(guides).orderBy(guides.category, guides.title);
    res.json(await serializeMany(rows, viewerOf(req)));
  }),
);

const guideSchema = z.object({
  title: requiredText(200),
  category: requiredText(100),
  summary: optionalText(500),
  content: requiredText(60000),
  department: optionalText(100),
  ownerId: z.string().max(100).nullable().default(null),
  reviewDate: jalaliDate.optional().or(z.literal('')),
});

/** Review reminders go out in the morning of the chosen day; a newly chosen day must be ahead. */
function reviewAtFrom(reviewDate: string | undefined, previous: Date | null = null) {
  if (!reviewDate) return null;
  const at = jalaliToDate(reviewDate, '08:00');
  if (!at) throw new HttpError(400, 'تاریخ بازبینی نامعتبر است.');
  if (at.getTime() !== previous?.getTime() && at <= new Date()) throw new HttpError(400, 'تاریخ بازبینی باید در آینده باشد.');
  return at;
}

async function checkedOwner(ownerId: string | null) {
  if (!ownerId) return null;
  const [owner] = await db.select().from(employees).where(eq(employees.id, ownerId));
  if (!owner?.isActive || !owner.hasAccount) throw new HttpError(400, 'مسئول راهنما باید همکار فعال با حساب پرتال باشد.');
  return owner.id;
}

function checkedContent(html: string) {
  const clean = sanitizeRichText(html);
  if (!richTextToPlain(clean) && !clean.includes('<img')) throw new HttpError(400, 'متن راهنما را بنویسید.');
  return clean;
}

guidesRouter.post(
  '/guides',
  requirePermission('documents.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(guideSchema, req.body);
    const [guide] = await db
      .insert(guides)
      .values({
        id: newId('guide'),
        title: body.title,
        category: body.category,
        summary: body.summary,
        content: checkedContent(body.content),
        department: body.department ? await requireDepartment(body.department) : '',
        ownerId: await checkedOwner(body.ownerId),
        reviewAt: reviewAtFrom(body.reviewDate),
        createdById: viewer.id,
        updatedById: viewer.id,
      })
      .returning();
    await audit(viewer, { action: 'create', entity: 'guide', id: guide.id, title: guide.title });
    broadcastChange('guides');
    const [serialized] = await serializeMany([guide], viewer);
    res.status(201).json(serialized);
  }),
);

/** Document managers change everything; a guide's owner keeps its text current but not who owns it. */
guidesRouter.put(
  '/guides/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await load(req.params.id);
    if (!looksAfter(viewer, existing)) throw new HttpError(403, 'فقط مسئول راهنما یا مدیر اسناد می‌تواند آن را ویرایش کند.');
    const body = parse(guideSchema, req.body);
    const isManager = can(viewer, 'documents.manage');
    const reviewAt = reviewAtFrom(body.reviewDate, existing.reviewAt);
    const [guide] = await db
      .update(guides)
      .set({
        title: body.title,
        category: body.category,
        summary: body.summary,
        content: checkedContent(body.content),
        department: isManager ? (body.department ? await requireDepartment(body.department) : '') : existing.department,
        ownerId: isManager ? await checkedOwner(body.ownerId) : existing.ownerId,
        reviewAt,
        ...(reviewAt?.getTime() !== existing.reviewAt?.getTime() ? { reviewRemindedAt: null } : {}),
        updatedById: viewer.id,
        updatedAt: new Date(),
      })
      .where(eq(guides.id, existing.id))
      .returning();
    await audit(viewer, { action: 'update', entity: 'guide', id: guide.id, title: guide.title, detail: existing.title !== guide.title ? `عنوان قبلی: ${existing.title}` : '' });
    broadcastChange('guides');
    const [serialized] = await serializeMany([guide], viewer);
    res.json(serialized);
  }),
);

guidesRouter.delete(
  '/guides/:id',
  requirePermission('documents.manage'),
  route(async (req, res) => {
    const [deleted] = await db.delete(guides).where(eq(guides.id, req.params.id)).returning({ id: guides.id, title: guides.title });
    if (!deleted) throw new HttpError(404, 'راهنما یافت نشد.');
    await audit(currentUser(req), { action: 'delete', entity: 'guide', id: deleted.id, title: deleted.title });
    broadcastChange('guides');
    res.json({ success: true });
  }),
);

/** "Reviewed, still correct": the next review date, without changing the text. */
guidesRouter.post(
  '/guides/:id/review',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await load(req.params.id);
    if (!looksAfter(viewer, existing)) throw new HttpError(403, 'فقط مسئول راهنما یا مدیر اسناد می‌تواند این کار را انجام دهد.');
    const { reviewDate } = parse(z.object({ reviewDate: jalaliDate.optional().or(z.literal('')) }), req.body);
    const [guide] = await db
      .update(guides)
      .set({ reviewAt: reviewAtFrom(reviewDate), reviewRemindedAt: null })
      .where(eq(guides.id, existing.id))
      .returning();
    broadcastChange('guides');
    const [serialized] = await serializeMany([guide], viewer);
    res.json(serialized);
  }),
);

async function recordFeedback(guideId: string, userId: string, helpful: boolean) {
  await db
    .insert(guideFeedback)
    .values({ guideId, userId, helpful })
    .onConflictDoUpdate({ target: [guideFeedback.guideId, guideFeedback.userId], set: { helpful, createdAt: new Date() } });
}

guidesRouter.post(
  '/guides/:id/feedback',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const guide = await load(req.params.id);
    const { helpful } = parse(z.object({ helpful: z.boolean() }), req.body);
    await recordFeedback(guide.id, viewer.id, helpful);
    const [serialized] = await serializeMany([guide], viewer);
    res.json(serialized);
  }),
);

/** The person who keeps the guide current: its owner, or whoever wrote it. */
async function caretakerOf(guide: GuideRow) {
  const ids = [guide.ownerId, guide.createdById].filter((id): id is string => Boolean(id));
  const people = await db.select().from(employees).where(inArray(employees.id, ids));
  return ids.map((id) => people.find((p) => p.id === id)).find((p) => p?.isActive && p.hasAccount);
}

/** "I didn't find my answer": the question goes straight to the person who keeps the guide current. */
guidesRouter.post(
  '/guides/:id/question',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const guide = await load(req.params.id);
    const { text } = parse(z.object({ text: requiredText(1000) }), req.body);
    await recordFeedback(guide.id, viewer.id, false);
    const caretaker = await caretakerOf(guide);
    if (!caretaker) throw new HttpError(400, 'این راهنما مسئولی ندارد که پرسش را بخواند.');
    if (caretaker.id !== viewer.id) {
      await createNotifications([caretaker.id], {
        title: `پرسش دربارهٔ راهنمای «${guide.title}» ❓`,
        message: `${fullName(viewer)}${viewer.extension ? ` (داخلی ${viewer.extension})` : ''} جوابش را در راهنما پیدا نکرد: «${text}»`,
        type: 'document',
        linkTab: 'guides',
        linkId: guide.id,
      });
    }
    res.json({ sentTo: fullName(caretaker) });
  }),
);

/** Run by the scheduler: asks a guide's owner (or writer) to check it once its review date has come. */
export async function processGuideReviews(now = new Date()) {
  const due = await db.select().from(guides).where(and(isNotNull(guides.reviewAt), lte(guides.reviewAt, now), isNull(guides.reviewRemindedAt)));
  for (const guide of due) {
    const claimed = await db
      .update(guides)
      .set({ reviewRemindedAt: now })
      .where(and(eq(guides.id, guide.id), isNull(guides.reviewRemindedAt)))
      .returning({ id: guides.id });
    if (claimed.length === 0) continue;
    const caretaker = await caretakerOf(guide);
    if (!caretaker) continue;
    await createNotifications([caretaker.id], {
      title: 'زمان بازبینی راهنما رسیده است 🗂️',
      message: `«${guide.title}» را بازبینی کنید: اگر هنوز درست است «بازبینی شد» را بزنید، وگرنه متن را به‌روز کنید.`,
      type: 'document',
      linkTab: 'guides',
      linkId: guide.id,
    });
  }
  if (due.length > 0) broadcastChange('guides');
}
