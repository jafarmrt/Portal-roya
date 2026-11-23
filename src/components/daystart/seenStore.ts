import { useSyncExternalStore } from 'react';

// Small things «شروع روز» remembers in the colleague's own browser, by name: the day the afternoon
// wrap-up was settled, the week whose «هفتهٔ من» was closed. A second device keeps its own.

const key = (userId: string, name: string) => `roya.daySeen.${name}.${userId}`;
const cache = new Map<string, string>();
const listeners = new Set<() => void>();

function read(userId: string, name: string): string {
  const k = key(userId, name);
  const known = cache.get(k);
  if (known !== undefined) return known;
  let value = '';
  try {
    value = window.localStorage.getItem(k) ?? '';
  } catch {
    // Storage switched off: remembered for this visit only.
  }
  cache.set(k, value);
  return value;
}

export function markSeen(userId: string, name: string, value: string) {
  const k = key(userId, name);
  cache.set(k, value);
  try {
    window.localStorage.setItem(k, value);
  } catch {
    // See above.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** What was remembered under `name` for this colleague ('' for nothing). */
export const useSeen = (userId: string, name: string) => useSyncExternalStore(subscribe, () => read(userId, name));
