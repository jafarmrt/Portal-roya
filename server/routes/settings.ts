import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { audit, fromTo } from '../audit.js';
import { can, requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import {
  checkDepartmentList,
  checkLocationList,
  departmentList,
  departmentUsage,
  locationList,
  locationUsage,
  renameDepartment,
  requireDepartment,
  renameLocation,
} from '../departments.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, parse, route } from '../http.js';
import { serverStatus } from '../maintenance.js';
import { ensureSettings } from '../settings.js';
import { jalaliDateValue, requiredText } from '../validation.js';

export const settingsRouter = Router();

/** The settings everyone (guests included) receives; a banner past its end time is left out. */
export function publicSettings(row: typeof settings.$inferSelect) {
  const banner = row.banner && new Date(row.banner.expiresAt) > new Date() ? row.banner : null;
  return { ...row, banner };
}

settingsRouter.get(
  '/settings',
  route(async (_req, res) => {
    res.json(publicSettings(await ensureSettings()));
  }),
);

const list = z.array(requiredText(100)).max(100);
// Logos must live on this server: only images returned by /api/uploads are accepted.
const uploadedImage = (message: string) =>
  z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^\/uploads\/[\w-]+\.(jpg|png|webp|gif)$/.test(v), message);
const systemSchema = z.object({
  id: requiredText(100),
  name: requiredText(100),
  description: z.string().trim().max(300).default(''),
  iconName: requiredText(50),
  imageUrl: uploadedImage('تصویر سامانه باید روی همین سرور بارگذاری شده باشد').default(''),
  // Inside the company network, and from the internet; either may be left empty.
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || v === '#' || /^https?:\/\//.test(v), 'آدرس داخلی سامانه باید با http:// یا https:// شروع شود'),
  externalUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\//.test(v), 'آدرس بیرونی سامانه باید با http:// یا https:// شروع شود')
    .default(''),
  bgColor: requiredText(50),
  textColor: requiredText(50),
  // The department that runs it ('' for none), shown on that department's page.
  department: z.string().trim().max(100).optional().default(''),
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
    locations: list,
    // Dashboard cards switched on or off, by card id.
    dashboardCards: z.record(z.string().max(50), z.boolean()),
    // Company logo in the header; '' puts the built-in ROYA wordmark back.
    logoUrl: uploadedImage('لوگو باید روی همین سرور بارگذاری شده باشد'),
    // The company's founding day and the message everyone sees on it.
    foundingDate: jalaliDateValue,
    foundingMessage: z.string().trim().max(500),
  })
  .partial();

const SETTING_LABELS: Record<keyof z.infer<typeof updateSchema>, string> = {
  departments: 'واحدهای سازمانی',
  newsCategories: 'دسته‌بندی اخبار',
  trainingCategories: 'دسته‌بندی دوره‌ها',
  documentCategories: 'دسته‌بندی اسناد',
  systems: 'لینک سامانه‌ها',
  guestAccess: 'دسترسی مهمان',
  guestDirectory: 'دفتر تلفن برای مهمان',
  locations: 'محل‌های استقرار',
  dashboardCards: 'کارت‌های داشبورد',
  logoUrl: 'لوگوی شرکت',
  foundingDate: 'تاریخ تأسیس شرکت',
  foundingMessage: 'پیام سالگرد تأسیس',
};

type SettingsRow = typeof settings.$inferSelect;

/** What a settings save changed, in words: items added to and removed from a list, a switch turned on or off. */
function settingChanges(before: SettingsRow, after: SettingsRow, keys: (keyof typeof SETTING_LABELS)[]) {
  const changes: { label: string; detail: string }[] = [];
  for (const key of keys) {
    const was = before[key];
    const now = after[key];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    let detail = '';
    if (typeof now === 'boolean') detail = now ? 'روشن شد' : 'خاموش شد';
    else if (key === 'systems') {
      const names = (list: SettingsRow['systems']) => list.map((s) => s.name);
      const added = names(after.systems).filter((n) => !names(before.systems).includes(n));
      const removed = names(before.systems).filter((n) => !names(after.systems).includes(n));
      detail = [added.length ? `اضافه: ${added.join('، ')}` : '', removed.length ? `حذف: ${removed.join('، ')}` : ''].filter(Boolean).join('؛ ') || 'ویرایش';
    } else if (Array.isArray(now) && Array.isArray(was)) {
      const added = (now as string[]).filter((n) => !(was as string[]).includes(n));
      const removed = (was as string[]).filter((n) => !(now as string[]).includes(n));
      detail = [added.length ? `اضافه: ${added.join('، ')}` : '', removed.length ? `حذف: ${removed.join('، ')}` : ''].filter(Boolean).join('؛ ') || 'ترتیب';
    } else if (key === 'dashboardCards') {
      detail = 'روشن و خاموش کردن کارت‌ها';
    } else if (key === 'logoUrl') {
      detail = after.logoUrl ? 'لوگوی جدید' : 'برگشت به لوگوی پیش‌فرض';
    } else if (key === 'foundingDate') {
      detail = fromTo(before.foundingDate, after.foundingDate);
    }
    changes.push({ label: SETTING_LABELS[key], detail });
  }
  return changes;
}

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
    const before = await ensureSettings();
    if (body.departments) body.departments = await checkDepartmentList(body.departments);
    if (body.locations) body.locations = await checkLocationList(body.locations);
    for (const system of systems ?? []) if (system.department) system.department = await requireDepartment(system.department);
    const [updated] = await db.update(settings).set(body).where(eq(settings.id, 'global')).returning();
    for (const change of settingChanges(before, updated, Object.keys(body) as (keyof typeof SETTING_LABELS)[])) {
      await audit(viewer, { action: 'update', entity: 'settings', title: change.label, detail: change.detail });
    }
    broadcastChange('settings');
    res.json(publicSettings(updated));
  }),
);

const MAX_BANNER_DAYS = 30;
const bannerSchema = z.object({
  text: requiredText(200),
  level: z.enum(['info', 'warning']),
  expiresAt: z.iso.datetime({ offset: true }),
});

/** Sets the short message shown above every page until expiresAt (people who publish news may do this). */
settingsRouter.put(
  '/settings/banner',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(bannerSchema, req.body);
    const expiresAt = new Date(body.expiresAt);
    const now = new Date();
    if (expiresAt <= now) throw new HttpError(400, 'زمان پایان پیام باید در آینده باشد.');
    if (expiresAt.getTime() - now.getTime() > MAX_BANNER_DAYS * 24 * 60 * 60 * 1000) {
      throw new HttpError(400, `پیام سراسری حداکثر ${MAX_BANNER_DAYS} روز نمایش داده می‌شود؛ برای خبرهای ماندگار اطلاعیه منتشر کنید.`);
    }
    await ensureSettings();
    const banner = { text: body.text, level: body.level, expiresAt: expiresAt.toISOString(), updatedById: viewer.id, updatedAt: now.toISOString() };
    const [updated] = await db.update(settings).set({ banner }).where(eq(settings.id, 'global')).returning();
    await audit(viewer, { action: 'update', entity: 'settings', title: 'پیام سراسری', detail: body.text });
    broadcastChange('settings');
    res.json(publicSettings(updated));
  }),
);

settingsRouter.delete(
  '/settings/banner',
  requirePermission('news.manage'),
  route(async (req, res) => {
    const before = await ensureSettings();
    const [updated] = await db.update(settings).set({ banner: null }).where(eq(settings.id, 'global')).returning();
    if (before.banner) await audit(currentUser(req), { action: 'delete', entity: 'settings', title: 'پیام سراسری', detail: before.banner.text });
    broadcastChange('settings');
    res.json(publicSettings(updated));
  }),
);

/** Disk space, backups and housekeeping, for the "server status" card. */
settingsRouter.get(
  '/settings/server-status',
  requirePermission('settings.manage'),
  route(async (_req, res) => {
    res.json(await serverStatus());
  }),
);

/** Each department in the list with how many colleagues, news items, documents and polls use it. */
settingsRouter.get(
  '/settings/departments',
  requirePermission('settings.manage'),
  route(async (_req, res) => {
    const usage = await departmentUsage();
    const list = await departmentList();
    res.json(list.map((name) => ({ name, ...(usage.get(name) ?? { employees: 0, activeEmployees: 0, news: 0, documents: 0, polls: 0 }) })));
  }),
);

const renameSchema = z.object({ from: requiredText(100), to: requiredText(100) });

/** Renames a department everywhere, or merges it into another one when `to` is already in the list. */
settingsRouter.post(
  '/settings/departments/rename',
  requirePermission('settings.manage'),
  route(async (req, res) => {
    const body = parse(renameSchema, req.body);
    const result = await renameDepartment(body.from, body.to);
    await audit(currentUser(req), { action: 'update', entity: 'settings', title: 'واحدهای سازمانی', detail: `${fromTo(result.from, result.to)}${result.merged ? ' (ادغام)' : ''}` });
    res.json(result);
  }),
);

/** Each location in the list with how many colleagues and news items use it. */
settingsRouter.get(
  '/settings/locations',
  requirePermission('settings.manage'),
  route(async (_req, res) => {
    const usage = await locationUsage();
    const list = await locationList();
    res.json(list.map((name) => ({ name, ...(usage.get(name) ?? { employees: 0, activeEmployees: 0, news: 0, documents: 0, polls: 0 }) })));
  }),
);

/** Renames a location everywhere, or merges it into another one when `to` is already in the list. */
settingsRouter.post(
  '/settings/locations/rename',
  requirePermission('settings.manage'),
  route(async (req, res) => {
    const body = parse(renameSchema, req.body);
    const result = await renameLocation(body.from, body.to);
    await audit(currentUser(req), { action: 'update', entity: 'settings', title: 'محل‌های استقرار', detail: `${fromTo(result.from, result.to)}${result.merged ? ' (ادغام)' : ''}` });
    res.json(result);
  }),
);
