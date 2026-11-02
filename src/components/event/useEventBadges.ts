import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export interface EventBadge {
  icon: string;
  label: string;
}
type Badges = Record<string, EventBadge[]>;

// Champions and award winners of the past year's events, loaded once and kept for a while (they change
// only on the night of an event).
let cache: { at: number; data: Badges } | null = null;
let pending: Promise<Badges> | null = null;
const KEEP_MS = 10 * 60_000;

function load() {
  if (cache && Date.now() - cache.at < KEEP_MS) return Promise.resolve(cache.data);
  pending ??= api
    .get<Badges>('/api/event_badges')
    .then((data) => {
      cache = { at: Date.now(), data: data ?? {} };
      return cache.data;
    })
    .catch(() => ({}) as Badges)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The event badges of every colleague (empty while loading or when the feature is off). */
export function useEventBadges(enabled: boolean) {
  const [badges, setBadges] = useState<Badges>(() => cache?.data ?? {});
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void load().then((data) => alive && setBadges(data));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? badges : {};
}
