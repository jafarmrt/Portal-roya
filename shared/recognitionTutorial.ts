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
  /** The highest tier of each badge ever reached (2.5): a badge earned stays earned. */
  badges?: Partial<Record<RecognitionBadge, BadgeTier>>;
  /** The tiers the colleague has already been told about («نشان تازه»). */
  badgesSeen?: Partial<Record<RecognitionBadge, BadgeTier>>;
  /** The colleague shows their badges in their profile (off unless they turn it on). */
  badgesOnProfile?: boolean;
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
  for (const key of ['badges', 'badgesSeen'] as const) {
    const tiers = v[key] as Record<string, unknown> | undefined;
    if (tiers && typeof tiers === 'object') {
      const clean: Partial<Record<RecognitionBadge, BadgeTier>> = {};
      for (const b of RECOGNITION_BADGES) if ([1, 2, 3].includes(tiers[b] as number)) clean[b] = tiers[b] as BadgeTier;
      out[key] = clean;
    }
  }
  if (typeof v.badgesOnProfile === 'boolean') out.badgesOnProfile = v.badgesOnProfile;
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
  const before = cleanTutorial(kept);
  const next = { ...before, ...cleanTutorial(change) };
  // Tiers only go up.
  for (const key of ['badges', 'badgesSeen'] as const) {
    if (!change[key]) continue;
    const merged = { ...before[key] };
    for (const [b, t] of Object.entries(cleanTutorial(change)[key] ?? {}) as [RecognitionBadge, BadgeTier][]) merged[b] = Math.max(merged[b] ?? 0, t) as BadgeTier;
    next[key] = merged;
  }
  if (change.missions) next.missions = { ...cleanTutorial(kept).missions, ...cleanTutorial(change).missions };
  return next;
}

/** The five missions, in the order the card lists them. */
export const RECOGNITION_MISSIONS = ['sent', 'opened', 'joined', 'reacted', 'twoValues'] as const;
export type RecognitionMission = (typeof RECOGNITION_MISSIONS)[number];
export type RecognitionMissions = Record<RecognitionMission, boolean>;

// ---- Badges (phase 2, 2.5) ----------------------------------------------------------------------------

/** Mostly for giving: research on peer recognition found that ranking receivers lowers helping. */
export const RECOGNITION_BADGES = ['bridge', 'steady', 'eyes', 'companion', 'values'] as const;
export type RecognitionBadge = (typeof RECOGNITION_BADGES)[number];

/** 1 copper, 2 silver, 3 gold (0: not yet). «ارزش‌ها» has one tier only, shown as gold. */
export type BadgeTier = 0 | 1 | 2 | 3;

export const BADGE_INFO: Record<RecognitionBadge, { name: string; about: string; unit: string; steps: readonly number[] }> = {
  bridge: { name: 'پل', about: 'قدردانی از همکاران در واحدهای مختلف', unit: 'واحد', steps: [3, 5, 8] },
  steady: { name: 'پیوسته', about: 'دست‌کم یک قدردانی در ماه‌های پشت سر هم', unit: 'ماه', steps: [3, 6, 12] },
  eyes: { name: 'چشم باز', about: 'قدردانی از همکاران مختلف', unit: 'همکار', steps: [5, 15, 30] },
  companion: { name: 'همراه', about: '«من هم» روی کارت‌های دیوار', unit: 'کارت', steps: [5, 15, 40] },
  values: { name: 'ارزش‌ها', about: 'دست‌کم یک قدردانی برای هر یک از ارزش‌ها', unit: 'ارزش', steps: [] },
};

/** The tier a count reaches (for «ارزش‌ها»: all of them or none). */
export function badgeTier(badge: RecognitionBadge, count: number, of = 0): BadgeTier {
  if (badge === 'values') return of > 0 && count >= of ? 3 : 0;
  const steps = BADGE_INFO[badge].steps;
  return (steps.filter((s) => count >= s).length as BadgeTier) ?? 0;
}

/** The longest run of Jalali months in a row ('1405/07', '1405/08', …) among these. */
export function longestRun(months: readonly string[]): number {
  const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;
  const sorted = [...new Set(months.map(index))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  sorted.forEach((n, i) => {
    run = i > 0 && n === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}
