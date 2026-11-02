// Notifications on phones and computers (Web Push). The portal signs each message with its own key pair
// (VAPID, kept in settings) and hands it, encrypted for that one browser, to the browser's push service
// (Google for Chrome and Android, Apple for iPhone and Safari, Mozilla for Firefox, Microsoft for Edge),
// which wakes the phone or computer. So the server needs to reach the internet; nothing else is needed.
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { config } from './config.js';
import { db } from './db/index.js';
import { employees, pushSubscriptions, settings } from './db/schema.js';
import { featureConfig } from './features.js';
import { ensureSettings } from './settings.js';
import { featureOfNotification, featureOfTab, featureVisible, type FeatureConfig } from '../shared/features.js';
import { pushCategoryOf, pushUrl } from '../shared/push.js';

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Messages with the same tag replace each other on the device instead of piling up. */
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one message to one browser; returns the push service's answer code. Replaced in tests. */
export type PushSender = (target: PushTarget, payload: string) => Promise<number>;

let keys: { publicKey: string; privateKey: string } | null = null;

/** The portal's key pair, made once and kept in settings so devices stay subscribed across restarts. */
export async function vapidKeys() {
  if (keys) return keys;
  const read = async () => {
    const [row] = await db
      .select({ publicKey: settings.vapidPublicKey, privateKey: settings.vapidPrivateKey })
      .from(settings)
      .where(eq(settings.id, 'global'));
    return row;
  };
  let row = await read();
  if (!row) {
    await ensureSettings();
    row = await read();
  }
  if (!row?.publicKey) {
    const made = webpush.generateVAPIDKeys();
    // Only fills empty keys, so two starts at once agree on one pair.
    await db
      .update(settings)
      .set({ vapidPublicKey: made.publicKey, vapidPrivateKey: made.privateKey })
      .where(and(eq(settings.id, 'global'), eq(settings.vapidPublicKey, '')));
    row = await read();
  }
  if (!row?.publicKey) throw new Error('the portal settings are missing');
  keys = row;
  return keys;
}

/** Forgets the cached keys (tests empty the database between files). */
export const resetPushKeys = () => {
  keys = null;
};

// Push services want a way to reach whoever runs the server: the portal's https address, or an e-mail.
const vapidSubject = () =>
  config.appUrl.startsWith('https://') ? config.appUrl : `mailto:${config.smtp?.from && config.smtp.from.includes('@') ? config.smtp.from.replace(/^.*<|>.*$/g, '') : 'portal@royaco.com'}`;

const defaultSender: PushSender = async (target, payload) => {
  const { publicKey, privateKey } = await vapidKeys();
  try {
    const res = await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      {
        vapidDetails: { subject: vapidSubject(), publicKey, privateKey },
        // A message nobody could deliver within a day is stale (the bell still has it).
        TTL: 24 * 60 * 60,
        timeout: 15000,
        ...(process.env.PUSH_PROXY ? { proxy: process.env.PUSH_PROXY } : {}),
      },
    );
    return res.statusCode;
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code) return code;
    throw err;
  }
};

let sender: PushSender = defaultSender;

/** Tests replace the network with a recorder. */
export const setPushSender = (next: PushSender | null) => {
  sender = next ?? defaultSender;
};

/** The last delivery and the last failure, for the administrator's view (kept in memory). */
export const pushStatus: { lastOkAt: string | null; lastError: { at: string; message: string } | null } = {
  lastOkAt: null,
  lastError: null,
};

const noteError = (message: string) => {
  pushStatus.lastError = { at: new Date().toISOString(), message: message.slice(0, 300) };
};

/** Whether this colleague gets this notification on their devices at all. */
export function wantsPush(
  features: FeatureConfig,
  person: { id: string; role: string; pushMuted: string[] },
  input: { type: string; linkTab?: string | null },
) {
  if (!featureVisible(features, 'pushNotifications', person)) return false;
  // A part that is hidden from them keeps its notifications back, as the bell does.
  const typeFeature = featureOfNotification(input.type);
  if (typeFeature && !featureVisible(features, typeFeature, person)) return false;
  const tabFeature = input.linkTab ? featureOfTab(input.linkTab) : undefined;
  if (tabFeature && !featureVisible(features, tabFeature, person)) return false;
  return !person.pushMuted.includes(pushCategoryOf(input.type));
}

export const pushMessage = (input: { title: string; message: string; type: string; linkTab?: string | null; linkId?: string | null }): PushMessage => ({
  title: input.title.slice(0, 120),
  body: input.message.slice(0, 300),
  url: pushUrl(input.linkTab, input.linkId),
  tag: `${input.type}:${input.linkTab ?? ''}:${input.linkId ?? ''}`,
});

/** Delivers to every device of the subscribed colleagues; devices the push service has forgotten are removed. */
export async function deliver(rows: (PushTarget & { userId: string })[], message: PushMessage) {
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const payload = JSON.stringify(message);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  const delivered: string[] = [];
  // About a hundred colleagues with a device or two each; a few at a time keeps the server calm.
  const queue = [...rows];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      try {
        const code = await sender(row, payload);
        if (code >= 200 && code < 300) {
          sent += 1;
          delivered.push(row.endpoint);
        } else if (code === 404 || code === 410) {
          // The browser was uninstalled, signed out or its permission withdrawn.
          gone.push(row.endpoint);
        } else {
          failed += 1;
          noteError(`push service answered ${code}`);
        }
      } catch (err) {
        failed += 1;
        noteError(err instanceof Error ? err.message : String(err));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, rows.length) }, worker));
  if (gone.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone));
  if (delivered.length > 0) {
    pushStatus.lastOkAt = new Date().toISOString();
    await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(inArray(pushSubscriptions.endpoint, delivered));
  }
  return { sent, failed };
}

/** Called for every new notification; never throws, so the bell is never held up by the phones. */
export async function pushToUsers(userIds: string[], input: { title: string; message: string; type: string; linkTab?: string | null; linkId?: string | null }) {
  try {
    if (userIds.length === 0) return;
    const rows = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        userId: pushSubscriptions.userId,
        role: employees.role,
        pushMuted: employees.pushMuted,
      })
      .from(pushSubscriptions)
      .innerJoin(employees, eq(employees.id, pushSubscriptions.userId))
      .where(
        and(
          inArray(pushSubscriptions.userId, userIds),
          eq(employees.isActive, true),
          eq(employees.hasAccount, true),
          isNotNull(pushSubscriptions.p256dh),
        ),
      );
    if (rows.length === 0) return;
    const features = await featureConfig();
    const targets = rows.filter((r) => wantsPush(features, { id: r.userId, role: r.role, pushMuted: r.pushMuted }, input));
    await deliver(targets, pushMessage(input));
  } catch (err) {
    noteError(err instanceof Error ? err.message : String(err));
    console.error('push failed:', err);
  }
}

/** How many colleagues and devices get notifications outside the portal (for the administrator). */
export async function pushCounts() {
  const [row] = await db
    .select({ devices: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${pushSubscriptions.userId})::int` })
    .from(pushSubscriptions);
  return row ?? { devices: 0, people: 0 };
}
