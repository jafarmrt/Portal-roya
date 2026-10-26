import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireManager } from '../auth.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { parse, route } from '../http.js';
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
  })
  .partial();

settingsRouter.put(
  '/settings',
  requireManager,
  route(async (req, res) => {
    const body = parse(updateSchema, req.body);
    await ensureSettings();
    const [updated] = await db.update(settings).set(body).where(eq(settings.id, 'global')).returning();
    broadcastChange('settings');
    res.json(updated);
  }),
);
