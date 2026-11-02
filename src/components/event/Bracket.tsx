import React from 'react';
import { Clock, Crown, MapPin, Mic2 } from 'lucide-react';
import { EntryPicture, MATCH_STATE_LABEL, entryName, matchState, matchWhen } from './eventUi';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventMatch, EventPerson } from './types';

interface MatchCardProps {
  competition: EventCompetition;
  match: EventMatch;
  people: Record<string, EventPerson>;
  /** Entries to highlight (the viewer's own). */
  mine?: Set<string>;
  /** Organizers and jurors open the result form by tapping a match. */
  onOpen?: (match: EventMatch) => void;
  fileUrl?: (url: string) => string;
  big?: boolean;
}

/** One match: both sides with their pictures and score, when and where, and its state. */
export const MatchCard: React.FC<MatchCardProps> = ({ competition, match, people, mine, onOpen, fileUrl, big }) => {
  const state = matchState(match);
  const stateInfo = MATCH_STATE_LABEL[state];
  const isMine = Boolean(mine && ((match.entryA && mine.has(match.entryA)) || (match.entryB && mine.has(match.entryB))));
  const canOpen = Boolean(onOpen && match.entryA && match.entryB && !match.bye);
  const side = (entryId: string | null, score: number | null, tie: number | null) => {
    const entry = competition.entries.find((e) => e.id === entryId);
    const won = match.winnerId && match.winnerId === entryId;
    const lost = match.winnerId && entryId && match.winnerId !== entryId;
    return (
      <div className={`flex items-center gap-2 min-w-0 ${lost ? 'opacity-55' : ''}`}>
        {entryId ? (
          <EntryPicture entry={entry} people={people} fileUrl={fileUrl} className={big ? 'w-12 h-12 rounded-2xl text-3xl' : 'w-7 h-7 rounded-lg text-base'} />
        ) : (
          <span className={`${big ? 'w-12 h-12' : 'w-7 h-7'} rounded-lg border border-dashed border-line-strong shrink-0`} aria-hidden />
        )}
        <span className={`flex-1 min-w-0 truncate ${big ? 'text-2xl' : 'text-xs'} ${won ? 'font-black text-ink' : 'font-bold text-ink-soft'}`}>
          {entryId ? entryName(entry, people) : match.bye ? '—' : 'برندهٔ بازی قبل'}
        </span>
        {won && <Crown className={`${big ? 'w-6 h-6' : 'w-3.5 h-3.5'} text-amber-500 shrink-0`} aria-label="برنده" />}
        {score !== null && !match.walkover && (
          <span className={`${big ? 'text-3xl' : 'text-sm'} font-black tabular-nums shrink-0`}>
            {toPersianDigits(score)}
            {tie !== null && <span className={`${big ? 'text-lg' : 'text-[10px]'} text-muted font-bold`}> ({toPersianDigits(tie)})</span>}
          </span>
        )}
      </div>
    );
  };

  const Tag = canOpen ? 'button' : 'div';
  return (
    <Tag
      {...(canOpen ? { type: 'button' as const, onClick: () => onOpen!(match), 'aria-label': `${match.roundName}: ثبت یا اصلاح نتیجه` } : {})}
      className={`w-full text-right rounded-2xl border bg-white p-2.5 space-y-1.5 ${isMine ? 'border-red-500 ring-2 ring-red-500/20' : 'border-line'} ${canOpen ? 'hover:border-red-400 hover:shadow-sm transition' : ''} ${match.bye ? 'opacity-60' : ''}`}
    >
      <div className={`flex items-center justify-between gap-2 ${big ? 'text-base' : 'text-[10px]'} text-muted`}>
        <span className="flex items-center gap-1 min-w-0 truncate">
          {match.onStage ? <Mic2 className="w-3 h-3 text-red-700 shrink-0" aria-hidden /> : match.time ? <Clock className="w-3 h-3 shrink-0" aria-hidden /> : null}
          {match.bye ? 'بدون بازی به دور بعد' : matchWhen(match)}
        </span>
        {!match.bye && <span className={`px-1.5 py-0.5 rounded-md font-bold shrink-0 ${stateInfo.className}`}>{match.walkover ? 'برد فنی' : stateInfo.label}</span>}
      </div>
      {side(match.entryA, match.scoreA, match.tieA)}
      {side(match.entryB, match.scoreB, match.tieB)}
    </Tag>
  );
};

/** The knockout bracket: one column per round (stacked on a phone), the final at the end. */
export const Bracket: React.FC<Omit<MatchCardProps, 'match'>> = ({ competition, people, mine, onOpen, fileUrl }) => {
  const rounds = competition.rounds;
  if (competition.matches.length === 0) return null;
  const columns = Array.from({ length: rounds }, (_, i) => i + 1).map((round) => ({
    round,
    matches: competition.matches.filter((m) => m.round === round && !m.third).sort((a, b) => a.slot - b.slot),
  }));
  const third = competition.matches.find((m) => m.third);
  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
      <div className="flex flex-col sm:flex-row gap-3 sm:min-w-max">
        {columns.map(({ round, matches }) => (
          <section key={round} className="sm:w-56 flex flex-col">
            <h4 className="text-xs font-black text-ink-soft mb-2">{matches[0]?.roundName}</h4>
            <div className="flex-1 flex flex-col justify-around gap-2">
              {matches.map((m) => (
                <MatchCard key={m.id} competition={competition} match={m} people={people} mine={mine} onOpen={onOpen} fileUrl={fileUrl} />
              ))}
              {round === rounds && third && (
                <div className="pt-2">
                  <h4 className="text-xs font-black text-ink-soft mb-2">{third.roundName}</h4>
                  <MatchCard competition={competition} match={third} people={people} mine={mine} onOpen={onOpen} fileUrl={fileUrl} />
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

/** Where a match is, in one line (for lists). */
export const MatchWhere: React.FC<{ match: EventMatch }> = ({ match }) => (
  <span className="inline-flex items-center gap-1 text-xs text-muted">
    {match.onStage ? <Mic2 className="w-3.5 h-3.5" aria-hidden /> : <MapPin className="w-3.5 h-3.5" aria-hidden />}
    {matchWhen(match)}
  </span>
);
