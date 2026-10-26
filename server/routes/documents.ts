import fs from 'fs';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireManager } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { documents, employees } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName } from '../serializers.js';
import { attachment, optionalText, requiredText } from '../validation.js';

export const documentsRouter = Router();

documentsRouter.get(
  '/documents',
  route(async (_req, res) => {
    const rows = await db
      .select({ doc: documents, firstName: employees.firstName, lastName: employees.lastName })
      .from(documents)
      .innerJoin(employees, eq(employees.id, documents.uploadedById))
      .orderBy(desc(documents.createdAt));
    res.json(
      rows.map(({ doc, ...uploader }) => ({
        ...doc,
        uploadedBy: fullName(uploader),
        createdAt: doc.createdAt.toISOString(),
      })),
    );
  }),
);

const documentSchema = z.object({
  title: requiredText(200),
  description: optionalText(2000),
  category: requiredText(100),
  file: attachment,
  notify: z.boolean().default(false),
});

documentsRouter.post(
  '/documents',
  requireManager,
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(documentSchema, req.body);
    const [doc] = await db
      .insert(documents)
      .values({
        id: newId('doc'),
        title: body.title,
        description: body.description,
        category: body.category,
        fileUrl: body.file.url,
        fileName: body.file.name,
        fileSize: body.file.size,
        mimeType: body.file.mimeType,
        uploadedById: viewer.id,
      })
      .returning();
    if (body.notify) {
      await createNotifications(await audienceIds([], viewer.id), {
        title: 'سند جدید در کتابخانهٔ اسناد 📄',
        message: body.title,
        type: 'document',
        linkTab: 'documents',
      });
    }
    broadcastChange('documents');
    res.status(201).json(doc);
  }),
);

documentsRouter.delete(
  '/documents/:id',
  requireManager,
  route(async (req, res) => {
    const deleted = await db.delete(documents).where(eq(documents.id, req.params.id)).returning({ fileUrl: documents.fileUrl });
    if (deleted.length === 0) throw new HttpError(404, 'سند یافت نشد.');
    // Each upload is stored under a unique name, so the file belongs only to this document.
    const { fileUrl } = deleted[0];
    if (fileUrl.startsWith('/uploads/')) {
      await fs.promises.unlink(path.join(config.uploadDir, path.basename(fileUrl))).catch(() => undefined);
    }
    broadcastChange('documents');
    res.json({ success: true });
  }),
);
