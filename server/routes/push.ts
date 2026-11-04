import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { isAdmin } from '../auth.js';
import { db } from '../db/index.js';
import { employees, pushSubscriptions } from '../db/schema.js';
import { currentUser, parse, route } from '../http.js';
import { deliver, pushCounts, pushStatus, vapidKeys } from '../push.js';
import { PUSH_CATEGORY_IDS } from '../../shared/push.js';

export const pushRouter = Router();

// Only the browsers' own push services: the server sends to whatever address is saved here, so a
// colleague can never point it at a machine inside the company.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export const isPushEndpoint = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
};

const endpointSchema = z.string().max(1000).refine(isPushEndpoint, 'نشانی اعلان این مرورگر پذیرفته نیست.');

pushRouter.get(
  '/push',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { publicKey } = await vapidKeys();
    const devices = await db
      .select({ endpoint: pushSubscriptions.endpoint, device: pushSubscriptions.device, createdAt: pushSubscriptions.createdAt })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, viewer.id));
    res.json({
      publicKey,
      muted: viewer.pushMuted,
      devices: devices.map((d) => ({ endpoint: d.endpoint, device: d.device, createdAt: d.createdAt.toISOString() })),
      // How it is going, for the administrator: are messages leaving the server at all?
      ...(isAdmin(viewer) ? { status: { ...(await pushCounts()), ...pushStatus } } : {}),
    });
  }),
);

pushRouter.post(
  '/push/subscribe',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const body = parse(
      z.object({
        endpoint: endpointSchema,
        keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
        device: z.string().max(60).optional(),
      }),
      req.body,
    );
    const values = { userId: viewer.id, p256dh: body.keys.p256dh, auth: body.keys.auth, device: body.device ?? '' };
    // A shared computer: whoever signed in last gets that browser's notifications.
    await db
      .insert(pushSubscriptions)
      .values({ endpoint: body.endpoint, ...values })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    res.json({ success: true });
  }),
);

pushRouter.post(
  '/push/unsubscribe',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { endpoint } = parse(z.object({ endpoint: z.string().max(1000) }), req.body);
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, viewer.id)));
    res.json({ success: true });
  }),
);

/** The kinds of notification the colleague does not want on their devices. */
pushRouter.put(
  '/push/me',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { muted } = parse(z.object({ muted: z.array(z.string()).max(20) }), req.body);
    const saved = [...new Set(muted.filter((id) => PUSH_CATEGORY_IDS.includes(id)))];
    await db.update(employees).set({ pushMuted: saved }).where(eq(employees.id, viewer.id));
    res.json({ muted: saved });
  }),
);

/** A test message to the colleague's own devices, to see that it arrives. */
pushRouter.post(
  '/push/test',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db
      .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth, userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, viewer.id));
    const result = await deliver(rows, {
      title: 'اعلان آزمایشی پرتال',
      body: 'اگر این پیام را می‌بینید، اعلان‌های پرتال روی این دستگاه می‌آید.',
      url: '/#notifications',
      // Its own tag each time: a second test with the same tag would silently replace the first one
      // still on the phone, without sound or vibration, and look as if it never arrived.
      tag: `test-${Date.now()}`,
    });
    res.json({ devices: rows.length, ...result });
  }),
);
