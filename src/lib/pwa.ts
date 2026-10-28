/**
 * Installing the portal on a phone or computer as an app (PWA). The service worker (public/sw.js)
 * only shows an offline page; the browser asks for it only over a trusted HTTPS address or localhost.
 */

/** Chrome's install event; not in the DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 'ready': the browser can install the portal as a full app; 'shortcut': only a home-screen shortcut. */
export type WorkerState = 'pending' | 'ready' | 'shortcut';

export interface InstallState {
  canPrompt: boolean;
  workerState: WorkerState;
  installed: boolean;
}

let installPrompt: InstallPromptEvent | null = null;
// A new object on every change, as useSyncExternalStore expects.
let state: InstallState = { canPrompt: false, workerState: 'pending', installed: false };
const listeners = new Set<() => void>();
const update = (patch: Partial<InstallState>) => {
  state = { ...state, ...patch, canPrompt: !!installPrompt };
  listeners.forEach((listener) => listener());
};

export const subscribeInstall = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const installState = () => state;

/** True when the portal is already open as an installed app. */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (!!window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

export const isAndroid = () => /Android/i.test(navigator.userAgent);

/** Shows the browser's own install dialog; false when it is not offered (then the page explains the menu). */
export async function promptInstall() {
  const event = installPrompt;
  if (!event) return false;
  installPrompt = null;
  update({});
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') update({ installed: true });
  return true;
}

/** Called once at start-up, before React renders, so the browser's install event is not missed. */
export function setUpInstall() {
  if (isStandalone()) update({ installed: true });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    update({});
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    update({ installed: true });
  });
  // Over plain http, or while the company certificate is not trusted, browsers refuse service workers;
  // phones then add a shortcut that opens the portal in the browser.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    update({ workerState: 'shortcut' });
    return;
  }
  navigator.serviceWorker.register('/sw.js').then(
    () => update({ workerState: 'ready' }),
    () => update({ workerState: 'shortcut' }),
  );
}
