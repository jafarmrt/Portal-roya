import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import {
  FEATURE_STATES,
  FEATURES,
  type FeatureKey,
  type FeatureState,
  featureInfo,
  featureState,
  featureVisible,
  introCardsAllowed,
  isFeatureKey,
  LAUNCH_NEWS_DAYS,
  switchable,
} from '../../shared/features.js';
import { boxNames, SUGGESTION_BOXES } from '../../shared/suggestions.js';
import { dashboardOrder } from '../../shared/dashboard.js';
import { toPersianDigits } from '../../shared/jalali.js';
import { audit, fromTo } from '../audit.js';
import { can, requirePermission, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { employees, news, settings } from '../db/schema.js';
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
import { broadcastChange, type ResourceName } from '../events.js';
import { featureConfig } from '../features.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { serverStatus } from '../maintenance.js';
import { ensureSettings } from '../settings.js';
import { jalaliDateValue, requiredText } from '../validation.js';

export const settingsRouter = Router();

/**
 * The settings everyone (guests included) receives; a banner past its end time is left out. The part
 * switches come as what this viewer sees: the parts shown to them (in preview or for everyone) and the
 * newly introduced ones they have not opened yet. The pilot group is only for the settings page.
 */
export function publicSettings(row: typeof settings.$inferSelect, viewer: SessionUser | null) {
  const { features: states, featureLaunches, pilotRoles, pilotUserIds, ...rest } = row;
  const banner = rest.banner && new Date(rest.banner.expiresAt) > new Date() ? rest.banner : null;
  const config = { states, pilotRoles, pilotUserIds };
  const features: Partial<Record<FeatureKey, 'preview' | 'on'>> = {};
  const featureNews: { key: FeatureKey; badge: boolean; card: boolean }[] = [];
  const since = Date.now() - LAUNCH_NEWS_DAYS * 24 * 60 * 60 * 1000;
  for (const { key } of FEATURES) {
    if (!featureVisible(config, key, viewer)) continue;
    const state = featureState(config, key);
    features[key] = state === 'on' ? 'on' : 'preview';
    const launch = featureLaunches[key];
    const card = Boolean(launch?.card && introCardsAllowed(launch.at));
    if (state === 'on' && viewer && launch && (launch.badge || card) && new Date(launch.at).getTime() > since && !viewer.seenFeatures.includes(key)) {
      featureNews.push({ key, badge: launch.badge, card });
    }
  }
  // Guests cannot switch the effect off, but can stop it each time it plays.
  return {
    ...rest,
    banner,
    features,
    featureNews,
    occasionEffects: viewer?.occasionEffects ?? true,
    // The colleague's own card order, only while the switch for it is on; otherwise the default order.
    dashboardOrder: viewer && features.dashboardLayout ? viewer.dashboardOrder : [],
  };
}

settingsRouter.get(
  '/settings',
  route(async (req, res) => {
    res.json(publicSettings(await ensureSettings(), viewerOf(req)));
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
    // The suggestion boxes' names, e.g. «صندوق مدیرعامل»; '' keeps the built-in name.
    suggestionBoxNames: z.object(
      Object.fromEntries(SUGGESTION_BOXES.map((b) => [b.id, z.object({ label: z.string().trim().max(60), to: z.string().trim().max(60) }).optional()])) as Record<
        (typeof SUGGESTION_BOXES)[number]['id'],
        z.ZodOptional<z.ZodObject<{ label: z.ZodString; to: z.ZodString }>>
      >,
    ),
    // The order of the dashboard cards for everyone who has not arranged their own; [] = the built-in order.
    dashboardDefaultOrder: z.array(z.string().max(50)).max(50).transform((order) => (order.length ? dashboardOrder(order) : [])),
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
  suggestionBoxNames: 'نام صندوق‌های انتقادات و پیشنهادات',
  dashboardDefaultOrder: 'ترتیب پیش‌فرض کارت‌های داشبورد',
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
    } else if (key === 'dashboardDefaultOrder') {
      detail = after.dashboardDefaultOrder.length ? 'ترتیب تازه' : 'برگشت به ترتیب اولیه';
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
    } else if (key === 'suggestionBoxNames') {
      const names = (row: SettingsRow, id: string) => Object.values(boxNames(row.suggestionBoxNames, id)).join(' / ');
      detail = SUGGESTION_BOXES.filter((b) => names(before, b.id) !== names(after, b.id))
        .map((b) => fromTo(names(before, b.id), names(after, b.id)))
        .join('؛ ');
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
    // A box left out keeps its names.
    if (body.suggestionBoxNames) body.suggestionBoxNames = { ...before.suggestionBoxNames, ...body.suggestionBoxNames };
    const [updated] = await db.update(settings).set(body).where(eq(settings.id, 'global')).returning();
    for (const change of settingChanges(before, updated, Object.keys(body) as (keyof typeof SETTING_LABELS)[])) {
      await audit(viewer, { action: 'update', entity: 'settings', title: change.label, detail: change.detail });
    }
    broadcastChange('settings');
    res.json(publicSettings(updated, viewerOf(req)));
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
    res.json(publicSettings(updated, viewerOf(req)));
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
    res.json(publicSettings(updated, viewerOf(req)));
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
    res.json(list.map((name) => ({ name, ...(usage.get(name) ?? { employees: 0, activeEmployees: 0, news: 0, documents: 0, polls: 0, events: 0, guides: 0 }) })));
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
    res.json(list.map((name) => ({ name, ...(usage.get(name) ?? { employees: 0, activeEmployees: 0, news: 0, documents: 0, polls: 0, events: 0, guides: 0 }) })));
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

// --- Parts of the portal switched off, in preview, or on for everyone ---

/** What an open page loads again when a part appears or disappears for someone. */
const FEATURE_RESOURCES: Record<FeatureKey, ResourceName[]> = {
  suggestions: ['notifications'],
  suggestionsManagement: ['notifications'],
  suggestionsHr: ['notifications'],
  polls: ['polls', 'notifications'],
  training: ['trainings', 'calendar', 'notifications'],
  guides: ['guides'],
  departmentPages: ['department_pages'],
  mood: ['moods'],
  todos: ['todos', 'notifications'],
  occasionThemes: [],
  dashboardLayout: [],
};

function broadcastFeatures(keys: FeatureKey[]) {
  for (const resource of new Set(['settings' as const, ...keys.flatMap((k) => FEATURE_RESOURCES[k])])) broadcastChange(resource);
}

/** A part's name as the settings page and the change history show it; a suggestion box by the name the administrator gave it. */
function featureLabel(row: SettingsRow, key: FeatureKey) {
  const box = SUGGESTION_BOXES.find((b) => b.feature === key);
  return box ? boxNames(row.suggestionBoxNames, box.id).label : featureInfo(key).label;
}

/** Every part with a switch of its own, with its state and the pilot group, for the settings page. */
async function featureSettings() {
  const row = await ensureSettings();
  return {
    features: FEATURES.filter((f) => switchable(f.key)).map((f) => ({
      key: f.key,
      label: featureLabel(row, f.key),
      hint: f.hint,
      group: 'group' in f ? f.group : null,
      state: featureState({ states: row.features }, f.key),
      launchedAt: row.featureLaunches[f.key]?.at ?? null,
    })),
    pilotRoles: row.pilotRoles,
    pilotUserIds: row.pilotUserIds,
  };
}

settingsRouter.get(
  '/settings/features',
  requirePermission('settings.manage'),
  route(async (_req, res) => {
    res.json(await featureSettings());
  }),
);

const featureUpdateSchema = z.object({
  state: z.enum(['off', 'preview', 'on']),
  // How to introduce it when it is switched on for everyone; all optional.
  announce: z.object({ badge: z.boolean(), card: z.boolean(), draft: z.boolean() }).partial().default({}),
});

const stateLabel = (state: FeatureState) => FEATURE_STATES.find((s) => s.id === state)?.label ?? state;

settingsRouter.put(
  '/settings/features/:key',
  requirePermission('settings.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const key = String(req.params.key);
    if (!isFeatureKey(key)) throw new HttpError(404, 'این بخش در پرتال نیست.');
    if (!switchable(key)) throw new HttpError(400, 'این بخش کلید جداگانه ندارد؛ هر صندوق را جدا روشن یا خاموش کنید.');
    const body = parse(featureUpdateSchema, req.body);
    const row = await ensureSettings();
    const before = featureState({ states: row.features }, key);
    const info = featureInfo(key);
    const label = featureLabel(row, key);
    const states = { ...row.features };
    // A box of a section that had one switch for both: the other box keeps the section's old state.
    const group = info.group && isFeatureKey(info.group) ? info.group : null;
    const groupBefore = group ? featureState({ states: row.features }, group) : null;
    if (group && states[group] !== undefined) {
      for (const f of FEATURES) if ('group' in f && f.group === group && states[f.key] === undefined) states[f.key] = states[group];
      delete states[group];
    }
    states[key] = body.state;
    const launches = { ...row.featureLaunches };
    let draftId: string | null = null;
    if (body.state === 'on' && before !== 'on') {
      const { badge = false, card = false, draft = false } = body.announce;
      const launch = { at: new Date().toISOString(), badge, card };
      // The first box switched on for everyone introduces the whole section (its page and its «جدید»).
      launches[group && groupBefore !== 'on' ? group : key] = launch;
      // A draft only: whoever publishes news edits and publishes it when the day comes.
      if (draft) {
        draftId = newId('news');
        await db.insert(news).values({
          id: draftId,
          title: `تازه در پرتال: ${label}`,
          summary: info.hint,
          content: `${info.intro}\n\nاگر پرسشی داشتید، با واحد فناوری اطلاعات در میان بگذارید.`,
          contentFormat: 'text',
          category: row.newsCategories[0] ?? 'اخبار سازمان',
          authorId: viewer.id,
          isDraft: true,
        });
        broadcastChange('news');
      }
    }
    await db.update(settings).set({ features: states, featureLaunches: launches }).where(eq(settings.id, 'global'));
    if (before !== body.state) {
      await audit(viewer, { action: 'update', entity: 'settings', title: `امکانات پرتال: ${label}`, detail: fromTo(stateLabel(before), stateLabel(body.state)) });
    }
    broadcastFeatures(group ? [key, group] : [key]);
    res.json({ ...(await featureSettings()), draftId });
  }),
);

const pilotSchema = z.object({
  roles: z.array(requiredText(100)).max(50),
  userIds: z.array(requiredText(100)).max(300),
});

/** Who tries the parts in preview besides the administrator. */
settingsRouter.put(
  '/settings/pilot',
  requirePermission('settings.manage'),
  route(async (req, res) => {
    const body = parse(pilotSchema, req.body);
    const roles = [...new Set(body.roles)];
    const userIds = [...new Set(body.userIds)];
    await ensureSettings();
    await db.update(settings).set({ pilotRoles: roles, pilotUserIds: userIds }).where(eq(settings.id, 'global'));
    await audit(currentUser(req), {
      action: 'update',
      entity: 'settings',
      title: 'گروه آزمایشی',
      detail: `${toPersianDigits(roles.length)} نقش و ${toPersianDigits(userIds.length)} همکار`,
    });
    broadcastFeatures(FEATURES.map((f) => f.key));
    res.json(await featureSettings());
  }),
);

/** The colleague opened a newly introduced part or closed its introduction; «جدید» goes away for them. */
settingsRouter.post(
  '/settings/features/:key/seen',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const key = String(req.params.key);
    if (!isFeatureKey(key)) throw new HttpError(404, 'این بخش در پرتال نیست.');
    let seen = viewer.seenFeatures;
    if (!seen.includes(key)) {
      seen = [...seen, key];
      await db.update(employees).set({ seenFeatures: seen }).where(eq(employees.id, viewer.id));
    }
    res.json(publicSettings(await ensureSettings(), { ...viewer, seenFeatures: seen }));
  }),
);

/** The colleague's own switch for the once-a-day effect of the occasions and seasons. */
settingsRouter.put(
  '/settings/occasion-effects',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    await db.update(employees).set({ occasionEffects: on }).where(eq(employees.id, viewer.id));
    res.json(publicSettings(await ensureSettings(), { ...viewer, occasionEffects: on }));
  }),
);

/** The colleague's own order of the dashboard cards; an empty list puts the default order back. */
settingsRouter.put(
  '/settings/dashboard-order',
  route(async (req, res) => {
    const viewer = currentUser(req);
    if (!featureVisible(await featureConfig(), 'dashboardLayout', viewer)) throw new HttpError(404, 'مسیر یافت نشد.');
    const { order } = parse(z.object({ order: z.array(z.string().max(50)).max(50) }), req.body);
    const saved = order.length === 0 ? [] : dashboardOrder(order);
    await db.update(employees).set({ dashboardOrder: saved }).where(eq(employees.id, viewer.id));
    res.json(publicSettings(await ensureSettings(), { ...viewer, dashboardOrder: saved }));
  }),
);
