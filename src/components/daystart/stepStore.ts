import { useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { NO_STEP_MEMORY, readStepMemory, type DayStepKind, type DayStepMemory, type DayStepOutcome } from '../../../shared/dayStep';

// What «یک قدم برای امروز» remembers about a colleague stays in their own browser: the kinds they
// switched off and the last step shown. Which step is offered depends on the day's mood, so none of
// it goes to the server; a second device simply keeps its own memory.

const key = (userId: string) => `roya.dayStep.${userId}`;
const cache = new Map<string, DayStepMemory>();
const listeners = new Set<() => void>();

function read(userId: string): DayStepMemory {
  const known = cache.get(userId);
  if (known) return known;
  let memory = NO_STEP_MEMORY;
  try {
    memory = readStepMemory(JSON.parse(window.localStorage.getItem(key(userId)) ?? 'null'));
  } catch {
    // Storage switched off or unreadable: the day's step still works, it is just not remembered.
  }
  cache.set(userId, memory);
  return memory;
}

export function saveStepMemory(userId: string, memory: DayStepMemory) {
  cache.set(userId, memory);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(memory));
  } catch {
    // See above.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useStepMemory = (userId: string) => useSyncExternalStore(subscribe, () => read(userId));

const counted = new Set<string>();

/**
 * One more for the day's anonymous count of this kind of step (shown, taken, closed, switched off).
 * Once per kind and outcome while the page is open; quiet, and never worth an error message.
 */
export function countStep(kind: DayStepKind, outcome: DayStepOutcome, date: string) {
  const id = `${date}:${kind}:${outcome}`;
  if (counted.has(id)) return;
  counted.add(id);
  void api.post('/api/moods/steps', { kind, outcome }).catch(() => undefined);
}
