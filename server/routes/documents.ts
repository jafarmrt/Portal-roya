import fs from 'fs';
import path from 'path';
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { inAudience } from '../../shared/audience.js';
import { jalaliToDate, toPersianDigits } from '../../shared/jalali.js';
import { audienceIncludes, audienceOfRow, checkAudience } from '../audience.js';
import { can, requirePermission, type SessionUser } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { documentAcks, documents, documentVersions, employees } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIdsFor, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { attachment, jalaliDate, optionalText, requiredText } from '../validation.js';

export const documentsRouter = Router();

type DocumentRow = typeof documents.$inferSelect;
type Employee = typeof employees.$inferSelect;

const AUDIENCE_COLUMNS = {
  departments: documents.targetDepartments,
  locations: documents.targetLocations,
  roles: documents.targetRoles,
  userIds: documents.targetUserIds,
};

/** Document managers see every document; others the ones meant for them and the ones they look after. */
function visibleTo(viewer: SessionUser | null): SQL | undefined {
  if (can(viewer, 'documents.manage')) return undefined;
  const forMe = audienceIncludes(AUDIENCE_COLUMNS, viewer);
  return viewer ? or(forMe, eq(documents.ownerId, viewer.id)) : forMe;
}

/** Document managers and the document's owner keep it current: new versions, reviews, confirmations. */
const looksAfter = (viewer: SessionUser | null, doc: DocumentRow) => Boolean(viewer && (can(viewer, 'documents.manage') || doc.ownerId === viewer.id));

/** Who must read and confirm a document: active colleagues with an account in its audience, except its owner. */
const audienceOf = (doc: DocumentRow, people: Employee[]) =>
  people.filter((p) => p.isActive && p.hasAccount && p.id !== doc.ownerId && inAudience(p, audienceOfRow(doc)));

const isConfirmed = (doc: DocumentRow, ack: { version: number } | undefined) => Boolean(ack && ack.version >= doc.ackVersion);

async function serializeMany(rows: DocumentRow[], viewer: SessionUser | null) {
  if (rows.length === 0) return [];
  const ids = rows.map((d) => d.id);
  const people = await db.select().from(employees);
  const byId = new Map(people.map((p) => [p.id, p]));
  const isManager = can(viewer, 'documents.manage');
  const tracked = rows.filter((d) => d.requiresAck && looksAfter(viewer, d)).map((d) => d.id);
  const [myAcks, trackedAcks] = await Promise.all([
    viewer ? db.select().from(documentAcks).where(and(eq(documentAcks.userId, viewer.id), inArray(documentAcks.documentId, ids))) : [],
    tracked.length > 0 ? db.select().from(documentAcks).where(inArray(documentAcks.documentId, tracked)) : [],
  ]);
  const mine = new Map(myAcks.map((a) => [a.documentId, a]));
  const now = new Date();

  return rows.map((doc) => {
    const uploader = byId.get(doc.uploadedById);
    const owner = doc.ownerId ? byId.get(doc.ownerId) : undefined;
    const ack = mine.get(doc.id);
    const caretaker = looksAfter(viewer, doc);
    let ackStats: { acknowledged: number; audience: number } | undefined;
    if (doc.requiresAck && caretaker) {
      const audience = new Set(audienceOf(doc, people).map((p) => p.id));
      const acknowledged = trackedAcks.filter((a) => a.documentId === doc.id && audience.has(a.userId) && isConfirmed(doc, a)).length;
      ackStats = { acknowledged, audience: audience.size };
    }
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      uploadedBy: uploader ? fullName(uploader) : '',
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      version: doc.version,
      versionNote: doc.versionNote,
      requiresAck: doc.requiresAck,
      // The viewer is among the people who must confirm it.
      forMe: Boolean(viewer && doc.ownerId !== viewer.id && inAudience(viewer, audienceOfRow(doc))),
      acknowledgedAt: isConfirmed(doc, ack) ? ack!.acknowledgedAt.toISOString() : null,
      // Confirmed an earlier version, before a change everyone had to read again.
      acknowledgedEarlier: Boolean(ack && !isConfirmed(doc, ack)),
      ownerId: doc.ownerId,
      owner: owner ? fullName(owner) : '',
      ownerDepartment: owner?.department ?? '',
      reviewAt: doc.reviewAt?.toISOString() ?? null,
      needsReview: caretaker && Boolean(doc.reviewAt && doc.reviewAt <= now),
      targetDepartments: doc.targetDepartments,
      targetLocations: doc.targetLocations,
      targetRoles: doc.targetRoles,
      // Who else got the document by name is for the people who manage documents.
      targetUserIds: isManager ? doc.targetUserIds : [],
      targetUserCount: doc.targetUserIds.length,
      ackStats,
      ackRemindedAt: caretaker ? (doc.ackRemindedAt?.toISOString() ?? null) : null,
    };
  });
}

async function loadVisible(id: string, viewer: SessionUser | null) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), visibleTo(viewer)));
  if (!doc) throw new HttpError(404, 'سند یافت نشد.');
  return doc;
}

async function loadLookedAfter(id: string, viewer: SessionUser) {
  const doc = await loadVisible(id, viewer);
  if (!looksAfter(viewer, doc)) throw new HttpError(403, 'فقط مسئول سند یا مدیر اسناد می‌تواند این کار را انجام دهد.');
  return doc;
}

documentsRouter.get(
  '/documents',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    const rows = await db.select().from(documents).where(visibleTo(viewer)).orderBy(desc(documents.createdAt));
    res.json(await serializeMany(rows, viewer));
  }),
);

const detailsSchema = z.object({
  title: requiredText(200),
  description: optionalText(2000),
  category: requiredText(100),
  requiresAck: z.boolean().default(false),
  ownerId: z.string().max(100).nullable().default(null),
  // The day the owner is reminded to look at the document again (optional).
  reviewDate: jalaliDate.optional().or(z.literal('')),
  targetDepartments: z.array(requiredText(100)).max(50).default([]),
  targetLocations: z.array(requiredText(100)).max(50).default([]),
  targetRoles: z.array(requiredText(100)).max(50).default([]),
  targetUserIds: z.array(requiredText(100)).max(300).default([]),
});

const createSchema = detailsSchema.extend({
  file: attachment,
  notify: z.boolean().default(false),
});

/** Review reminders go out in the morning of the chosen day. */
function reviewAtFrom(reviewDate: string | undefined) {
  if (!reviewDate) return null;
  const at = jalaliToDate(reviewDate, '08:00');
  if (!at) throw new HttpError(400, 'تاریخ بازبینی نامعتبر است.');
  return at;
}

/** A newly chosen review date must still be ahead (an unchanged one may have passed). */
function checkFuture(reviewAt: Date | null) {
  if (reviewAt && reviewAt <= new Date()) throw new HttpError(400, 'تاریخ بازبینی باید در آینده باشد.');
  return reviewAt;
}

async function checkedOwner(ownerId: string | null) {
  if (!ownerId) return null;
  const [owner] = await db.select().from(employees).where(eq(employees.id, ownerId));
  if (!owner?.isActive || !owner.hasAccount) throw new HttpError(400, 'مسئول سند باید همکار فعال با حساب پورتال باشد.');
  return owner.id;
}

/** The columns a create or edit writes. */
async function detailValues(body: z.infer<typeof detailsSchema>) {
  const audience = await checkAudience(body);
  return {
    title: body.title,
    description: body.description,
    category: body.category,
    requiresAck: body.requiresAck,
    ownerId: await checkedOwner(body.ownerId),
    reviewAt: reviewAtFrom(body.reviewDate),
    targetDepartments: audience.departments,
    targetLocations: audience.locations,
    targetRoles: audience.roles,
    targetUserIds: audience.userIds,
  };
}

/** Tells a document's audience (not the person who made the change) that it must be read and confirmed. */
async function askToConfirm(doc: DocumentRow, byId: string, title: string) {
  const recipients = (await audienceIdsFor(audienceOfRow(doc), byId)).filter((id) => id !== doc.ownerId);
  await createNotifications(
    recipients,
    { title, message: doc.version > 1 ? `${doc.title} (نسخهٔ ${toPersianDigits(doc.version)})` : doc.title, type: 'document', linkTab: 'documents', linkId: doc.id },
    { email: true },
  );
}

documentsRouter.post(
  '/documents',
  requirePermission('documents.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(createSchema, req.body);
    const values = await detailValues(body);
    checkFuture(values.reviewAt);
    const [doc] = await db
      .insert(documents)
      .values({
        id: newId('doc'),
        ...values,
        fileUrl: body.file.url,
        fileName: body.file.name,
        fileSize: body.file.size,
        mimeType: body.file.mimeType,
        uploadedById: viewer.id,
      })
      .returning();
    if (doc.requiresAck) {
      await askToConfirm(doc, viewer.id, 'سند لازم‌الاجرا: لطفاً مطالعه و تأیید کنید 📌');
    } else if (body.notify) {
      await createNotifications((await audienceIdsFor(audienceOfRow(doc), viewer.id)), {
        title: 'سند جدید در کتابخانهٔ اسناد 📄',
        message: doc.title,
        type: 'document',
        linkTab: 'documents',
        linkId: doc.id,
      });
    }
    broadcastChange('documents');
    const [serialized] = await serializeMany([doc], viewer);
    res.status(201).json(serialized);
  }),
);

documentsRouter.put(
  '/documents/:id',
  requirePermission('documents.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const [existing] = await db.select().from(documents).where(eq(documents.id, req.params.id));
    if (!existing) throw new HttpError(404, 'سند یافت نشد.');
    const values = await detailValues(parse(detailsSchema, req.body));
    const becameRequired = values.requiresAck && !existing.requiresAck;
    const reviewMoved = values.reviewAt?.getTime() !== existing.reviewAt?.getTime();
    if (reviewMoved) checkFuture(values.reviewAt);
    const [doc] = await db
      .update(documents)
      .set({
        ...values,
        // Confirmations count from the version that was current when the document became mandatory.
        ...(becameRequired ? { ackVersion: existing.version, ackRemindedAt: null } : {}),
        ...(reviewMoved ? { reviewRemindedAt: null } : {}),
      })
      .where(eq(documents.id, existing.id))
      .returning();
    if (becameRequired) await askToConfirm(doc, viewer.id, 'سند لازم‌الاجرا: لطفاً مطالعه و تأیید کنید 📌');
    broadcastChange('documents');
    const [serialized] = await serializeMany([doc], viewer);
    res.json(serialized);
  }),
);

documentsRouter.get(
  '/documents/:id/versions',
  route(async (req, res) => {
    const doc = await loadVisible(req.params.id, viewerOf(req));
    const earlier = await db
      .select({ v: documentVersions, firstName: employees.firstName, lastName: employees.lastName })
      .from(documentVersions)
      .innerJoin(employees, eq(employees.id, documentVersions.uploadedById))
      .where(eq(documentVersions.documentId, doc.id))
      .orderBy(desc(documentVersions.version));
    const [uploader] = await db.select().from(employees).where(eq(employees.id, doc.uploadedById));
    res.json([
      {
        version: doc.version,
        fileUrl: doc.fileUrl,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        note: doc.versionNote,
        uploadedBy: uploader ? fullName(uploader) : '',
        createdAt: doc.updatedAt.toISOString(),
        current: true,
      },
      ...earlier.map(({ v, ...person }) => ({
        version: v.version,
        fileUrl: v.fileUrl,
        fileName: v.fileName,
        fileSize: v.fileSize,
        note: v.note,
        uploadedBy: fullName(person),
        createdAt: v.createdAt.toISOString(),
        current: false,
      })),
    ]);
  }),
);

const versionSchema = z.object({
  file: attachment,
  note: optionalText(500),
  // For a mandatory document: everyone confirms the new version again (off for a typo fix).
  reAck: z.boolean().default(true),
  notify: z.boolean().default(true),
  reviewDate: jalaliDate.optional().or(z.literal('')),
});

/** A new file for the same document: links keep working and the earlier file stays in the history. */
documentsRouter.post(
  '/documents/:id/versions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await loadLookedAfter(req.params.id, viewer);
    const body = parse(versionSchema, req.body);
    const reviewAt = checkFuture(reviewAtFrom(body.reviewDate));
    const reAck = existing.requiresAck && body.reAck;
    const doc = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(documents)
        .set({
          fileUrl: body.file.url,
          fileName: body.file.name,
          fileSize: body.file.size,
          mimeType: body.file.mimeType,
          uploadedById: viewer.id,
          version: existing.version + 1,
          versionNote: body.note,
          updatedAt: new Date(),
          ...(reAck ? { ackVersion: existing.version + 1, ackRemindedAt: null } : {}),
          ...(reviewAt ? { reviewAt, reviewRemindedAt: null } : {}),
        })
        // Two uploads at the same moment: the second one fails instead of losing a version.
        .where(and(eq(documents.id, existing.id), eq(documents.version, existing.version)))
        .returning();
      if (!updated) throw new HttpError(409, 'هم‌زمان نسخهٔ دیگری بارگذاری شد؛ صفحه را تازه کنید و دوباره امتحان کنید.');
      await tx.insert(documentVersions).values({
        documentId: existing.id,
        version: existing.version,
        fileUrl: existing.fileUrl,
        fileName: existing.fileName,
        fileSize: existing.fileSize,
        mimeType: existing.mimeType,
        note: existing.versionNote,
        uploadedById: existing.uploadedById,
        createdAt: existing.updatedAt,
      });
      return updated;
    });
    if (reAck) {
      await askToConfirm(doc, viewer.id, 'نسخهٔ جدید سند لازم‌الاجرا: لطفاً دوباره مطالعه و تأیید کنید 📌');
    } else if (body.notify) {
      await createNotifications((await audienceIdsFor(audienceOfRow(doc), viewer.id)), {
        title: 'نسخهٔ جدید سند 📄',
        message: `${doc.title} (نسخهٔ ${toPersianDigits(doc.version)})${body.note ? `: ${body.note}` : ''}`,
        type: 'document',
        linkTab: 'documents',
        linkId: doc.id,
      });
    }
    broadcastChange('documents');
    const [serialized] = await serializeMany([doc], viewer);
    res.status(201).json(serialized);
  }),
);

/** "Reviewed, still correct": sets the next review date without a new file. */
documentsRouter.post(
  '/documents/:id/review',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const existing = await loadLookedAfter(req.params.id, viewer);
    const { reviewDate } = parse(z.object({ reviewDate: jalaliDate.optional().or(z.literal('')) }), req.body);
    const reviewAt = checkFuture(reviewAtFrom(reviewDate));
    const [doc] = await db.update(documents).set({ reviewAt, reviewRemindedAt: null }).where(eq(documents.id, existing.id)).returning();
    broadcastChange('documents');
    const [serialized] = await serializeMany([doc], viewer);
    res.json(serialized);
  }),
);

documentsRouter.post(
  '/documents/:id/ack',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const doc = await loadVisible(req.params.id, viewer);
    if (!doc.requiresAck) throw new HttpError(400, 'این سند نیاز به تأیید ندارد.');
    const [ack] = await db.select().from(documentAcks).where(and(eq(documentAcks.documentId, doc.id), eq(documentAcks.userId, viewer.id)));
    if (!isConfirmed(doc, ack)) {
      const now = new Date();
      await db
        .insert(documentAcks)
        .values({ documentId: doc.id, userId: viewer.id, version: doc.version, acknowledgedAt: now })
        .onConflictDoUpdate({ target: [documentAcks.documentId, documentAcks.userId], set: { version: doc.version, acknowledgedAt: now } });
    }
    const [serialized] = await serializeMany([doc], viewer);
    res.json(serialized);
  }),
);

/** Who still has to confirm the current version, for its owner and document managers. */
async function pendingPeople(doc: DocumentRow) {
  const audience = audienceOf(doc, await db.select().from(employees));
  const acks = await db.select().from(documentAcks).where(eq(documentAcks.documentId, doc.id));
  const done = new Set(acks.filter((a) => isConfirmed(doc, a)).map((a) => a.userId));
  return audience.filter((p) => !done.has(p.id));
}

documentsRouter.get(
  '/documents/:id/receipts',
  route(async (req, res) => {
    const doc = await loadLookedAfter(req.params.id, currentUser(req));
    const people = await db.select().from(employees).orderBy(employees.department, employees.lastName);
    const acks = new Map((await db.select().from(documentAcks).where(eq(documentAcks.documentId, doc.id))).map((a) => [a.userId, a]));
    res.json(
      audienceOf(doc, people).map((e) => {
        const ack = acks.get(e.id);
        return {
          userId: e.id,
          name: fullName(e),
          department: e.department,
          location: e.location,
          readAt: null,
          acknowledgedAt: isConfirmed(doc, ack) ? ack!.acknowledgedAt.toISOString() : null,
        };
      }),
    );
  }),
);

const REMIND_GAP_MS = 10 * 60 * 1000;

documentsRouter.post(
  '/documents/:id/remind',
  route(async (req, res) => {
    const now = new Date();
    const doc = await loadLookedAfter(req.params.id, currentUser(req));
    if (!doc.requiresAck) throw new HttpError(400, 'این سند نیاز به تأیید ندارد.');
    if (doc.ackRemindedAt && now.getTime() - doc.ackRemindedAt.getTime() < REMIND_GAP_MS) {
      throw new HttpError(429, 'چند دقیقه پیش یادآوری فرستاده شد؛ کمی بعد دوباره امتحان کنید.');
    }
    const pending = await pendingPeople(doc);
    await db.update(documents).set({ ackRemindedAt: now }).where(eq(documents.id, doc.id));
    await createNotifications(
      pending.map((p) => p.id),
      { title: 'یادآوری: سند لازم‌الاجرا را مطالعه و تأیید کنید 📌', message: doc.title, type: 'document', linkTab: 'documents', linkId: doc.id },
    );
    res.json({ sent: pending.length });
  }),
);

documentsRouter.delete(
  '/documents/:id',
  requirePermission('documents.manage'),
  route(async (req, res) => {
    const earlier = await db.select({ fileUrl: documentVersions.fileUrl }).from(documentVersions).where(eq(documentVersions.documentId, req.params.id));
    const deleted = await db.delete(documents).where(eq(documents.id, req.params.id)).returning({ fileUrl: documents.fileUrl });
    if (deleted.length === 0) throw new HttpError(404, 'سند یافت نشد.');
    // Each upload is stored under a unique name, so the files belong only to this document.
    for (const { fileUrl } of [...deleted, ...earlier]) {
      if (fileUrl.startsWith('/uploads/')) {
        await fs.promises.unlink(path.join(config.uploadDir, path.basename(fileUrl))).catch(() => undefined);
      }
    }
    broadcastChange('documents');
    res.json({ success: true });
  }),
);

/**
 * Run by the scheduler: once a document's review date has come, its owner (or whoever uploaded it,
 * when it has no owner) is asked to check it is still correct.
 */
export async function processDocumentReviews(now = new Date()) {
  const due = await db
    .select()
    .from(documents)
    .where(and(isNotNull(documents.reviewAt), lte(documents.reviewAt, now), isNull(documents.reviewRemindedAt)));
  for (const doc of due) {
    const claimed = await db
      .update(documents)
      .set({ reviewRemindedAt: now })
      .where(and(eq(documents.id, doc.id), isNull(documents.reviewRemindedAt)))
      .returning({ id: documents.id });
    if (claimed.length === 0) continue;
    const candidates = await db
      .select()
      .from(employees)
      .where(inArray(employees.id, [doc.ownerId, doc.uploadedById].filter((id): id is string => Boolean(id))));
    const recipient = [doc.ownerId, doc.uploadedById].map((id) => candidates.find((c) => c.id === id)).find((c) => c?.isActive && c.hasAccount);
    if (!recipient) continue;
    await createNotifications([recipient.id], {
      title: 'زمان بازبینی سند رسیده است 🗂️',
      message: `«${doc.title}» را بازبینی کنید: اگر هنوز درست است «بازبینی شد» را بزنید، وگرنه نسخهٔ جدید را بارگذاری کنید.`,
      type: 'document',
      linkTab: 'documents',
      linkId: doc.id,
    });
  }
  if (due.length > 0) broadcastChange('documents');
}
