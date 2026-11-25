import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { NO_DISCOVER_MEMORY, readDiscoverMemory, type DiscoverMemory, type DiscoverPart, type DiscoverStatus, type TriedPart } from '../../../shared/discover';

// «کشف پرتال» in the browser: which parts the colleague can use and has used (from the server, once a
// visit), what «می‌دانستید؟» showed last and the parts they said they know (in this browser, like the
// day's step: it takes the step's place, which depends on the mood), and the short tour on screen.

let listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// ---- What the server says ----

interface PartsState {
  userId: string;
  parts: DiscoverStatus[] | null;
}
let parts: PartsState = { userId: '', parts: null };
let loading: Promise<void> | null = null;

export async function loadDiscover(userId: string, again = false) {
  if (!userId) return;
  if (!again && parts.userId === userId && (parts.parts || loading)) return loading ?? undefined;
  loading = api
    .get<{ parts: DiscoverStatus[] }>('/api/moods/discover')
    .then((r) => {
      parts = { userId, parts: r.parts };
    })
    .catch(() => {
      // Nothing to introduce today; the card works as before.
      parts = { userId, parts: [] };
    })
    .finally(() => {
      loading = null;
      emit();
    });
  return loading;
}

/** The parts of «کشف پرتال» for this colleague; null until they have arrived. */
export function useDiscoverParts(userId: string, enabled: boolean): DiscoverStatus[] | null {
  useEffect(() => {
    if (enabled) void loadDiscover(userId);
  }, [userId, enabled]);
  const state = useSyncExternalStore(subscribe, () => parts);
  return enabled && state.userId === userId ? state.parts : null;
}

const triedNow = new Set<string>();

/** A part was opened (the guides, the page of the colleague's own unit): once a visit, quietly. */
export function markTried(userId: string, part: TriedPart) {
  if (!userId || triedNow.has(`${userId}:${part}`)) return;
  triedNow.add(`${userId}:${part}`);
  if (parts.userId === userId && parts.parts) {
    parts = { userId, parts: parts.parts.map((p) => (p.part === part ? { ...p, used: true } : p)) };
    emit();
  }
  void api.post('/api/settings/portal-tried', { part }).catch(() => undefined);
}

// ---- What this browser remembers ----

const key = (userId: string) => `roya.discover.${userId}`;
const memories = new Map<string, DiscoverMemory>();

function readMemory(userId: string): DiscoverMemory {
  const known = memories.get(userId);
  if (known) return known;
  let memory = NO_DISCOVER_MEMORY;
  try {
    memory = readDiscoverMemory(JSON.parse(window.localStorage.getItem(key(userId)) ?? 'null'));
  } catch {
    // Storage switched off: «می‌دانستید؟» still works, it is just not remembered.
  }
  memories.set(userId, memory);
  return memory;
}

export function saveDiscoverMemory(userId: string, memory: DiscoverMemory) {
  memories.set(userId, memory);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(memory));
  } catch {
    // See above.
  }
  emit();
}

export const useDiscoverMemory = (userId: string) => useSyncExternalStore(subscribe, () => readMemory(userId));

// ---- The short tour ----

let tour: { part: DiscoverPart; step: number } | null = null;

export function startDiscoverTour(part: DiscoverPart) {
  tour = { part, step: 0 };
  emit();
}

export function moveDiscoverTour(step: number | null) {
  tour = step === null || !tour ? null : { ...tour, step };
  emit();
}

export const useDiscoverTour = () => useSyncExternalStore(subscribe, () => tour);

/** For the tests: every visit starts afresh. */
export function resetDiscoverStore() {
  parts = { userId: '', parts: null };
  memories.clear();
  triedNow.clear();
  tour = null;
  listeners = new Set();
}
