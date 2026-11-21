// The tutorials of «سپاس» (stage 6b of the plan): how far each colleague got, kept on the server so the
// phone and the computer agree. Nothing here is ever counted in the programme owner's report.

/** The main tour's steps, 0 (welcome) to 12 (done); see src/components/thanks/tour/mainSteps.ts. */
export const MAIN_TOUR_LAST_STEP = 12;

/**
 * - `active`: started, at `step`, and comes back there next time;
 * - `later`: «بعداً» on the welcome, so it does not open by itself again (the «؟» menu starts it);
 * - `skipped` / `done`: the same, after skipping it or reaching the end.
 */
export type TourState = 'active' | 'later' | 'skipped' | 'done';

/** The short tours: the first recognition received, and the programme owner's page. */
export type ShortTourState = 'done' | 'skipped';

export interface RecognitionTutorial {
  main?: { state: TourState; step: number };
  received?: ShortTourState;
  owner?: ShortTourState;
  /** The last month whose recap (2.3) opened by itself; it does not open again for that month. */
  recapSeen?: string;
  missions?: {
    /** «پنهان کردن فهرست»: the card is away until the «؟» menu brings it back. */
    hidden?: boolean;
    /** All five done and celebrated once; the card folds away after that. */
    celebrated?: boolean;
  };
}

const TOUR_STATES: readonly TourState[] = ['active', 'later', 'skipped', 'done'];
const SHORT_STATES: readonly ShortTourState[] = ['done', 'skipped'];

/** Only the known parts, in their shapes; anything else (an older shape, a typo) is dropped. */
export function cleanTutorial(value: unknown): RecognitionTutorial {
  const out: RecognitionTutorial = {};
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  const main = v.main as { state?: unknown; step?: unknown } | undefined;
  if (main && TOUR_STATES.includes(main.state as TourState)) {
    const step = Number.isInteger(main.step) ? Math.min(MAIN_TOUR_LAST_STEP, Math.max(0, main.step as number)) : 0;
    out.main = { state: main.state as TourState, step };
  }
  if (SHORT_STATES.includes(v.received as ShortTourState)) out.received = v.received as ShortTourState;
  if (SHORT_STATES.includes(v.owner as ShortTourState)) out.owner = v.owner as ShortTourState;
  if (typeof v.recapSeen === 'string' && /^\d{4}\/\d{2}$/.test(v.recapSeen)) out.recapSeen = v.recapSeen;
  const missions = v.missions as Record<string, unknown> | undefined;
  if (missions && typeof missions === 'object') {
    out.missions = {};
    if (typeof missions.hidden === 'boolean') out.missions.hidden = missions.hidden;
    if (typeof missions.celebrated === 'boolean') out.missions.celebrated = missions.celebrated;
  }
  return out;
}

/** A change from the page laid over what is kept: parts not named stay as they were. */
export function withTutorialChange(kept: RecognitionTutorial, change: RecognitionTutorial): RecognitionTutorial {
  const next = { ...cleanTutorial(kept), ...cleanTutorial(change) };
  if (change.missions) next.missions = { ...cleanTutorial(kept).missions, ...cleanTutorial(change).missions };
  return next;
}

/** The five missions, in the order the card lists them. */
export const RECOGNITION_MISSIONS = ['sent', 'opened', 'joined', 'reacted', 'twoValues'] as const;
export type RecognitionMission = (typeof RECOGNITION_MISSIONS)[number];
export type RecognitionMissions = Record<RecognitionMission, boolean>;
