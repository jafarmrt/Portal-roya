import { useSyncExternalStore } from 'react';
import { hasOpenDialog, hasUnsavedWork } from './unsavedWork';

// A page that was opened before an update keeps running the old version until it is refreshed. Every
// build of the page has a name (`__BUILD_ID__`, see vite.config.ts) and the server says which build it
// hands out: at the start of the live connection (so within seconds of an update, which restarts the
// server), and in the status check made on coming back to the page and every few minutes. When the
// two differ the page offers to refresh itself (<UpdateNotice>), and does so by itself at a moment
// when nothing can be lost: nothing unsaved, and the page in the background or on its way to another part.

/** How long «بعداً» keeps the card away. */
export const UPDATE_SNOOZE_MS = 60 * 60 * 1000;
/** How long the page must have been in the background before it refreshes itself. */
const HIDDEN_MS = 45_000;
/** The build this page already refreshed itself for, so a refresh that did not help is not repeated. */
const TRIED_KEY = 'roya.update.triedFor';

interface State {
  /** The server hands out another build than this page's. */
  available: boolean;
  serverBuild: string | null;
  /** The card stays away until then; the header keeps a small mark. */
  snoozedUntil: number;
}

let state: State = { available: false, serverBuild: null, snoozedUntil: 0 };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useAppUpdate = () => useSyncExternalStore(subscribe, () => state);

/** The name of this page's own build; empty on the development server, where nothing is compared. */
const ownBuild = () => (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '');

/** What the server said about the build it hands out (anything else than a name is ignored). */
export function reportServerBuild(build: unknown) {
  if (typeof build !== 'string' || !build || !ownBuild()) return;
  const available = build !== ownBuild();
  if (available === state.available && (!available || build === state.serverBuild)) return;
  set({ available, serverBuild: available ? build : null });
  if (available) scheduleHiddenRefresh();
}

/** A file of this page's version is gone from the server: it was updated, whatever its build is called. */
export function announceUpdate() {
  if (!state.available) set({ available: true });
}

export function snoozeUpdate() {
  set({ snoozedUntil: Date.now() + UPDATE_SNOOZE_MS });
}

export function showUpdateCard() {
  set({ snoozedUntil: 0 });
}

const readTried = () => {
  try {
    return window.sessionStorage.getItem(TRIED_KEY);
  } catch {
    return null;
  }
};

/** Loads the new version. Drafts of open forms are written on the way out (src/lib/drafts.ts). */
export function refreshNow() {
  try {
    window.sessionStorage.setItem(TRIED_KEY, state.serverBuild ?? 'unknown');
  } catch {
    // Without storage the refresh is simply not remembered.
  }
  window.location.reload();
}

/**
 * Refreshes without asking, when that is safe: an update is waiting, nothing is unsaved, and this page
 * has not already refreshed itself for the same build (a proxy that keeps handing out the old page
 * would otherwise make it refresh for ever). `underDialog`: whether an open dialog may be closed by it.
 */
function refreshIfSafe(underDialog: boolean): boolean {
  if (!state.available) return false;
  if (readTried() === (state.serverBuild ?? 'unknown')) return false;
  if (hasUnsavedWork() || (!underDialog && hasOpenDialog())) return false;
  refreshNow();
  return true;
}

/** The person moved to another part of the portal: the new part can as well come from the new version. */
export const refreshOnNavigation = () => refreshIfSafe(true);

let hiddenTimer: number | undefined;
function scheduleHiddenRefresh() {
  if (typeof document === 'undefined') return;
  window.clearTimeout(hiddenTimer);
  if (!state.available || document.visibilityState !== 'hidden') return;
  // Not every open page at the same second.
  hiddenTimer = window.setTimeout(() => {
    if (document.visibilityState === 'hidden') refreshIfSafe(false);
  }, HIDDEN_MS + Math.random() * 30_000);
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', scheduleHiddenRefresh);

/** For tests. */
export function resetAppUpdate() {
  window.clearTimeout(hiddenTimer);
  set({ available: false, serverBuild: null, snoozedUntil: 0 });
}
