import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, parse, route } from '../http.js';
import { ensureSettings } from '../settings.js';
import { requiredText } from '../validation.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/settings',
  route(async (_req, res) => {
    res.json(await ensureSettings());
  }),
);

const list = z.array(requiredText(100)).max(100);
const systemSchema = z.object({
  id: requiredText(100),
  name: requiredText(100),
  description: z.string().trim().max(300).default(''),
  iconName: requiredText(50),
  // Logos must live on this server: only images returned by /api/uploads are accepted.
  imageUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^\/uploads\/[\w-]+\.(jpg|png|webp|gif)$/.test(v), 'تصویر سامانه باید روی همین سرور بارگذاری شده باشد')
    .default(''),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '#' || /^https?:\/\//.test(v), 'آدرس سامانه باید با http:// یا https:// شروع شود'),
  bgColor: requiredText(50),
  textColor: requiredText(50),
});

const updateSchema = z
  .object({
    departments: list,
    newsCategories: list,
    trainingCategories: list,
    documentCategories: list,
    systems: z.array(systemSchema).max(50),
    guestAccess: z.boolean(),
    guestDirectory: z.boolean(),
  })
  .partial();

settingsRouter.put(
  '/settings',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(updateSchema, req.body);
    // App links have their own permission; everything else is portal configuration.
    const { systems, ...lists } = body;
    if (systems !== undefined && !can(viewer, 'systems.manage')) {
      throw new HttpError(403, 'شما اجازهٔ ویرایش سامانه‌ها را ندارید.');
    }
    if (Object.keys(lists).length > 0 && !can(viewer, 'settings.manage')) {
      throw new HttpError(403, 'شما اجازهٔ تغییر تنظیمات پرتال را ندارید.');
    }
    await ensureSettings();
    const [updated] = await db.update(settings).set(body).where(eq(settings.id, 'global')).returning();
    broadcastChange('settings');
    res.json(updated);
  }),
);
