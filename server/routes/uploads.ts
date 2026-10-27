import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import { type AuthedRequest, can, type SessionUser } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { documents, trainings } from '../db/schema.js';
import { currentUser, HttpError, route } from '../http.js';

export const uploadsRouter = Router();

// SVG and HTML are deliberately excluded: they can carry scripts.
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'text/plain': '.txt',
};

fs.mkdirSync(config.uploadDir, { recursive: true });

/**
 * Document managers, the owners of documents (for new versions of their own documents), and the
 * people who run trainings and instructors (for handouts and slides).
 */
async function mayUploadDocuments(user: SessionUser | undefined) {
  if (!user) return false;
  if (can(user, 'documents.manage') || can(user, 'trainings.manage')) return true;
  const [[owned], [teaches]] = await Promise.all([
    db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, user.id)).limit(1),
    db.select({ id: trainings.id }).from(trainings).where(eq(trainings.instructorId, user.id)).limit(1),
  ]);
  return Boolean(owned || teaches);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] ?? DOCUMENT_TYPES[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isImage = file.mimetype in IMAGE_TYPES;
    const isDocument = file.mimetype in DOCUMENT_TYPES;
    if (isImage) return cb(null, true);
    if (!isDocument) return cb(new HttpError(400, 'نوع فایل مجاز نیست.'));
    mayUploadDocuments((req as AuthedRequest).user).then(
      (allowed) => (allowed ? cb(null, true) : cb(new HttpError(400, 'بارگذاری سند فقط برای مدیران اسناد، مسئولان اسناد و مدرسان دوره‌ها مجاز است.'))),
      (err: Error) => cb(err),
    );
  },
});

uploadsRouter.post(
  '/uploads',
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(400, `حجم فایل نباید بیشتر از ${config.maxUploadMb} مگابایت باشد.`));
      } else next(err);
    });
  },
  route(async (req, res) => {
    currentUser(req);
    if (!req.file) throw new HttpError(400, 'فایلی انتخاب نشده است.');
    // Multer decodes multipart filenames as latin1; restore UTF-8 so Persian names survive.
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    res.status(201).json({
      name,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  }),
);
