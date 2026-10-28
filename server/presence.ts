import { broadcastChange, connectedUserIds, watchConnections } from './events.js';
import { ONLINE_IDLE_MINUTES } from '../shared/kudos.js';

// Who is online for «همکاران آنلاین»: someone with a page of the portal open (its live connection)
// who did something in the last few minutes. Kept in memory only; a restart starts everyone afresh
// and their pages reconnect within seconds.

const IDLE_MS = ONLINE_IDLE_MINUTES * 60 * 1000;
/** Comings and goings within this long are signalled together. */
const SETTLE_MS = 1500;
/** How often people who went quiet are taken off the list. */
const SWEEP_MS = 30_000;

const lastActive = new Map<string, number>();
let lastSignal = '';
let pending: NodeJS.Timeout | null = null;

/** The people who are online now (in no particular order), before anyone's own choice to be hidden. */
export function onlineIds(now = Date.now()) {
  return [...connectedUserIds()].filter((id) => now - (lastActive.get(id) ?? 0) < IDLE_MS);
}

/** Tells everyone's pages to fetch the list again when someone came or went. */
export function checkPresence(now = Date.now()) {
  const signal = onlineIds(now).sort().join(',');
  if (signal === lastSignal) return;
  lastSignal = signal;
  broadcastChange('presence');
}

function checkSoon() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    checkPresence();
  }, SETTLE_MS);
  pending.unref?.();
}

/** The person clicked, typed or scrolled on a page of the portal (or just opened one). */
export function markActive(userId: string, now = Date.now()) {
  const wasOnline = now - (lastActive.get(userId) ?? 0) < IDLE_MS;
  lastActive.set(userId, now);
  if (!wasOnline) checkSoon();
}

/** Someone's choice to be shown changed, so the list differs although nobody came or went. */
export function presenceChanged() {
  broadcastChange('presence');
}

watchConnections((userId, opened) => {
  if (opened) markActive(userId);
  checkSoon();
});

/** Takes people who went quiet off the list; started with the server. */
export function startPresenceSweep() {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, at] of lastActive) if (now - at > 2 * IDLE_MS && !connectedUserIds().has(id)) lastActive.delete(id);
    checkPresence(now);
  }, SWEEP_MS);
  timer.unref();
}
