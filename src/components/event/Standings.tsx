import React, { useState } from 'react';
import { ChevronDown, Crown } from 'lucide-react';
import { Bracket, MatchCard } from './Bracket';
import { EntryPicture, entryName, performanceLine } from './eventUi';
import { leagueTable, rankingTable } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventMatch, EventPerson } from './types';

interface BoardProps {
  competition: EventCompetition;
  people: Record<string, EventPerson>;
  /** Entries to highlight (the viewer's own). */
  mine?: Set<string>;
  onOpen?: (match: EventMatch) => void;
  fileUrl?: (url: string) => string;
  /** On the big screen: bigger type, no list of matches. */
  big?: boolean;
}

const fa = (n: number) => toPersianDigits(n);

/** «جدول امتیازی»: rank, games, wins, draws, losses, goals and points, the viewer's own row marked. */
export const LeagueTable: React.FC<BoardProps> = ({ competition, people, mine, fileUrl, big }) => {
  const entryIds = [...new Set(competition.matches.flatMap((m) => [m.entryA, m.entryB]).filter((id): id is string => Boolean(id)))];
  const rows = leagueTable(entryIds, competition.matches);
  const scored = competition.scoring !== 'winner';
  const unit = competition.scoring === 'goals' ? 'گل' : 'امتیاز';
  const cell = big ? 'px-[1vw] py-[0.6vw]' : 'px-1.5 py-2';
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className={`w-full ${big ? 'text-[1.8vw]' : 'text-xs'} text-center tabular-nums`}>
        <caption className="sr-only">جدول امتیازی {competition.title}</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className={`${cell} font-bold`}>
              رتبه
            </th>
            <th scope="col" className={`${cell} font-bold text-right`}>
              {competition.kind === 'team' ? 'تیم' : 'نام'}
            </th>
            <th scope="col" className={`${cell} font-bold`} title="بازی">
              بازی
            </th>
            <th scope="col" className={`${cell} font-bold`} title="برد">
              برد
            </th>
            {scored && (
              <th scope="col" className={`${cell} font-bold`} title="مساوی">
                مساوی
              </th>
            )}
            <th scope="col" className={`${cell} font-bold`} title="باخت">
              باخت
            </th>
            {scored && (
              <th scope="col" className={`${cell} font-bold`} title={`${unit} زده و خورده`}>
                {unit}
              </th>
            )}
            <th scope="col" className={`${cell} font-black text-ink`}>
              امتیاز
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const entry = competition.entries.find((e) => e.id === r.entryId);
            const own = mine?.has(r.entryId);
            const first = r.entryId === competition.champion;
            return (
              <tr key={r.entryId} className={`border-t border-line ${own ? 'bg-red-50' : ''}`}>
                <td className={`${cell} font-black`}>{fa(r.rank)}</td>
                <th scope="row" className={`${cell} text-right font-bold text-ink`}>
                  <span className="flex items-center gap-2 min-w-0">
                    <EntryPicture entry={entry} people={people} fileUrl={fileUrl} className={big ? 'w-[3vw] h-[3vw] rounded-[0.6vw] text-[2vw]' : 'w-6 h-6 rounded-lg text-sm'} />
                    <span className="truncate">{entryName(entry, people)}</span>
                    {first && <Crown className={`${big ? 'w-[2vw] h-[2vw]' : 'w-3.5 h-3.5'} text-amber-500 shrink-0`} aria-label="قهرمان" />}
                  </span>
                </th>
                <td className={cell}>{fa(r.played)}</td>
                <td className={cell}>{fa(r.won)}</td>
                {scored && <td className={cell}>{fa(r.drawn)}</td>}
                <td className={cell}>{fa(r.lost)}</td>
                {scored && (
                  <td className={cell} dir="ltr">
                    {fa(r.scored)}:{fa(r.conceded)}
                  </td>
                )}
                <td className={`${cell} font-black text-ink`}>{fa(r.points)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!big && <p className="text-[11px] text-faint mt-1.5">برد ۳ امتیاز و مساوی ۱ امتیاز. برابرها با تفاضل {scored ? `${unit}، ${unit} زده و بعد ` : ''}بازی رودررو جدا می‌شوند.</p>}
    </div>
  );
};

/** «رتبه‌بندی»: the best first; those yet to perform, in their order, at the end. */
export const RankingTable: React.FC<BoardProps> = ({ competition, people, mine, onOpen, fileUrl, big }) => {
  const byEntry = new Map(competition.matches.map((m) => [m.entryA, m]));
  const rows = rankingTable(
    competition.matches.filter((m) => m.entryA).map((m) => ({ entryId: m.entryA!, value: m.scoreA, done: m.done })),
    competition.rankBy,
  );
  const pending = rows.filter((r) => !byEntry.get(r.entryId)?.done).sort((a, b) => (byEntry.get(a.entryId)?.slot ?? 0) - (byEntry.get(b.entryId)?.slot ?? 0));
  const ordered = [...rows.filter((r) => byEntry.get(r.entryId)?.done), ...pending];
  return (
    <ol className={big ? 'space-y-[0.8vw]' : 'space-y-1.5'} aria-label={`رتبه‌بندی ${competition.title}`}>
      {ordered.map((r) => {
        const match = byEntry.get(r.entryId)!;
        const entry = competition.entries.find((e) => e.id === r.entryId);
        const own = mine?.has(r.entryId);
        const first = r.entryId === competition.champion;
        const Tag = onOpen ? 'button' : 'div';
        return (
          <li key={r.entryId}>
            <Tag
              {...(onOpen ? { type: 'button' as const, onClick: () => onOpen(match), 'aria-label': `${entryName(entry, people)}: ثبت یا اصلاح نتیجه` } : {})}
              className={`w-full text-right flex items-center gap-2 rounded-2xl border bg-white ${big ? 'px-[1.4vw] py-[0.8vw] text-[2vw]' : 'px-2.5 py-2 text-xs'} ${own ? 'border-red-500 ring-2 ring-red-500/20' : 'border-line'} ${onOpen ? 'hover:border-red-400' : ''}`}
            >
              <span className={`${big ? 'w-[3vw]' : 'w-6'} shrink-0 text-center font-black tabular-nums`}>{r.rank ? fa(r.rank) : '–'}</span>
              <EntryPicture entry={entry} people={people} fileUrl={fileUrl} className={big ? 'w-[3.4vw] h-[3.4vw] rounded-[0.8vw] text-[2.2vw]' : 'w-7 h-7 rounded-lg text-base'} />
              <span className="flex-1 min-w-0 truncate font-bold">{entryName(entry, people)}</span>
              {first && <Crown className={`${big ? 'w-[2.2vw] h-[2.2vw]' : 'w-4 h-4'} text-amber-500 shrink-0`} aria-label="قهرمان" />}
              <span className={`shrink-0 font-black tabular-nums ${match.done ? '' : 'text-muted font-bold'}`}>
                {match.done ? performanceLine(competition, match) : match.live && match.scoreA !== null ? `${fa(match.scoreA)} …` : match.onStage ? `${match.roundName} · روی صحنه` : `${match.roundName}${match.time ? ` · ${toPersianDigits(match.time)}` : ''}`}
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
};

/** The matches of a points table round by round, folded away under the table on a phone. */
const LeagueMatches: React.FC<BoardProps> = (props) => {
  const { competition, mine } = props;
  const mineLeft = competition.matches.filter((m) => !m.done && mine && ((m.entryA && mine.has(m.entryA)) || (m.entryB && mine.has(m.entryB))));
  const [open, setOpen] = useState(false);
  const done = competition.matches.filter((m) => m.done).length;
  return (
    <div className="space-y-2">
      {mineLeft.length > 0 && !open && (
        <div className="grid sm:grid-cols-2 gap-2">
          {mineLeft.slice(0, 2).map((m) => (
            <MatchCard key={m.id} {...props} match={m} />
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center justify-between text-xs font-bold text-ink-soft hover:bg-surface rounded-xl px-2 py-2">
        <span>
          همهٔ بازی‌ها ({fa(done)} از {fa(competition.matches.length)} انجام شده)
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <Bracket {...props} />}
    </div>
  );
};

/** The board of a competition by its format: the knockout bracket, the points table, or the ranking. */
export const CompetitionBoard: React.FC<BoardProps> = (props) => {
  const { competition, big } = props;
  if (competition.matches.length === 0) return null;
  if (competition.format === 'ranking') return <RankingTable {...props} />;
  if (competition.format === 'league') {
    return (
      <div className="space-y-3">
        <LeagueTable {...props} />
        {!big && <LeagueMatches {...props} />}
      </div>
    );
  }
  return <Bracket {...props} />;
};
