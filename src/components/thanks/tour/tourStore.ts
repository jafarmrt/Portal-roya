import { useSyncExternalStore } from 'react';
import { RECOGNITION_MISSIONS, withTutorialChange, type RecognitionMissions, type RecognitionTutorial, type TourState } from '../../../../shared/recognitionTutorial';
import { api } from '../../../lib/api';

// The tutorials of «سپاس» on the client: how far the colleague got (kept on the server, so another device
// carries on from the same step), which of the five missions are done, and which tour is on screen now.

export type TourKind = 'main' | 'received' | 'owner';

interface TourStoreState {
  loaded: boolean;
  progress: RecognitionTutorial;
  missions: RecognitionMissions | null;
  /** The tour on screen and its step; null when none is. */
  active: { kind: TourKind; step: number } | null;
  /** «از آموزش رد می‌شوید؟» is being asked. */
  askingSkip: boolean;
  /** The missions card was asked for from the «؟» menu after it had been hidden or folded away. */
  missionsShown: boolean;
  /** «بعداً» on the welcome: the line saying where to start it later is on screen. */
  laterNote: boolean;
  /** «آموزش برنامهٔ سپاس» was chosen on the «سپاس» page; it starts when «برنامهٔ سپاس» opens. */
  ownerAsked: boolean;
}

let state: TourStoreState = { loaded: false, progress: {}, missions: null, active: null, askingSkip: false, missionsShown: false, laterNote: false, ownerAsked: false };

const listeners = new Set<() => void>();
const set = (patch: Partial<TourStoreState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useTour = () => useSyncExternalStore(subscribe, () => state);
export const tourState = () => state;

/** Loads the progress and the missions; quiet on failure (no tour then, the page works as before). */
export async function loadTutorial() {
  try {
    const body = await api.get<{ progress: RecognitionTutorial; missions: RecognitionMissions }>('/api/recognitions/tutorial');
    set({ loaded: true, progress: body.progress, missions: body.missions });
  } catch {
    if (!state.loaded) set({ loaded: true });
  }
}

/** Only the progress (the programme owner's page: their missions are not shown there). */
export async function loadTutorialProgress() {
  try {
    const body = await api.get<{ progress: RecognitionTutorial }>('/api/recognitions/tutorial');
    set({ loaded: true, progress: body.progress });
  } catch {
    if (!state.loaded) set({ loaded: true });
  }
}

/** Keeps a step: at once on this page, and on the server for the next visit (quietly; a lost step is no loss). */
export function saveTutorial(change: RecognitionTutorial) {
  set({ progress: withTutorialChange(state.progress, change) });
  void api.put('/api/recognitions/tutorial', change).catch(() => undefined);
}

export function startTour(kind: TourKind, step = 0) {
  set({ active: { kind, step }, askingSkip: false, laterNote: false });
  if (kind === 'main') saveTutorial({ main: { state: 'active', step } });
}

/** The main tour moves on; where it is kept is the step it comes back to (see `resumeStep`). */
export function goToStep(step: number) {
  if (!state.active) return;
  set({ active: { ...state.active, step }, askingSkip: false });
  if (state.active.kind === 'main') saveTutorial({ main: { state: 'active', step } });
}

export function endTour(how: 'done' | 'skipped' | 'later') {
  const active = state.active;
  if (!active) return;
  set({ active: null, askingSkip: false, laterNote: how === 'later' });
  if (active.kind === 'main') saveTutorial({ main: { state: how as TourState, step: active.step } });
  else if (how !== 'later') saveTutorial({ [active.kind]: how });
}

/** Leaves the page: the tour waits where it is (the main one comes back next time from the server). */
export function pauseTour() {
  if (state.active || state.askingSkip) set({ active: null, askingSkip: false });
}

export const askSkip = (asking: boolean) => set({ askingSkip: asking });
export const askOwnerTour = (asked: boolean) => set({ ownerAsked: asked });
export const closeLaterNote = () => set({ laterNote: false });

export function showMissions() {
  set({ missionsShown: true });
  saveTutorial({ missions: { hidden: false } });
}

export function hideMissions() {
  set({ missionsShown: false });
  saveTutorial({ missions: { hidden: true } });
}

export const missionsDone = (missions: RecognitionMissions | null) => (missions ? RECOGNITION_MISSIONS.filter((m) => missions[m]).length : 0);

/** Signing out, or «سپاس» switched off. */
export function resetTutorial() {
  set({ loaded: false, progress: {}, missions: null, active: null, askingSkip: false, missionsShown: false, laterNote: false, ownerAsked: false });
}
