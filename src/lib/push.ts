/**
 * Notifications on this phone or computer, outside the portal page. Two layers:
 * - Web Push: the server sends through the browser's push service (needs the server's internet),
 *   so it arrives even when the portal is closed.
 * - Local: while a portal tab is open (also in the background), new notifications from the portal's
 *   own live updates are shown by this page; this needs no internet at all.
 * Both use the same tag, so one notification never shows twice.
 */
import { api } from './api';
import { pushCategoryOf, pushTag, pushUrl } from '../../shared/push';
import { isIos, isStandalone } from './pwa';

export interface PushInfo {
  publicKey: string;
  muted: string[];
  devices: { endpoint: string; device: string; createdAt: string }[];
  status?: { people: number; devices: number; lastOkAt: string | null; lastError: { at: string; message: string } | null };
}

/** 'unsupported': this browser cannot show them; 'install-first': an iPhone that needs the portal installed. */
export type PushSupport = 'ok' | 'unsupported' | 'insecure' | 'install-first';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  }
  if (!window.isSecureContext) return 'insecure';
  if (!('PushManager' in window)) return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  return 'ok';
}

export const notificationPermission = (): NotificationPermission =>
  typeof Notification === 'undefined' ? 'denied' : Notification.permission;

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A short name for the colleague's list of devices. */
export function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'مرورگر';
  const os = /Android/.test(ua) ? 'اندروید' : isIos() ? 'آیفون' : /Windows/.test(ua) ? 'ویندوز' : /Mac OS/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : '';
  return os ? `${browser} روی ${os}` : browser;
}

async function registration() {
  // The worker is registered at start-up (lib/pwa.ts). Without one (it failed, or a development build)
  // there is nothing to wait for; otherwise wait for it, but not forever.
  if (!(await navigator.serviceWorker.getRegistration().catch(() => undefined))) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
}

/**
 * Something changed the push state of this device outside the one-time question: it was switched on or
 * off on «اعلان‌های من», or a new password removed the colleague's devices on the server.
 */
export const PUSH_CHANGED_EVENT = 'roya-push-changed';
export const announcePushChange = () => window.dispatchEvent(new Event(PUSH_CHANGED_EVENT));

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null;
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Asks for permission if needed and subscribes this browser; returns the permission it ended with. */
export async function enablePush(publicKey: string): Promise<NotificationPermission> {
  const permission = notificationPermission() === 'default' ? await Notification.requestPermission() : notificationPermission();
  if (permission !== 'granted') return permission;
  await subscribeDevice(publicKey);
  return permission;
}

/** Saves this browser's push address for the signed-in colleague (also when the portal's key changed). */
export async function subscribeDevice(publicKey: string) {
  if (pushSupport() !== 'ok' || notificationPermission() !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  const sameKey = (s: PushSubscription) => {
    const current = s.options.applicationServerKey;
    if (!current) return true;
    const bytes = new Uint8Array(current);
    return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
  };
  if (sub && !sameKey(sub)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    // E.g. the push service cannot be reached; the local layer still works while the portal is open.
    return false;
  }
  const json = sub.toJSON();
  await api.post('/api/push/subscribe', { endpoint: sub.endpoint, keys: json.keys, device: deviceName() });
  return true;
}

/** Stops this browser getting the signed-in colleague's notifications (on sign-out, or when they turn it off). */
export async function disablePushHere() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

// --- The local layer ---

let mutedKinds: string[] = [];
let localOn = false;

/** What the page knows of the colleague's choices; set by the push settings. */
export function setLocalPush(on: boolean, muted: string[]) {
  localOn = on;
  mutedKinds = muted;
}

/** Shows new notifications on the device while this tab is in the background. */
export async function showLocal(items: { id: string; title: string; message: string; type: string; linkTab?: string; linkId?: string }[]) {
  if (!localOn || items.length === 0 || notificationPermission() !== 'granted') return;
  // In front of them the bell already shows it.
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const reg = pushSupport() === 'ok' ? await registration() : null;
  for (const item of items.slice(0, 5)) {
    if (mutedKinds.includes(pushCategoryOf(item.type))) continue;
    const options: NotificationOptions = {
      body: item.message,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'fa',
      tag: pushTag(item.id),
      data: { url: pushUrl(item.linkTab, item.linkId) },
    };
    try {
      if (reg) await reg.showNotification(item.title, options);
      else new Notification(item.title, options);
    } catch {
      // Some browsers allow notifications only from the worker; nothing more to do.
    }
  }
}
