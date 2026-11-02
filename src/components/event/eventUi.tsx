import React, { useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, ApiError, errorMessage } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { Avatar } from '../common/Avatar';
import { BADGE_PREFIX, isBadge, phaseLabel, type EventPhase } from '../../../shared/specialEvents';
import type { EventCompetition, EventEntry, EventMatch, EventPerson, EventView } from './types';

/** The Yalda look: a night sky, pomegranate red, candle gold and watermelon green. */
export const YALDA = {
  night: '#161A33',
  nightSoft: '#232849',
  pomegranate: '#B3123B',
  gold: '#E9C46A',
  melon: '#2F7D4F',
};

export const heroStyle: React.CSSProperties = {
  background: `radial-gradient(120% 140% at 85% -10%, ${YALDA.pomegranate}55 0%, transparent 55%), radial-gradient(80% 90% at 0% 110%, ${YALDA.melon}40 0%, transparent 60%), linear-gradient(160deg, ${YALDA.night} 0%, ${YALDA.nightSoft} 100%)`,
};

/** A team's or player's name as shown everywhere: the team name, or the colleague's name. */
export function entryName(entry: EventEntry | undefined, people: Record<string, EventPerson>) {
  if (!entry) return '';
  if (entry.name) return entry.name;
  return entry.members.map((id) => people[id]?.name ?? 'همکار').join('، ');
}

/** The picture of an entry: a team badge or upload, or the player's photo. */
export const EntryPicture: React.FC<{ entry: EventEntry | undefined; people: Record<string, EventPerson>; className?: string; fileUrl?: (url: string) => string }> = ({
  entry,
  people,
  className = 'w-8 h-8 rounded-xl text-lg',
  fileUrl = (u) => u,
}) => {
  if (!entry) return <span className={`${className} bg-surface inline-flex items-center justify-center text-faint`}>؟</span>;
  if (entry.image && isBadge(entry.image)) {
    return (
      <span className={`${className} bg-amber-50 border border-amber-200 inline-flex items-center justify-center shrink-0`} aria-hidden>
        {entry.image.slice(BADGE_PREFIX.length)}
      </span>
    );
  }
  if (entry.image) return <img src={fileUrl(entry.image)} alt="" className={`${className} object-cover shrink-0`} />;
  const person = people[entry.members[0]];
  if (person?.avatarUrl) return <img src={fileUrl(person.avatarUrl)} alt="" className={`${className} object-cover shrink-0 rounded-full`} />;
  return <Avatar firstName={person?.firstName ?? '؟'} lastName={person?.lastName ?? ''} className={`${className} rounded-full shrink-0`} />;
};

export const PersonAvatar: React.FC<{ person: EventPerson | undefined; className?: string; src?: string }> = ({ person, className = 'w-8 h-8 rounded-full', src }) => (
  <Avatar src={src ?? person?.avatarUrl} firstName={person?.firstName ?? '؟'} lastName={person?.lastName ?? ''} className={className} />
);

export const PhaseChip: React.FC<{ phase: EventPhase; className?: string }> = ({ phase, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${phase === 'live' ? 'bg-amber-400 text-amber-950' : 'bg-white/15 text-white'} ${className}`}>
    {phase === 'live' && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" aria-hidden />}
    {phaseLabel(phase)}
  </span>
);

/** «۳ – ۱»، «برد فنی» or nothing yet. */
export function scoreLine(m: EventMatch) {
  if (m.walkover) return 'برد فنی';
  if (m.scoreA === null || m.scoreB === null) return '';
  const tie = m.tieA !== null && m.tieB !== null ? ` (پ ${toPersianDigits(m.tieA)}–${toPersianDigits(m.tieB)})` : '';
  return `${toPersianDigits(m.scoreA)} – ${toPersianDigits(m.scoreB)}${tie}`;
}

export type MatchState = 'waiting' | 'ready' | 'live' | 'done' | 'bye';

export function matchState(m: EventMatch): MatchState {
  if (m.bye) return 'bye';
  if (m.winnerId) return 'done';
  if (m.live) return 'live';
  if (m.entryA && m.entryB) return 'ready';
  return 'waiting';
}

export const MATCH_STATE_LABEL: Record<MatchState, { label: string; className: string }> = {
  waiting: { label: 'منتظر بازی قبل', className: 'bg-surface text-muted' },
  ready: { label: 'آمادهٔ بازی', className: 'bg-sky-50 text-sky-800' },
  live: { label: 'در حال بازی', className: 'bg-amber-100 text-amber-900' },
  done: { label: 'تمام شد', className: 'bg-emerald-50 text-emerald-800' },
  bye: { label: 'بدون بازی', className: 'bg-surface text-faint' },
};

/** Where and when a match is played, in a few words. */
export function matchWhen(m: EventMatch) {
  if (m.onStage) return 'روی صحنه';
  if (!m.time) return 'ساعت اعلام می‌شود';
  return `${toPersianDigits(m.time)}${m.place ? ` · ${m.place}` : ''}`;
}

/** The entries this colleague is in, by competition. */
export function myEntries(view: EventView, userId: string | undefined) {
  const mine = new Map<string, EventEntry>();
  if (!userId) return mine;
  for (const c of view.competitions) {
    const entry = c.entries.find((e) => e.members.includes(userId));
    if (entry) mine.set(c.id, entry);
  }
  return mine;
}

/** The next match of an entry not yet played, or null. */
export function nextMatchOf(c: EventCompetition, entryId: string) {
  return (
    c.matches
      .filter((m) => !m.winnerId && !m.bye && (m.entryA === entryId || m.entryB === entryId))
      .sort((a, b) => a.round - b.round)[0] ?? null
  );
}

/** Whether an entry lost a match (and so is out), counting the third-place match as not going on. */
export function knockedOut(c: EventCompetition, entryId: string) {
  return c.matches.some((m) => !m.third && m.winnerId && !m.bye && (m.entryA === entryId || m.entryB === entryId) && m.winnerId !== entryId);
}

/**
 * Calls the event's API and puts the page it answers on screen. Most actions answer with the whole
 * page; a few wrap it as `view`. Returns the raw answer, or undefined after showing the error.
 */
export function useEventAction() {
  const { setSpecialEvent, specialEvent } = usePortal();
  const canManage = specialEvent?.canManage ?? false;
  return useCallback(
    async <T,>(call: () => Promise<T>, success?: string, options: { quiet409?: boolean } = {}): Promise<T | undefined> => {
      try {
        const result = await call();
        const view = result && typeof result === 'object' ? (result as { event?: unknown; view?: { event?: unknown } }) : null;
        if (view && 'event' in view && view.event) setSpecialEvent({ ...(view as unknown as EventView), canManage });
        else if (view && 'view' in view && view.view?.event) setSpecialEvent({ ...(view.view as unknown as EventView), canManage });
        if (success) toast.success(success);
        return result;
      } catch (err) {
        if (options.quiet409 && err instanceof ApiError && err.status === 409) throw err;
        if (!(err instanceof ApiError && err.status === 401)) toast.error(errorMessage(err));
        return undefined;
      }
    },
    [setSpecialEvent, canManage],
  );
}

export { api };

/** Small round stepper buttons for scores (big enough for a thumb). */
export const Stepper: React.FC<{ value: number; onChange: (v: number) => void; label: string; big?: boolean }> = ({ value, onChange, label, big }) => (
  <div className="flex items-center gap-2" role="group" aria-label={label}>
    <button
      type="button"
      onClick={() => onChange(Math.max(0, value - 1))}
      className={`${big ? 'w-14 h-14 text-2xl' : 'w-10 h-10 text-xl'} rounded-2xl bg-surface hover:bg-surface-strong font-black text-ink`}
      aria-label={`${label}: یکی کم`}
    >
      −
    </button>
    <span className={`${big ? 'text-4xl w-14' : 'text-2xl w-10'} font-black text-center tabular-nums`} aria-live="polite">
      {toPersianDigits(value)}
    </span>
    <button
      type="button"
      onClick={() => onChange(Math.min(999, value + 1))}
      className={`${big ? 'w-14 h-14 text-2xl' : 'w-10 h-10 text-xl'} rounded-2xl bg-red-700 hover:bg-red-800 text-white font-black`}
      aria-label={`${label}: یکی بیشتر`}
    >
      +
    </button>
  </div>
);
