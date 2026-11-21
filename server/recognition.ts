import moment from 'moment-jalaali';
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { featureVisible } from '../shared/features.js';
import { jalaliMonthLabel, toPersianDigits } from '../shared/jalali.js';
import type { ReactionCount } from '../shared/reactions.js';
import { cleanTutorial, type RecognitionMissions, type RecognitionTutorial, withTutorialChange } from '../shared/recognitionTutorial.js';
import {
  amountsText,
  messageLength,
  monthAllowance,
  monthProgress,
  nextRecognitionMonth,
  RECOGNITION_JOIN_AMOUNT,
  RECOGNITION_MESSAGE_MAX,
  RECOGNITION_MESSAGE_MIN,
  RECOGNITION_PAGE,
  RECOGNITION_REPEAT_MS,
  RECOGNITION_UNDO_MS,
  recognitionLimits,
  recognitionMonth,
  recognitionValues,
  recognitionStart,
  type RecognitionPreference,
  rulesFor,
} from '../shared/recognition.js';
import { audit } from './audit.js';
import type { SessionUser } from './auth.js';
import { db } from './db/index.js';
import { employees, reactions as reactionRows, recognitionReminders, recognitions } from './db/schema.js';
import { broadcastChange, signalUser } from './events.js';
import { featureConfig } from './features.js';
import { idsWithPermission } from './roles.js';
import { HttpError, newId } from './http.js';
import { createNotifications } from './notify.js';
import { reactionCounts } from './routes/reactions.js';
import { fullName } from './serializers.js';
import { ensureSettings } from './settings.js';

// «سپاس»: giving coins with a message of thanks (shared/recognition.ts has the rules). Everything here
// takes the moment it happens at, so a month's end can be tried without waiting for one.
//
// Who reads what:
// - the amount of a recognition: only its sender and its receiver, never the wall;
// - a recognition «فقط ما دو نفر»: only the two of them, the administrator included;
// - one its receiver reported («گزارش»): the programme's owner as well, that one only;
// - a sealed one (not opened yet): the receiver sees who it is from, and the rest once they open it.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof recognitions.$inferSelect;
type Viewer = Pick<SessionUser, 'id' | 'role' | 'firstName' | 'lastName' | 'createdAt'>;

const sender = alias(employees, 'recognition_sender');
const receiver = alias(employees, 'recognition_receiver');

/** Still counts, for the giver's allowance and for the receiver: not taken back and not reversed. */
const standing = and(isNull(recognitions.withdrawnAt), isNull(recognitions.reversedAt));
/** A recognition of its own, as against a «من هم» added to one. */
const original = isNull(recognitions.parentId);

const fa = (n: number) => toPersianDigits(n);
const total = sql<number>`coalesce(sum(${recognitions.amount}), 0)::int`;

const startOfToday = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

const personColumns = (t: typeof sender | typeof receiver | typeof employees) => ({
  id: t.id,
  firstName: t.firstName,
  lastName: t.lastName,
  avatarUrl: t.avatarUrl,
  position: t.position,
  department: t.department,
});
type PersonRow = { id: string; firstName: string; lastName: string; avatarUrl: string; position: string; department: string };

const person = (e: PersonRow) => ({ id: e.id, name: fullName(e), avatar: e.avatarUrl, position: e.position, department: e.department });
const valueOf = (r: Row) => ({ id: r.valueId, label: r.valueLabel, tone: r.valueTone });
const shorten = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The people this colleague can recognise: active, with a portal account, who see the part themselves. */
async function reachable() {
  const config = await featureConfig();
  const rows = await db
    .select({ ...personColumns(employees), role: employees.role, recognitionSince: employees.recognitionSince, prefers: employees.recognitionPreference })
    .from(employees)
    .where(and(eq(employees.isActive, true), eq(employees.hasAccount, true)));
  return rows.filter((e) => featureVisible(config, 'recognition', e));
}

/** What this person gave out of a month's allowance, in all and to each colleague. */
async function givenIn(userId: string, month: string, tx: Tx | typeof db = db) {
  const rows = await tx
    .select({ toId: recognitions.toId, amount: total })
    .from(recognitions)
    .where(and(eq(recognitions.fromId, userId), eq(recognitions.month, month), standing))
    .groupBy(recognitions.toId);
  return { all: rows.reduce((sum, r) => sum + r.amount, 0), byPerson: new Map(rows.map((r) => [r.toId, r.amount])) };
}

/** Recognitions this person wrote today; «من هم» has no message and is not one of them. */
async function writtenToday(userId: string, now: Date, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select({ n: count() })
    .from(recognitions)
    .where(and(eq(recognitions.fromId, userId), original, isNull(recognitions.withdrawnAt), gte(recognitions.createdAt, startOfToday(now))));
  return row?.n ?? 0;
}

/**
 * Notes the moment «سپاس» began for everyone who can see it now and had no such moment yet. Run when the
 * switch or the pilot group changes, and on every scheduler tick (a colleague moved to a pilot access
 * level, a new account), so a first month's share is counted from the day it really began.
 */
export async function markRecognitionStarts(now = new Date()) {
  const ids = (await reachable()).filter((p) => !p.recognitionSince).map((p) => p.id);
  if (ids.length === 0) return 0;
  await db.update(employees).set({ recognitionSince: now }).where(and(inArray(employees.id, ids), isNull(employees.recognitionSince)));
  return ids.length;
}

/** When «سپاس» began for this colleague (see `recognitionStart`); noted now if it had not been yet. */
async function startOf(viewer: Pick<Viewer, 'id' | 'createdAt'>, now: Date, tx: Tx | typeof db = db) {
  const [row] = await tx.select({ createdAt: employees.createdAt, since: employees.recognitionSince }).from(employees).where(eq(employees.id, viewer.id));
  if (row && !row.since) {
    // Only someone who sees «سپاس» asks for a wallet; the tick has not noted them yet.
    await tx.update(employees).set({ recognitionSince: now }).where(and(eq(employees.id, viewer.id), isNull(employees.recognitionSince)));
    return recognitionStart(row.createdAt, now);
  }
  return row ? recognitionStart(row.createdAt, row.since) : new Date(viewer.createdAt);
}

/**
 * The colleague's wallet for the month `now` falls in. Nothing is stored for it: what is left is the
 * month's allowance less what they gave in it, so a new month starts full and last month's rest is
 * simply gone, whether or not the server was running at midnight.
 */
export async function walletOf(viewer: Pick<Viewer, 'id' | 'createdAt'>, now = new Date()) {
  const month = recognitionMonth(now);
  const settings = await ensureSettings();
  const rules = rulesFor(settings.recognitionRules, month);
  const allowance = monthAllowance(rules.allowance, month, await startOf(viewer, now));
  const given = (await givenIn(viewer.id, month)).all;
  // Coins received count once the colleague has opened the recognition (a «من هم» has no seal to open),
  // so the number does not give a sealed one away.
  const [received] = await db
    .select({ coins: total })
    .from(recognitions)
    .where(and(eq(recognitions.toId, viewer.id), isNotNull(recognitions.deliveredAt), standing, or(isNotNull(recognitions.openedAt), isNotNull(recognitions.parentId))));
  const [sealed] = await db
    .select({ n: count() })
    .from(recognitions)
    .where(and(eq(recognitions.toId, viewer.id), original, isNotNull(recognitions.deliveredAt), standing, isNull(recognitions.openedAt)));
  return {
    month,
    allowance,
    given,
    left: Math.max(0, allowance - given),
    ...monthProgress(now),
    // `allowance` is the whole month's, for everyone; the wallet's own `allowance` is less in the month someone joined.
    rules: { allowance: rules.allowance, perPersonMax: rules.perPersonMax, dailyMax: rules.dailyMax },
    amounts: rules.amounts,
    defaultAmount: rules.defaultAmount,
    joinAmount: RECOGNITION_JOIN_AMOUNT,
    writtenToday: await writtenToday(viewer.id, now),
    values: recognitionValues(settings.recognitionValues),
    undoMs: RECOGNITION_UNDO_MS,
    messageMin: RECOGNITION_MESSAGE_MIN,
    messageMax: RECOGNITION_MESSAGE_MAX,
    received: { coins: received?.coins ?? 0, sealed: sealed?.n ?? 0 },
    // The two monthly reminders, unless the colleague switched them off.
    reminders: await recognitionRemindersOf(viewer),
    // How they would rather be thanked themselves (2.1).
    preference: await recognitionPreferenceOf(viewer),
  };
}

/** Who the colleague can recognise, with what they already gave each this month (for the per-person limit). */
export async function recognisable(viewer: Pick<Viewer, 'id'>, now = new Date()) {
  const [people, given] = await Promise.all([reachable(), givenIn(viewer.id, recognitionMonth(now))]);
  return people
    .filter((p) => p.id !== viewer.id)
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fa'))
    // How each would rather be thanked, for the form's default (2.1).
    .map((p) => ({ ...person(p), givenThisMonth: given.byPerson.get(p.id) ?? 0, prefers: p.prefers }));
}

/** The colleague a recognition goes to, or the reason it cannot go to them. */
async function receiverOf(viewer: Pick<Viewer, 'id'>, toId: string) {
  if (toId === viewer.id) throw new HttpError(400, 'نمی‌توانید از خودتان قدردانی کنید.');
  const [target] = await db.select().from(employees).where(eq(employees.id, toId)).limit(1);
  if (!target || !target.isActive || !target.hasAccount) throw new HttpError(400, 'این همکار حساب فعال در پرتال ندارد.');
  // While the part is in preview, coins only go to people who can see it.
  if (!featureVisible(await featureConfig(), 'recognition', target)) {
    throw new HttpError(400, 'این همکار هنوز به بخش «سپاس» دسترسی ندارد.');
  }
  return target;
}

/**
 * Checks the month's allowance and the per-person limit and saves the row, under a lock on the giver, so
 * several clicks at once (a double click, two open pages) can never spend more than there is.
 */
async function spend(
  viewer: Pick<Viewer, 'id' | 'createdAt'>,
  target: { id: string; firstName: string; lastName: string },
  values: Omit<typeof recognitions.$inferInsert, 'id' | 'fromId' | 'toId' | 'month' | 'deliverAt' | 'createdAt'>,
  now: Date,
  check: (tx: Tx) => Promise<void> = async () => undefined,
) {
  const month = recognitionMonth(now);
  const rules = rulesFor((await ensureSettings()).recognitionRules, month);
  const allowance = monthAllowance(rules.allowance, month, await startOf(viewer, now));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recognition:${viewer.id}`}))`);
    await check(tx);
    const given = await givenIn(viewer.id, month, tx);
    const left = allowance - given.all;
    if (left <= 0) throw new HttpError(400, recognitionLimits.monthDone());
    if (values.amount > left) throw new HttpError(400, recognitionLimits.notEnough(left));
    const room = rules.perPersonMax - (given.byPerson.get(target.id) ?? 0);
    if (values.amount > room) {
      throw new HttpError(
        400,
        room <= 0 ? recognitionLimits.perPerson(rules.perPersonMax, fullName(target)) : recognitionLimits.perPersonRoom(rules.perPersonMax, fullName(target), room),
      );
    }
    const [row] = await tx
      .insert(recognitions)
      .values({
        ...values,
        id: newId('rec'),
        fromId: viewer.id,
        toId: target.id,
        month,
        createdAt: now,
        deliverAt: new Date(now.getTime() + RECOGNITION_UNDO_MS),
      })
      .returning();
    return row;
  });
}

export interface GiveInput {
  to: string;
  amount: number;
  valueId: string;
  message: string;
  isPublic: boolean;
}

/** A recognition from `viewer`. The receiver hears of it once the time for taking it back has passed. */
export async function giveRecognition(viewer: Viewer, input: GiveInput, now = new Date()) {
  const target = await receiverOf(viewer, input.to);
  const settings = await ensureSettings();
  const rules = rulesFor(settings.recognitionRules, recognitionMonth(now));
  const value = recognitionValues(settings.recognitionValues).find((v) => v.id === input.valueId);
  if (!value) throw new HttpError(400, 'این ارزش دیگر در فهرست نیست؛ صفحه را دوباره باز کنید.');
  if (!rules.amounts.includes(input.amount)) throw new HttpError(400, `هر قدردانی ${amountsText(rules.amounts)} سکه است.`);
  const message = input.message.trim();
  if (messageLength(message) < RECOGNITION_MESSAGE_MIN) {
    throw new HttpError(400, recognitionLimits.shortMessage(RECOGNITION_MESSAGE_MIN, fullName(target)));
  }
  const row = await spend(
    viewer,
    target,
    { amount: input.amount, valueId: value.id, valueLabel: value.label, valueTone: value.tone, message, isPublic: input.isPublic },
    now,
    async (tx) => {
      // The form sent twice (a double click, a slow connection): the first one stands, with its coins.
      const [same] = await tx
        .select({ id: recognitions.id })
        .from(recognitions)
        .where(
          and(
            eq(recognitions.fromId, viewer.id),
            eq(recognitions.toId, target.id),
            eq(recognitions.amount, input.amount),
            eq(recognitions.message, message),
            original,
            isNull(recognitions.withdrawnAt),
            gt(recognitions.createdAt, new Date(now.getTime() - RECOGNITION_REPEAT_MS)),
          ),
        )
        .limit(1);
      if (same) throw new HttpError(409, 'همین قدردانی چند لحظه پیش ثبت شد.');
      if ((await writtenToday(viewer.id, now, tx)) >= rules.dailyMax) {
        throw new HttpError(429, recognitionLimits.daily(rules.dailyMax));
      }
    },
  );
  signalUser(viewer.id, 'recognition');
  return row;
}

/** A card the wall still shows: public, handed over, not taken off by its receiver and not reversed. */
const onWall = and(original, eq(recognitions.isPublic, true), isNotNull(recognitions.deliveredAt), standing, isNull(recognitions.hiddenAt));

const JOINED_ALREADY = recognitionLimits.joinedAlready();

/** «من هم»: adds a few coins of the viewer's own allowance to a card on the wall, once per card. */
export async function joinRecognition(viewer: Viewer, parentId: string, now = new Date()) {
  const [parent] = await db.select().from(recognitions).where(and(eq(recognitions.id, parentId), onWall)).limit(1);
  if (!parent) throw new HttpError(404, 'این قدردانی روی دیوار نیست.');
  if (parent.fromId === viewer.id) throw new HttpError(400, 'با قدردانی خودتان نمی‌شود همراه شد.');
  if (parent.toId === viewer.id) throw new HttpError(400, 'با قدردانی‌ای که از شما شده نمی‌شود همراه شد.');
  const target = await receiverOf(viewer, parent.toId);
  try {
    const row = await spend(
      viewer,
      target,
      { amount: RECOGNITION_JOIN_AMOUNT, parentId: parent.id, valueId: parent.valueId, valueLabel: parent.valueLabel, valueTone: parent.valueTone, isPublic: true },
      now,
      async (tx) => {
        const [mine] = await tx
          .select({ id: recognitions.id })
          .from(recognitions)
          .where(and(eq(recognitions.parentId, parent.id), eq(recognitions.fromId, viewer.id), isNull(recognitions.withdrawnAt)))
          .limit(1);
        if (mine) throw new HttpError(400, JOINED_ALREADY);
      },
    );
    signalUser(viewer.id, 'recognition');
    return row;
  } catch (err) {
    // Two at once from the same person on the same card; the unique index keeps one.
    if ((err as { code?: string }).code === '23505' || (err as { cause?: { code?: string } }).cause?.code === '23505') throw new HttpError(400, JOINED_ALREADY);
    throw err;
  }
}

/** The sender takes a recognition (or a «من هم») back before it is handed over; the coins are theirs again. */
export async function withdrawRecognition(viewer: Pick<Viewer, 'id'>, id: string, now = new Date()) {
  const [taken] = await db
    .update(recognitions)
    .set({ withdrawnAt: now })
    .where(
      and(
        eq(recognitions.id, id),
        eq(recognitions.fromId, viewer.id),
        isNull(recognitions.withdrawnAt),
        isNull(recognitions.deliveredAt),
        isNull(recognitions.reversedAt),
        gt(recognitions.deliverAt, now),
      ),
    )
    .returning({ id: recognitions.id });
  if (!taken) {
    const [row] = await db.select({ id: recognitions.id }).from(recognitions).where(and(eq(recognitions.id, id), eq(recognitions.fromId, viewer.id)));
    if (!row) throw new HttpError(404, 'قدردانی یافت نشد.');
    throw new HttpError(400, recognitionLimits.undoPassed(Math.round(RECOGNITION_UNDO_MS / 60_000)));
  }
  signalUser(viewer.id, 'recognition');
}

/**
 * Run by the scheduler every minute: hands over the recognitions whose time for taking back has passed.
 * Each is claimed first, so a second tick or a restart never tells the receiver twice. Returns how many.
 */
export async function deliverDueRecognitions(now = new Date()) {
  const due = await db
    .update(recognitions)
    .set({ deliveredAt: now })
    .where(and(isNull(recognitions.deliveredAt), standing, lte(recognitions.deliverAt, now)))
    .returning();
  if (due.length === 0) return 0;
  const config = await featureConfig();
  const people = new Map(
    (await db.select().from(employees).where(inArray(employees.id, [...new Set(due.flatMap((r) => [r.fromId, r.toId]))]))).map((e) => [e.id, e]),
  );
  const parentIds = [...new Set(due.flatMap((r) => (r.parentId ? [r.parentId] : [])))];
  const parents = new Map(
    (parentIds.length
      ? await db
          .select({ id: recognitions.id, fromId: recognitions.fromId, firstName: sender.firstName, lastName: sender.lastName })
          .from(recognitions)
          .innerJoin(sender, eq(sender.id, recognitions.fromId))
          .where(inArray(recognitions.id, parentIds))
      : []
    ).map((p) => [p.id, p]),
  );
  let wallChanged = false;
  for (const r of due.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const from = people.get(r.fromId);
    const to = people.get(r.toId);
    if (!from || !to) continue;
    wallChanged ||= r.isPublic;
    signalUser(r.fromId, 'recognition');
    signalUser(r.toId, 'recognition');
    // Someone who left, or from whom the part is hidden just now, finds it waiting when they are back.
    if (!to.isActive || !featureVisible(config, 'recognition', to)) continue;
    const parent = r.parentId ? parents.get(r.parentId) : undefined;
    // Neither says how many coins, nor what the message is: the receiver opens it to see.
    await createNotifications(
      [r.toId],
      parent
        ? {
            title: `${fullName(from)} هم با یک قدردانی از شما همراه شد 🌟`,
            message: `${fullName(from)} با قدردانی ${fullName(parent)} از شما همراه شد و چند سکه به آن افزود.`,
            type: 'recognition',
            linkTab: 'thanks',
            linkId: parent.id,
          }
        : {
            title: `${fullName(from)} از شما قدردانی کرد 🌟`,
            message: 'یک قدردانی مهرشده برایتان رسیده است؛ مهر را باز کنید و بخوانید.',
            type: 'recognition',
            linkTab: 'thanks',
            linkId: r.id,
          },
    );
  }
  if (wallChanged) broadcastChange('recognition');
  return due.length;
}

/** The standing «من هم»s of the given cards. The viewer's own shows at once; the others once handed over. */
async function joinsOf(ids: string[], viewerId: string) {
  const byCard = new Map<string, { id: string; fromId: string; name: string; amount: number; delivered: boolean; deliverAt: Date }[]>();
  if (ids.length === 0) return byCard;
  const rows = await db
    .select({ r: recognitions, firstName: sender.firstName, lastName: sender.lastName })
    .from(recognitions)
    .innerJoin(sender, eq(sender.id, recognitions.fromId))
    .where(and(inArray(recognitions.parentId, ids), standing, or(isNotNull(recognitions.deliveredAt), eq(recognitions.fromId, viewerId))))
    .orderBy(recognitions.createdAt);
  for (const { r, firstName, lastName } of rows) {
    const list = byCard.get(r.parentId!) ?? [];
    list.push({ id: r.id, fromId: r.fromId, name: fullName({ firstName, lastName }), amount: r.amount, delivered: r.deliveredAt !== null, deliverAt: r.deliverAt });
    byCard.set(r.parentId!, list);
  }
  return byCard;
}

const withPeople = () =>
  db
    .select({ r: recognitions, from: personColumns(sender), to: personColumns(receiver) })
    .from(recognitions)
    .innerJoin(sender, eq(sender.id, recognitions.fromId))
    .innerJoin(receiver, eq(receiver.id, recognitions.toId));

type Joined = Awaited<ReturnType<typeof withPeople>>[number];

/** Where a list was left off: the moment and id of the last row handed over. */
export interface Cursor {
  at: Date;
  id: string;
}

/** `2026-11-14T07:00:00.000Z~rec-…`, as a list's `next` gives it and its `before` takes it; null when it is not one. */
export function parseCursor(value: string): Cursor | null {
  const split = value.indexOf('~');
  const at = new Date(value.slice(0, split));
  return split > 0 && split < value.length - 1 && !Number.isNaN(at.getTime()) ? { at, id: value.slice(split + 1) } : null;
}

type Moment = typeof recognitions.deliverAt | typeof recognitions.createdAt;

/** Rows older than the cursor, in the order the lists use: newest first, then by id. */
const olderThan = (column: Moment, cursor: Cursor | undefined) =>
  cursor ? or(lt(column, cursor.at), and(eq(column, cursor.at), lt(recognitions.id, cursor.id))) : undefined;

/** A page of rows and where to continue from. */
function page<T extends { r: Row }>(rows: T[], at: (r: Row) => Date) {
  const items = rows.slice(0, RECOGNITION_PAGE);
  const last = items.at(-1);
  return { items, next: rows.length > RECOGNITION_PAGE && last ? `${at(last.r).toISOString()}~${last.r.id}` : null };
}

export interface WallFilter {
  valueId?: string;
  department?: string;
  before?: Cursor;
}

/**
 * The wall: public recognitions that were handed over, newest first, without any amount. Cards of a
 * colleague who has left are kept but not shown.
 */
export async function recognitionWall(viewer: Pick<Viewer, 'id'>, filter: WallFilter = {}, now = new Date()) {
  const rows = await withPeople()
    .where(
      and(
        onWall,
        eq(sender.isActive, true),
        eq(receiver.isActive, true),
        filter.valueId ? eq(recognitions.valueId, filter.valueId) : undefined,
        filter.department ? eq(receiver.department, filter.department) : undefined,
        olderThan(recognitions.deliverAt, filter.before),
      ),
    )
    // By the moment each was due, not the scheduler's tick that handed several over at once.
    .orderBy(desc(recognitions.deliverAt), desc(recognitions.id))
    .limit(RECOGNITION_PAGE + 1);
  const { items, next } = page(rows, (r) => r.deliverAt);
  const ids = items.map((i) => i.r.id);
  const [joins, reactions] = await Promise.all([joinsOf(ids, viewer.id), reactionCounts('recognition', ids, viewer.id)]);
  return { items: items.map((i) => wallCard(i, viewer.id, joins.get(i.r.id) ?? [], reactions.get(i.r.id) ?? [], now)), next };
}

function wallCard(
  { r, from, to }: Joined,
  viewerId: string,
  joins: { id: string; fromId: string; name: string; delivered: boolean; deliverAt: Date }[],
  reactions: ReactionCount[],
  now: Date,
) {
  const mine = r.fromId === viewerId ? ('sender' as const) : r.toId === viewerId ? ('receiver' as const) : null;
  const own = joins.find((j) => j.fromId === viewerId);
  const card = {
    id: r.id,
    from: person(from),
    to: person(to),
    value: valueOf(r),
    message: r.message,
    at: r.deliverAt.toISOString(),
    // The receiver's own answer to it, and everybody else's reactions.
    reaction: r.reaction,
    reactions,
    joiners: joins.map((j) => ({ id: j.fromId, name: j.name })),
    joined: own !== undefined,
    // The viewer's own «من هم», and until when it can still be taken back.
    join: own ? { id: own.id, withdrawUntil: !own.delivered && own.deliverAt > now ? own.deliverAt.toISOString() : null } : null,
    mine,
    sealed: false,
  };
  // The receiver reads it for the first time by breaking its seal, not in passing on the wall.
  if (mine === 'receiver' && !r.openedAt) return { ...card, value: null, message: '', reactions: [], joiners: [], sealed: true };
  return card;
}

/**
 * What the colleague received (handed over, newest first) and what they gave. A received one stays
 * sealed, with only who it is from, until they open it; one they gave says whether it was read.
 */
export async function myRecognitions(viewer: Pick<Viewer, 'id'>, options: { receivedBefore?: Cursor; givenBefore?: Cursor } = {}, now = new Date()) {
  const receivedRows = await withPeople()
    .where(
      and(
        eq(recognitions.toId, viewer.id),
        original,
        isNotNull(recognitions.deliveredAt),
        standing,
        olderThan(recognitions.deliverAt, options.receivedBefore),
      ),
    )
    .orderBy(desc(recognitions.deliverAt), desc(recognitions.id))
    .limit(RECOGNITION_PAGE + 1);
  const givenRows = await withPeople()
    .where(and(eq(recognitions.fromId, viewer.id), isNull(recognitions.withdrawnAt), olderThan(recognitions.createdAt, options.givenBefore)))
    .orderBy(desc(recognitions.createdAt), desc(recognitions.id))
    .limit(RECOGNITION_PAGE + 1);
  const received = page(receivedRows, (r) => r.deliverAt);
  const given = page(givenRows, (r) => r.createdAt);
  const joins = await joinsOf(received.items.map((i) => i.r.id), viewer.id);
  return {
    received: received.items.map((i) => receivedCard(i, joins.get(i.r.id) ?? [])),
    receivedNext: received.next,
    given: given.items.map((i) => givenCard(i, now)),
    givenNext: given.next,
  };
}

function receivedCard({ r, from }: Joined, joins: { name: string; amount: number; delivered: boolean }[]) {
  const sealed = { id: r.id, from: person(from), at: r.deliverAt.toISOString() };
  if (!r.openedAt) return { ...sealed, sealed: true as const };
  const added = joins.filter((j) => j.delivered);
  return {
    ...sealed,
    sealed: false as const,
    value: valueOf(r),
    message: r.message,
    amount: r.amount,
    // Colleagues who added their own coins to it, and what it comes to with them.
    joiners: added.map((j) => ({ name: j.name, amount: j.amount })),
    total: r.amount + added.reduce((sum, j) => sum + j.amount, 0),
    isPublic: r.isPublic,
    hidden: r.hiddenAt !== null,
    openedAt: r.openedAt.toISOString(),
    reaction: r.reaction,
    // The receiver asked the programme's owner to look at it.
    reported: r.reportedAt !== null,
  };
}

function givenCard({ r, to }: Joined, now: Date) {
  const waiting = r.deliveredAt === null && r.reversedAt === null;
  return {
    id: r.id,
    to: person(to),
    amount: r.amount,
    value: valueOf(r),
    message: r.message,
    isPublic: r.isPublic,
    // The card on the wall this «من هم» was added to.
    joinOf: r.parentId,
    at: r.createdAt.toISOString(),
    delivered: r.deliveredAt !== null,
    // Until then the sender can still take it back.
    withdrawUntil: waiting && r.deliverAt > now ? r.deliverAt.toISOString() : null,
    opened: r.openedAt !== null,
    reaction: r.reaction,
    reversed: r.reversedAt !== null,
    reverseReason: r.reverseReason,
  };
}

/** A recognition the viewer received that was handed over and still stands. */
async function receivedBy(viewer: Pick<Viewer, 'id'>, id: string) {
  const [found] = await withPeople().where(and(eq(recognitions.id, id), eq(recognitions.toId, viewer.id), original, isNotNull(recognitions.deliveredAt), standing));
  if (!found) throw new HttpError(404, 'قدردانی یافت نشد.');
  return found;
}

const cardFor = async (viewer: Pick<Viewer, 'id'>, found: Joined) =>
  receivedCard(found, (await joinsOf([found.r.id], viewer.id)).get(found.r.id) ?? []);

/** The receiver breaks the seal: from now on they see the message and the coins, and the sender sees it was read. */
export async function openRecognition(viewer: Pick<Viewer, 'id'>, id: string, now = new Date()) {
  const found = await receivedBy(viewer, id);
  if (!found.r.openedAt) {
    await db.update(recognitions).set({ openedAt: now }).where(and(eq(recognitions.id, id), isNull(recognitions.openedAt)));
    found.r.openedAt = now;
    signalUser(found.r.fromId, 'recognition');
    signalUser(viewer.id, 'recognition');
  }
  return cardFor(viewer, found);
}

/** The receiver answers a recognition they have opened with one emoji ('' takes it back). */
export async function answerRecognition(viewer: Viewer, id: string, reaction: string) {
  const found = await receivedBy(viewer, id);
  if (!found.r.openedAt) throw new HttpError(400, 'اول قدردانی را باز کنید.');
  await db.update(recognitions).set({ reaction }).where(eq(recognitions.id, id));
  // The sender hears about the first answer only, so a change of mind does not send a stream of notices.
  if (reaction && !found.r.reaction) {
    await createNotifications([found.r.fromId], {
      title: `${fullName(viewer)} به قدردانی شما پاسخ داد ${reaction}`,
      message: `«${shorten(found.r.message)}»`,
      type: 'recognition',
      linkTab: 'thanks',
      linkId: id,
    });
  }
  signalUser(found.r.fromId, 'recognition');
  signalUser(viewer.id, 'recognition');
  if (found.r.isPublic) broadcastChange('recognition');
  found.r.reaction = reaction;
  return cardFor(viewer, found);
}

/** The receiver takes a public recognition off the wall, or puts it back. It stays theirs either way. */
export async function hideRecognition(viewer: Pick<Viewer, 'id'>, id: string, hidden: boolean, now = new Date()) {
  const found = await receivedBy(viewer, id);
  if (!found.r.isPublic) throw new HttpError(400, 'این قدردانی فقط بین شما دو نفر است و روی دیوار نیست.');
  if ((found.r.hiddenAt !== null) !== hidden) {
    const hiddenAt = hidden ? now : null;
    await db.update(recognitions).set({ hiddenAt }).where(eq(recognitions.id, id));
    found.r.hiddenAt = hiddenAt;
    signalUser(viewer.id, 'recognition');
    broadcastChange('recognition');
  }
  return cardFor(viewer, found);
}

/**
 * The programme's owner reverses a recognition, with a reason both people are told. The coins leave the
 * receiver, and go back to the giver's allowance only if its month is not over. The «من هم»s on it go with it.
 * The owner never sees the message of a private one, here or in the change history.
 */
export async function reverseRecognition(actor: SessionUser, id: string, reason: string, now = new Date()) {
  const [found] = await withPeople().where(and(eq(recognitions.id, id), isNull(recognitions.withdrawnAt)));
  if (!found) throw new HttpError(404, 'قدردانی یافت نشد.');
  if (found.r.reversedAt) throw new HttpError(400, 'این قدردانی قبلاً برگردانده شده است.');
  const reversed = await db
    .update(recognitions)
    .set({ reversedAt: now, reversedById: actor.id, reverseReason: reason })
    .where(and(or(eq(recognitions.id, id), eq(recognitions.parentId, id)), standing))
    .returning({ id: recognitions.id, fromId: recognitions.fromId, deliveredAt: recognitions.deliveredAt });
  // A report on it is dealt with by this.
  await db
    .update(recognitions)
    .set({ reportClosedAt: now, reportClosedById: actor.id })
    .where(and(eq(recognitions.id, id), isNotNull(recognitions.reportedAt), isNull(recognitions.reportClosedAt)));
  const { r, from, to } = found;
  const subject = `قدردانی ${fullName(from)} از ${fullName(to)}`;
  await audit(actor, { action: 'delete', entity: 'message', id, title: subject, detail: `برگردانده شد. دلیل: ${reason}` });
  // The receiver is told only about one they had already heard of.
  const told = [r.fromId, ...(r.deliveredAt ? [r.toId] : [])];
  await createNotifications(told, {
    title: 'یک قدردانی برگردانده شد',
    message: `${subject} را مسئول برنامهٔ «سپاس» برگرداند. دلیل: ${reason}`,
    type: 'recognition',
    linkTab: 'thanks',
  });
  const joiners = [...new Set(reversed.filter((j) => j.id !== id).map((j) => j.fromId))].filter((userId) => !told.includes(userId));
  await createNotifications(joiners, {
    title: 'قدردانی‌ای که با آن همراه شده بودید برگردانده شد',
    message: `${subject} را مسئول برنامهٔ «سپاس» برگرداند؛ سکه‌ای که به آن افزوده بودید هم برگشت.`,
    type: 'recognition',
    linkTab: 'thanks',
  });
  for (const userId of new Set([...told, r.toId, ...joiners])) signalUser(userId, 'recognition');
  if (r.isPublic) broadcastChange('recognition');
  return { id, reversed: reversed.length };
}

/**
 * «گزارش»: the receiver asks the programme's owner to look at a recognition they have read. It is the one
 * way anyone but the two of them comes to read a private one, and it is the receiver who decides it.
 * The sender is not told.
 */
export async function reportRecognition(viewer: Viewer, id: string, note: string, now = new Date()) {
  const found = await receivedBy(viewer, id);
  if (!found.r.openedAt) throw new HttpError(400, 'اول قدردانی را باز کنید.');
  if (found.r.reportedAt) throw new HttpError(400, 'این قدردانی را قبلاً گزارش کرده‌اید.');
  await db.update(recognitions).set({ reportedAt: now, reportNote: note }).where(eq(recognitions.id, id));
  found.r.reportedAt = now;
  const owners = (await idsWithPermission('recognition.manage')).filter((userId) => userId !== viewer.id);
  // Who reported whom, never the message: that is read on the list of reports.
  await createNotifications(owners, {
    title: 'یک قدردانی برای بررسی گزارش شد',
    message: `${fullName(viewer)} قدردانی‌ای را که از ${fullName(found.from)} گرفته گزارش کرده است.`,
    type: 'recognition',
    linkTab: 'thanks',
    linkId: id,
  });
  for (const userId of owners) signalUser(userId, 'recognition');
  signalUser(viewer.id, 'recognition');
  return cardFor(viewer, found);
}

/** The reports the programme's owner has to look at (or all of them), newest first, each with its message. */
export async function recognitionReports(includeClosed = false) {
  const rows = await withPeople()
    .where(and(isNotNull(recognitions.reportedAt), includeClosed ? undefined : isNull(recognitions.reportClosedAt)))
    .orderBy(desc(recognitions.reportedAt), desc(recognitions.id))
    .limit(100);
  return rows.map(({ r, from, to }) => ({
    id: r.id,
    from: person(from),
    to: person(to),
    value: valueOf(r),
    message: r.message,
    isPublic: r.isPublic,
    at: r.deliverAt.toISOString(),
    reportedAt: r.reportedAt!.toISOString(),
    note: r.reportNote,
    closed: r.reportClosedAt !== null,
    reversed: r.reversedAt !== null,
  }));
}

/** The owner has looked at a report and leaves the recognition as it is. The colleague who reported it is told. */
export async function closeRecognitionReport(actor: SessionUser, id: string, now = new Date()) {
  const [found] = await withPeople().where(and(eq(recognitions.id, id), isNotNull(recognitions.reportedAt)));
  if (!found) throw new HttpError(404, 'گزارش یافت نشد.');
  if (found.r.reportClosedAt) throw new HttpError(400, 'این گزارش قبلاً بسته شده است.');
  await db.update(recognitions).set({ reportClosedAt: now, reportClosedById: actor.id }).where(eq(recognitions.id, id));
  await audit(actor, {
    action: 'update',
    entity: 'message',
    id,
    title: `گزارش قدردانی ${fullName(found.from)} از ${fullName(found.to)}`,
    detail: 'بررسی و بسته شد.',
  });
  await createNotifications([found.r.toId], {
    title: 'گزارش شما بررسی شد',
    message: `مسئول برنامهٔ «سپاس» قدردانی‌ای را که از ${fullName(found.from)} گزارش کرده بودید بررسی کرد.`,
    type: 'recognition',
    linkTab: 'thanks',
    linkId: id,
  });
  for (const userId of await idsWithPermission('recognition.manage')) signalUser(userId, 'recognition');
  return { id };
}

// ---- Reminders ----------------------------------------------------------------------------------------

/** Not at night: a reminder waits for the working day. */
const REMINDER_HOURS = { from: 10, until: 19 };
/** The middle of the month: from this day of it. */
export const RECOGNITION_MID_DAY = 15;
/** «۳ روز مانده»: the last reminder, from this many days before the month ends (today counted). */
export const RECOGNITION_LAST_DAYS = 3;

/**
 * Two gentle reminders a month, only to colleagues who still have coins of this month to give: one in
 * the middle of the month and one three days before it ends, when what is left would otherwise burn.
 * Each goes once (a row in recognition_reminders), only during working hours, only to those who see
 * «سپاس», and never to someone who switched reminders off on the «سپاس» page.
 */
export async function processRecognitionReminders(now = new Date()) {
  const hour = now.getHours();
  if (hour < REMINDER_HOURS.from || hour >= REMINDER_HOURS.until) return 0;
  const { day, daysLeft } = monthProgress(now);
  const kind = daysLeft <= RECOGNITION_LAST_DAYS ? 'last' : day >= RECOGNITION_MID_DAY ? 'mid' : null;
  if (!kind) return 0;
  const month = recognitionMonth(now);

  const people = await reachable();
  if (people.length === 0) return 0;
  const details = await db
    .select({ id: employees.id, createdAt: employees.createdAt, since: employees.recognitionSince, reminders: employees.recognitionReminders })
    .from(employees)
    .where(inArray(employees.id, people.map((p) => p.id)));
  const already = new Set(
    (await db.select({ userId: recognitionReminders.userId }).from(recognitionReminders).where(and(eq(recognitionReminders.month, month), eq(recognitionReminders.kind, kind)))).map(
      (r) => r.userId,
    ),
  );
  const given = new Map(
    (
      await db
        .select({ fromId: recognitions.fromId, amount: total })
        .from(recognitions)
        .where(and(eq(recognitions.month, month), standing))
        .groupBy(recognitions.fromId)
    ).map((r) => [r.fromId, r.amount]),
  );
  const rules = rulesFor((await ensureSettings()).recognitionRules, month);
  const due = details
    .filter((p) => p.reminders && !already.has(p.id))
    .map((p) => ({ id: p.id, left: monthAllowance(rules.allowance, month, recognitionStart(p.createdAt, p.since)) - (given.get(p.id) ?? 0) }))
    .filter((p) => p.left > 0);
  if (due.length === 0) return 0;

  // Claimed first, so two servers (or two ticks) never send the same one twice.
  const claimed = await db
    .insert(recognitionReminders)
    .values(due.map((p) => ({ userId: p.id, month, kind })))
    .onConflictDoNothing()
    .returning({ userId: recognitionReminders.userId });
  const mine = new Set(claimed.map((c) => c.userId));
  // One notification per amount left, since the text says how many coins.
  const byLeft = new Map<number, string[]>();
  for (const p of due) if (mine.has(p.id)) byLeft.set(p.left, [...(byLeft.get(p.left) ?? []), p.id]);
  for (const [left, ids] of byLeft) {
    await createNotifications(
      ids,
      kind === 'mid'
        ? {
            title: `هنوز ${fa(left)} سکهٔ قدردانی دارید 🌟`,
            message: 'نیمی از ماه گذشت. کار خوبِ کدام همکار را دیده‌اید؟ چند خط تشکر کافی است.',
            type: 'recognition',
            linkTab: 'thanks',
          }
        : {
            title: `${fa(left)} سکهٔ این ماه شما آخر ماه می‌سوزد`,
            message: `${fa(daysLeft)} روز تا پایان ماه مانده. سکه‌هایی که بخشیده نشوند به ماه بعد نمی‌روند.`,
            type: 'recognition',
            linkTab: 'thanks',
          },
    );
  }
  return mine.size;
}

/** The colleague's own choice on the «سپاس» page: the two monthly reminders, or none. */
export async function setRecognitionReminders(viewer: Pick<Viewer, 'id'>, on: boolean) {
  await db.update(employees).set({ recognitionReminders: on }).where(eq(employees.id, viewer.id));
  return { reminders: on };
}

/** «قدردانی از من را…»: how the colleague would rather be thanked; only the default of others' forms. */
export async function setRecognitionPreference(viewer: Pick<Viewer, 'id'>, preference: RecognitionPreference) {
  await db.update(employees).set({ recognitionPreference: preference }).where(eq(employees.id, viewer.id));
  return { preference };
}

export async function recognitionPreferenceOf(viewer: Pick<Viewer, 'id'>): Promise<RecognitionPreference> {
  const [row] = await db.select({ p: employees.recognitionPreference }).from(employees).where(eq(employees.id, viewer.id));
  return row?.p ?? 'any';
}

export async function recognitionRemindersOf(viewer: Pick<Viewer, 'id'>) {
  const [row] = await db.select({ on: employees.recognitionReminders }).from(employees).where(eq(employees.id, viewer.id));
  return row?.on ?? true;
}

// ---- The owner's monthly numbers ----------------------------------------------------------------------

const UNKNOWN_DEPARTMENT = 'بدون واحد';
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * How «سپاس» went in a Jalali month, for its owner: how many colleagues gave and received, by unit and
 * by value, how many coins were given and how many burnt. Only counts: no names, no amounts per person
 * and no ranking of anyone, so nobody is measured by it. The colleagues counted are those who see «سپاس»
 * now and had joined the portal by the end of that month.
 */
export async function recognitionReport(month: string, now = new Date()) {
  const current = recognitionMonth(now);
  const rules = rulesFor((await ensureSettings()).recognitionRules, month);
  const endOfMonth = moment(`${nextRecognitionMonth(month)}/01`, 'jYYYY/jMM/jDD').toDate();
  const audience = (await reachable()).map((p) => p.id);
  const people = audience.length
    ? await db
        .select({ id: employees.id, department: employees.department, createdAt: employees.createdAt })
        .from(employees)
        .where(and(inArray(employees.id, audience), lt(employees.createdAt, endOfMonth)))
    : [];
  const departmentOf = new Map(people.map((p) => [p.id, p.department?.trim() || UNKNOWN_DEPARTMENT]));

  const rows = await db
    .select({
      fromId: recognitions.fromId,
      toId: recognitions.toId,
      amount: recognitions.amount,
      parentId: recognitions.parentId,
      isPublic: recognitions.isPublic,
      valueId: recognitions.valueId,
      valueLabel: recognitions.valueLabel,
      valueTone: recognitions.valueTone,
      reportedAt: recognitions.reportedAt,
      reversedAt: recognitions.reversedAt,
    })
    .from(recognitions)
    .where(and(eq(recognitions.month, month), isNull(recognitions.withdrawnAt)));
  const kept = rows.filter((r) => !r.reversedAt);
  const written = kept.filter((r) => !r.parentId);

  const givers = new Set(kept.map((r) => r.fromId));
  const receivers = new Set(kept.map((r) => r.toId));
  const coinsGiven = kept.reduce((sum, r) => sum + r.amount, 0);
  const givenBy = new Map<string, number>();
  for (const r of kept) givenBy.set(r.fromId, (givenBy.get(r.fromId) ?? 0) + r.amount);
  const allowance = people.reduce((sum, p) => sum + monthAllowance(rules.allowance, month, p.createdAt), 0);
  // What each colleague left unspent; for the month that is still running, what is still to give.
  const unspent = people.reduce((sum, p) => sum + Math.max(0, monthAllowance(rules.allowance, month, p.createdAt) - (givenBy.get(p.id) ?? 0)), 0);

  const departments = new Map<string, { people: number; givers: Set<string>; receivers: Set<string>; written: number }>();
  const unit = (name: string) => {
    let d = departments.get(name);
    if (!d) departments.set(name, (d = { people: 0, givers: new Set(), receivers: new Set(), written: 0 }));
    return d;
  };
  for (const p of people) unit(departmentOf.get(p.id)!).people++;
  for (const r of kept) {
    const from = departmentOf.get(r.fromId);
    const to = departmentOf.get(r.toId);
    if (from) unit(from).givers.add(r.fromId);
    if (to) unit(to).receivers.add(r.toId);
    if (from && !r.parentId) unit(from).written++;
  }
  // Recognitions that went from one unit to another: what such a programme is mostly for.
  const acrossUnits = written.filter((r) => departmentOf.has(r.fromId) && departmentOf.has(r.toId) && departmentOf.get(r.fromId) !== departmentOf.get(r.toId)).length;

  const values = new Map<string, { id: string; label: string; tone: string; count: number }>();
  for (const r of written) {
    const v = values.get(r.valueId) ?? { id: r.valueId, label: r.valueLabel, tone: r.valueTone, count: 0 };
    v.count++;
    values.set(r.valueId, v);
  }

  // The months there is something to show for, newest first (at most a year), and the current one.
  const months = (await db.selectDistinct({ month: recognitions.month }).from(recognitions)).map((r) => r.month);
  const choices = [...new Set([current, ...months])].filter((m) => m <= current).sort().reverse().slice(0, 12);

  return {
    month,
    monthLabel: jalaliMonthLabel(month),
    current: month === current,
    months: choices.map((m) => ({ month: m, label: jalaliMonthLabel(m) })),
    people: people.length,
    givers: givers.size,
    receivers: receivers.size,
    giversShare: share([...givers].filter((id) => departmentOf.has(id)).length, people.length),
    receiversShare: share([...receivers].filter((id) => departmentOf.has(id)).length, people.length),
    recognitions: written.length,
    joins: kept.length - written.length,
    publicShare: share(written.filter((r) => r.isPublic).length, written.length),
    acrossUnits,
    coins: { allowance, given: coinsGiven, unspent },
    reported: rows.filter((r) => r.reportedAt).length,
    reversed: rows.filter((r) => r.reversedAt).length,
    departments: [...departments.entries()]
      .map(([name, d]) => ({
        name,
        people: d.people,
        givers: d.givers.size,
        receivers: d.receivers.size,
        recognitions: d.written,
        giversShare: share(d.givers.size, d.people),
        receiversShare: share(d.receivers.size, d.people),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa')),
    values: [...values.values()].sort((a, b) => b.count - a.count),
  };
}

// ---- Tutorials and missions -------------------------------------------------------------------------

/**
 * The five missions of the «سپاس» page, read from what the colleague actually did, so what they did before
 * the tutorial existed counts too. Nothing is rewarded for them, and none of it reaches the owner's report.
 */
export async function recognitionMissions(viewer: Pick<Viewer, 'id'>, now = new Date()): Promise<RecognitionMissions> {
  const kept = isNull(recognitions.withdrawnAt);
  const [sent] = await db
    .select({ n: count() })
    .from(recognitions)
    // Sent, and the minutes for taking it back are over.
    .where(and(eq(recognitions.fromId, viewer.id), original, kept, lte(recognitions.deliverAt, now)));
  const [opened] = await db.select({ n: count() }).from(recognitions).where(and(eq(recognitions.toId, viewer.id), isNotNull(recognitions.openedAt)));
  const [joined] = await db.select({ n: count() }).from(recognitions).where(and(eq(recognitions.fromId, viewer.id), isNotNull(recognitions.parentId), kept));
  const [reacted] = await db.select({ n: count() }).from(reactionRows).where(and(eq(reactionRows.userId, viewer.id), eq(reactionRows.targetType, 'recognition')));
  const [values] = await db
    .select({ n: sql<number>`count(distinct ${recognitions.valueId})::int` })
    .from(recognitions)
    .where(and(eq(recognitions.fromId, viewer.id), original, kept));
  return {
    sent: (sent?.n ?? 0) > 0,
    opened: (opened?.n ?? 0) > 0,
    joined: (joined?.n ?? 0) > 0,
    reacted: (reacted?.n ?? 0) > 0,
    twoValues: (values?.n ?? 0) >= 2,
  };
}

export async function recognitionTutorialOf(viewer: Pick<Viewer, 'id'>) {
  const [row] = await db.select({ t: employees.recognitionTutorial }).from(employees).where(eq(employees.id, viewer.id));
  return cleanTutorial(row?.t);
}

/** Where the colleague is in each tutorial, and which missions are done. */
export async function recognitionTutorial(viewer: Pick<Viewer, 'id'>, now = new Date()) {
  const [progress, missions] = await Promise.all([recognitionTutorialOf(viewer), recognitionMissions(viewer, now)]);
  return { progress, missions };
}

/** Saves a step of a tutorial; the parts not named stay as they were. */
export async function setRecognitionTutorial(viewer: Pick<Viewer, 'id'>, change: RecognitionTutorial) {
  return db.transaction(async (tx) => {
    // Two pages saving at once (a step on the phone, another on the computer) should not lose either.
    const [row] = await tx.select({ t: employees.recognitionTutorial }).from(employees).where(eq(employees.id, viewer.id)).for('update');
    const next = withTutorialChange(cleanTutorial(row?.t), change);
    await tx.update(employees).set({ recognitionTutorial: next }).where(eq(employees.id, viewer.id));
    return next;
  });
}

// ---- The monthly recap (phase 2, 2.3) -----------------------------------------------------------------

/**
 * «کارنامهٔ سپاس»: one colleague's own month, for them alone. What they gave (to how many colleagues, in
 * how many units, how many of those units for the first time, how many coins), what they received and
 * opened (how many coins, the value they were thanked for most, one sentence from it). Null when they
 * neither gave nor received anything that month: no empty card, no reproach.
 */
export async function recognitionRecap(viewer: Pick<Viewer, 'id'>, month: string) {
  const givenRows = await db
    .select({ amount: recognitions.amount, parentId: recognitions.parentId, toId: recognitions.toId, department: receiver.department })
    .from(recognitions)
    .innerJoin(receiver, eq(receiver.id, recognitions.toId))
    .where(and(eq(recognitions.fromId, viewer.id), eq(recognitions.month, month), standing));
  // Coins received count once opened (a «من هم» has no seal), as in the wallet.
  const receivedRows = await db
    .select({ r: recognitions, from: personColumns(sender) })
    .from(recognitions)
    .innerJoin(sender, eq(sender.id, recognitions.fromId))
    .where(
      and(
        eq(recognitions.toId, viewer.id),
        eq(recognitions.month, month),
        isNotNull(recognitions.deliveredAt),
        standing,
        or(isNotNull(recognitions.openedAt), isNotNull(recognitions.parentId)),
      ),
    );
  if (givenRows.length === 0 && receivedRows.length === 0) return null;

  const units = new Set(givenRows.map((g) => g.department || ''));
  units.delete('');
  // Units thanked in an earlier month: what is left is new this month.
  const before = await db
    .selectDistinct({ department: receiver.department })
    .from(recognitions)
    .innerJoin(receiver, eq(receiver.id, recognitions.toId))
    .where(and(eq(recognitions.fromId, viewer.id), lt(recognitions.month, month), standing));
  const earlier = new Set(before.map((b) => b.department));

  const originals = receivedRows.filter((x) => x.r.parentId === null);
  const byValue = new Map<string, { label: string; tone: string; count: number }>();
  for (const { r } of originals) {
    const v = byValue.get(r.valueId) ?? { label: r.valueLabel, tone: r.valueTone, count: 0 };
    v.count += 1;
    byValue.set(r.valueId, v);
  }
  const topValue = [...byValue.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  // The most recent message they received and opened that month.
  const latest = originals.sort((a, b) => (b.r.deliveredAt?.getTime() ?? 0) - (a.r.deliveredAt?.getTime() ?? 0))[0] ?? null;

  return {
    month,
    gave: {
      recognitions: givenRows.filter((g) => g.parentId === null).length,
      people: new Set(givenRows.map((g) => g.toId)).size,
      units: units.size,
      newUnits: [...units].filter((u) => !earlier.has(u)).length,
      coins: givenRows.reduce((sum, g) => sum + g.amount, 0),
    },
    received: {
      recognitions: originals.length,
      coins: receivedRows.reduce((sum, x) => sum + x.r.amount, 0),
      topValue: topValue ? { label: topValue.label, tone: topValue.tone } : null,
      quote: latest ? { message: latest.r.message, from: person(latest.from) } : null,
    },
  };
}
