import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { WISH_REACTIONS } from '../../shared/celebrations.js';
import { featureState } from '../../shared/features.js';
import { jalaliMonthLabel, toPersianDigits } from '../../shared/jalali.js';
import {
  amountsText,
  DEFAULT_RECOGNITION_VALUES,
  RECOGNITION_AMOUNTS_MAX,
  RECOGNITION_MESSAGE_MAX,
  RECOGNITION_REASON_MAX,
  RECOGNITION_REASON_MIN,
  RECOGNITION_REPORT_NOTE_MAX,
  RECOGNITION_TONES,
  RECOGNITION_VALUE_DESCRIPTION_MAX,
  RECOGNITION_VALUE_LABEL_MAX,
  RECOGNITION_VALUES_MAX,
  type RecognitionRules,
  recognitionMonth,
  recognitionValues,
  rulesFor,
  rulesProblem,
  withRulesChange,
} from '../../shared/recognition.js';
import { MAIN_TOUR_LAST_STEP } from '../../shared/recognitionTutorial.js';
import { audit } from '../audit.js';
import { requirePermission } from '../auth.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { featureConfig } from '../features.js';
import { HttpError, currentUser, parse, route } from '../http.js';
import {
  answerRecognition,
  closeRecognitionReport,
  giveRecognition,
  hideRecognition,
  joinRecognition,
  myRecognitions,
  openRecognition,
  parseCursor,
  recognisable,
  recognitionReport,
  recognitionReports,
  recognitionTutorial,
  recognitionWall,
  reportRecognition,
  reverseRecognition,
  setRecognitionReminders,
  setRecognitionTutorial,
  walletOf,
  withdrawRecognition,
} from '../recognition.js';
import { ensureSettings } from '../settings.js';

// «سپاس»: the API of giving coins with a message of thanks. The rules are in shared/recognition.ts and
// what each request does, and who may read what, in server/recognition.ts.

export const recognitionRouter = Router();

/** `?before=` of a list: the `next` the page before came with. */
const before = z
  .string()
  .max(200)
  .transform((v) => parseCursor(v))
  .refine((cursor) => cursor !== null, 'ادامهٔ فهرست درست نیست')
  .transform((cursor) => cursor!)
  .optional();

const idParam = (value: unknown) => parse(z.string().min(1).max(100), value);

/** The month's wallet: what is left to give, how far the month has gone, and the form's choices. */
recognitionRouter.get(
  '/recognitions/wallet',
  route(async (req, res) => {
    res.json(await walletOf(currentUser(req)));
  }),
);

/** The colleagues a recognition can go to. */
recognitionRouter.get(
  '/recognitions/colleagues',
  route(async (req, res) => {
    res.json(await recognisable(currentUser(req)));
  }),
);

/** The wall everyone sees: public recognitions, without amounts. */
recognitionRouter.get(
  '/recognitions/wall',
  route(async (req, res) => {
    const query = parse(z.object({ value: z.string().max(100).optional(), department: z.string().max(100).optional(), before }), req.query);
    res.json(await recognitionWall(currentUser(req), { valueId: query.value || undefined, department: query.department || undefined, before: query.before }));
  }),
);

/** What the colleague received and gave; only they see it. */
recognitionRouter.get(
  '/recognitions/mine',
  route(async (req, res) => {
    const query = parse(z.object({ receivedBefore: before, givenBefore: before }), req.query);
    res.json(await myRecognitions(currentUser(req), query));
  }),
);

const giveSchema = z.object({
  to: z.string({ error: 'همکار را انتخاب کنید.' }).min(1).max(100),
  amount: z.number({ error: 'مقدار سکه را انتخاب کنید.' }).int(),
  valueId: z.string({ error: 'یک ارزش را انتخاب کنید.' }).min(1).max(100),
  message: z.string({ error: 'پیام قدردانی را بنویسید.' }).max(RECOGNITION_MESSAGE_MAX),
  isPublic: z.boolean().default(true),
});

recognitionRouter.post(
  '/recognitions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const row = await giveRecognition(viewer, parse(giveSchema, req.body));
    res.status(201).json({ id: row.id, withdrawUntil: row.deliverAt.toISOString(), wallet: await walletOf(viewer) });
  }),
);

/** «من هم»: a few coins of one's own on a card of the wall. */
recognitionRouter.post(
  '/recognitions/:id/join',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const row = await joinRecognition(viewer, idParam(req.params.id));
    res.status(201).json({ id: row.id, withdrawUntil: row.deliverAt.toISOString(), wallet: await walletOf(viewer) });
  }),
);

/** «پشیمان شدم»: within the first minutes, before the receiver has heard of it. */
recognitionRouter.post(
  '/recognitions/:id/withdraw',
  route(async (req, res) => {
    const viewer = currentUser(req);
    await withdrawRecognition(viewer, idParam(req.params.id));
    res.json({ wallet: await walletOf(viewer) });
  }),
);

const tourState = z.enum(['active', 'later', 'skipped', 'done']);
const shortTour = z.enum(['done', 'skipped']);
const tutorialSchema = z.object({
  main: z.object({ state: tourState, step: z.number().int().min(0).max(MAIN_TOUR_LAST_STEP) }).optional(),
  received: shortTour.optional(),
  owner: shortTour.optional(),
  missions: z.object({ hidden: z.boolean().optional(), celebrated: z.boolean().optional() }).optional(),
});

/** How far the colleague got in the tutorials, and which of the five missions are done. */
recognitionRouter.get(
  '/recognitions/tutorial',
  route(async (req, res) => {
    res.json(await recognitionTutorial(currentUser(req)));
  }),
);

/** A step of a tutorial; parts not named stay as they were. */
recognitionRouter.put(
  '/recognitions/tutorial',
  route(async (req, res) => {
    res.json({ progress: await setRecognitionTutorial(currentUser(req), parse(tutorialSchema, req.body)) });
  }),
);

/** The colleague's two monthly reminders, on or off. */
recognitionRouter.put(
  '/recognitions/reminders',
  route(async (req, res) => {
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    res.json(await setRecognitionReminders(currentUser(req), on));
  }),
);

/** The owner's numbers of one Jalali month: counts by unit and value, never anyone's own. */
recognitionRouter.get(
  '/recognitions/report',
  requirePermission('recognition.manage'),
  route(async (req, res) => {
    const now = new Date();
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}\/\d{2}$/, 'ماه درست نیست').optional() }), req.query);
    const asked = month ?? recognitionMonth(now);
    if (asked > recognitionMonth(now)) throw new HttpError(400, 'این ماه هنوز نرسیده است.');
    res.json(await recognitionReport(asked, now));
  }),
);

/** The receiver opens the seal. */
recognitionRouter.post(
  '/recognitions/:id/open',
  route(async (req, res) => {
    res.json(await openRecognition(currentUser(req), idParam(req.params.id)));
  }),
);

/** The receiver's own emoji on a recognition they opened, as on a greeting card. */
recognitionRouter.put(
  '/recognitions/:id/reaction',
  route(async (req, res) => {
    const { reaction } = parse(z.object({ reaction: z.union([z.enum(WISH_REACTIONS), z.literal('')]) }), req.body);
    res.json(await answerRecognition(currentUser(req), idParam(req.params.id), reaction));
  }),
);

/** The receiver takes a public recognition off the wall, or puts it back. */
recognitionRouter.put(
  '/recognitions/:id/hidden',
  route(async (req, res) => {
    const { hidden } = parse(z.object({ hidden: z.boolean() }), req.body);
    res.json(await hideRecognition(currentUser(req), idParam(req.params.id), hidden));
  }),
);

/** «گزارش»: the receiver asks the programme's owner to look at one; from then on the owner can read it. */
recognitionRouter.post(
  '/recognitions/:id/report',
  route(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().trim().max(RECOGNITION_REPORT_NOTE_MAX).default('') }), req.body ?? {});
    res.json(await reportRecognition(currentUser(req), idParam(req.params.id), note));
  }),
);

/** The reports waiting for the programme's owner (`?all=1`: the ones already dealt with too). */
recognitionRouter.get(
  '/recognitions/reports',
  requirePermission('recognition.manage'),
  route(async (req, res) => {
    res.json(await recognitionReports(req.query.all === '1'));
  }),
);

/** The owner has looked at it and leaves the recognition as it is. */
recognitionRouter.post(
  '/recognitions/:id/report/close',
  requirePermission('recognition.manage'),
  route(async (req, res) => {
    res.json(await closeRecognitionReport(currentUser(req), idParam(req.params.id)));
  }),
);

/** The programme's owner reverses one, with a reason both people read. */
recognitionRouter.post(
  '/recognitions/:id/reverse',
  requirePermission('recognition.manage'),
  route(async (req, res) => {
    const { reason } = parse(
      z.object({ reason: z.string({ error: 'دلیل برگرداندن را بنویسید.' }).trim().min(RECOGNITION_REASON_MIN, 'دلیل برگرداندن را بنویسید.').max(RECOGNITION_REASON_MAX) }),
      req.body,
    );
    res.json(await reverseRecognition(currentUser(req), idParam(req.params.id), reason));
  }),
);

// The programme's settings sit under /settings, outside the part's own switch, so its owner can write
// the values and the limits before it is switched on for anyone.

const rulesSchema = z.object({
  allowance: z.number().int(),
  amounts: z.array(z.number().int()).max(RECOGNITION_AMOUNTS_MAX),
  defaultAmount: z.number().int(),
  perPersonMax: z.number().int(),
  dailyMax: z.number().int(),
});

const valueSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'شناسهٔ ارزش فقط حروف کوچک انگلیسی، عدد و خط تیره است'),
  label: z.string().trim().min(1).max(RECOGNITION_VALUE_LABEL_MAX),
  tone: z.enum(RECOGNITION_TONES),
  description: z.string().trim().max(RECOGNITION_VALUE_DESCRIPTION_MAX, `توضیح هر ارزش حداکثر ${toPersianDigits(RECOGNITION_VALUE_DESCRIPTION_MAX)} حرف است.`).default(''),
});

const settingsSchema = z.object({
  rules: rulesSchema.optional(),
  // An empty list brings the built-in five back.
  values: z.array(valueSchema).max(RECOGNITION_VALUES_MAX).optional(),
});

/** The rules in force, a change that waits for the next month, and the values. */
async function recognitionSettings(now = new Date()) {
  const row = await ensureSettings();
  const month = recognitionMonth(now);
  const pending = row.recognitionRules?.pending;
  return {
    rules: rulesFor(row.recognitionRules, month),
    // Shown as «از اول آذر»; one whose month has come is simply the rules by now.
    pending: pending && pending.from > month ? { ...pending, fromLabel: jalaliMonthLabel(pending.from) } : null,
    values: recognitionValues(row.recognitionValues),
    // While the part is still switched off a change of the rules applies at once; later, from next month.
    rulesApplyAtOnce: featureState(await featureConfig(), 'recognition') === 'off',
  };
}

recognitionRouter.get(
  '/settings/recognition',
  requirePermission('recognition.manage'),
  route(async (_req, res) => {
    res.json(await recognitionSettings());
  }),
);

const rulesText = (r: RecognitionRules) =>
  toPersianDigits(`سهمیه ${r.allowance}، هر قدردانی ${amountsText(r.amounts)} (پیش‌فرض ${r.defaultAmount})، هر نفر ${r.perPersonMax} در ماه، ${r.dailyMax} قدردانی در روز`);

recognitionRouter.put(
  '/settings/recognition',
  requirePermission('recognition.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(settingsSchema, req.body);
    const row = await ensureSettings();
    const now = new Date();
    const changes: Partial<typeof settings.$inferInsert> = {};
    const entries: { title: string; detail: string }[] = [];
    if (body.rules) {
      // In any order and with repeats, as someone might type them.
      body.rules.amounts = [...new Set(body.rules.amounts)].sort((a, b) => a - b);
      const problem = rulesProblem(body.rules);
      if (problem) throw new HttpError(400, problem);
      const atOnce = featureState(await featureConfig(), 'recognition') === 'off';
      changes.recognitionRules = withRulesChange(row.recognitionRules, body.rules, recognitionMonth(now), atOnce);
      const from = changes.recognitionRules.pending?.from;
      entries.push({ title: 'قواعد «سپاس»', detail: `${rulesText(body.rules)}${from ? ` (از ${jalaliMonthLabel(from)})` : ''}` });
    }
    if (body.values) {
      const ids = new Set(body.values.map((v) => v.id));
      const labels = new Set(body.values.map((v) => v.label));
      if (ids.size !== body.values.length || labels.size !== body.values.length) throw new HttpError(400, 'دو ارزش نمی‌توانند یک نام یا یک شناسه داشته باشند.');
      changes.recognitionValues = body.values;
      const shown = body.values.length ? body.values : DEFAULT_RECOGNITION_VALUES;
      entries.push({ title: 'ارزش‌های «سپاس»', detail: shown.map((v) => v.label).join('، ') });
    }
    if (Object.keys(changes).length > 0) {
      await db.update(settings).set(changes).where(eq(settings.id, 'global'));
      for (const entry of entries) await audit(viewer, { action: 'update', entity: 'settings', ...entry });
      broadcastChange('settings');
      // Open «سپاس» pages show the new values (and their descriptions) without a reload.
      broadcastChange('recognition');
    }
    res.json(await recognitionSettings(now));
  }),
);
