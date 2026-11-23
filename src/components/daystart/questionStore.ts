import { useSyncExternalStore } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { DayQuestionToday } from '../../../shared/dayQuestion';

// «پرسش روز» as the card sees it: today's question, the colleague's own answer and (after it) what
// everyone said. Asked for once per colleague and day; «رد شدن» is remembered in the browser only.

interface State {
  /** The colleague and day `today` belongs to. */
  key: string;
  /** Null until the first answer from the server (or its failure) has arrived. */
  today: DayQuestionToday | null;
  loaded: boolean;
  skipped: boolean;
}

const EMPTY: State = { key: '', today: null, loaded: false, skipped: false };
let state = EMPTY;
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const skipKey = (userId: string) => `roya.dayQuestion.skip.${userId}`;
function readSkipped(userId: string, date: string) {
  try {
    return window.localStorage.getItem(skipKey(userId)) === date;
  } catch {
    return false;
  }
}

/** Asks for today's question; `force` asks again (after a mood was changed, or others answered). */
export async function loadDayQuestion(userId: string, date: string, force = false) {
  const key = `${userId}:${date}`;
  if (state.key === key && !force) return;
  if (state.key !== key) set({ key, today: null, loaded: false, skipped: readSkipped(userId, date) });
  try {
    const today = await api.get<DayQuestionToday>('/api/moods/question');
    if (state.key === key) set({ ...state, today, loaded: true });
  } catch {
    // The card is just as useful without the question: the day goes on to its step.
    if (state.key === key) set({ ...state, loaded: true });
  }
}

/** Sends the answer; returns an error message to show, or null. */
export async function answerDayQuestion(option: number): Promise<string | null> {
  const key = state.key;
  try {
    const today = await api.post<DayQuestionToday>('/api/moods/question', { option });
    if (state.key === key) set({ ...state, today, loaded: true, skipped: false });
    return null;
  } catch (err) {
    return errorMessage(err);
  }
}

export function skipDayQuestion(userId: string, date: string, skipped = true) {
  try {
    if (skipped) window.localStorage.setItem(skipKey(userId), date);
    else window.localStorage.removeItem(skipKey(userId));
  } catch {
    // Storage switched off: skipped for this visit only.
  }
  set({ ...state, skipped });
}

export const useDayQuestion = () => useSyncExternalStore(subscribe, () => state);
