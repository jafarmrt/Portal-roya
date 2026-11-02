import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Maximize, Trophy } from 'lucide-react';
import { Bracket } from './Bracket';
import { CompetitionBoard } from './Standings';
import { JuryStrip, countdownText } from './EventParts';
import { EntryPicture, PersonAvatar, YALDA, entryName, heroStyle, isReady, performanceLine, scoreLine, sidesLine } from './eventUi';
import { playChime, playTick } from '../../lib/sound';
import { HAFEZ_FAL, WHEEL_SPIN_MS, programStart, rankingTable, timerLeft, wheelPosition, type ScreenState } from '../../../shared/specialEvents';
import { Couplet, useScheduleNow } from './NightSection';
import { QuizOptions, useQuizLeft } from './QuizSection';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventView } from './types';

// The big screen in the hall (an Android touch TV). It has no account: it shows a 4-digit code until an
// organizer types it on their phone, then only follows what the remote picks. Everything is read here.

type ScreenAnswer = { paired: false; code: string; expiresAt: string } | ({ paired: true; screen: ScreenState } & EventView);

/** Pictures come through the screen's own address (it has no session for /uploads). */
const fileUrl = (url: string) => (url.startsWith('/uploads/') ? `/api/event_screen/file/${url.slice('/uploads/'.length)}` : url);

async function call<T>(method: 'GET' | 'POST', url: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { method, credentials: 'same-origin', headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? '{}' : undefined });
  const data = res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as T) : null;
  return { status: res.status, data };
}

/** Seconds left on the screen's timer, by the server's clock (the TV's clock may be off). */
function useTimer(screen: ScreenState | null, offset: number) {
  const [, tick] = useState(0);
  const running = Boolean(screen?.timer.endsAt);
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [running]);
  return screen ? timerLeft(screen.timer, Date.now() + offset) : 0;
}

const Big: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 px-[4vw] ${className}`}>{children}</div>
);

const Welcome: React.FC<{ view: EventView; offset: number }> = ({ view, offset }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((programStart(view.event).getTime() - (Date.now() + offset)) / 1000));
  return (
    <Big>
      <p className="text-[9vw] leading-none" aria-hidden>
        🍉🕯️🍎
      </p>
      <h1 className="text-[6vw] font-black leading-tight">{view.event.title}</h1>
      {view.event.intro && <p className="text-[2.2vw] opacity-85 max-w-[70vw] leading-relaxed">{view.event.intro}</p>}
      {left > 0 && (
        <p className="text-[2.6vw] font-bold" style={{ color: YALDA.gold }}>
          {countdownText(left)} تا شروع
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-6 text-[2vw] font-bold opacity-90">
        {view.competitions.map((c) => (
          <span key={c.id}>
            {c.icon} {c.title}
          </span>
        ))}
      </div>
    </Big>
  );
};

const StageMatch: React.FC<{ view: EventView; competition: EventCompetition | undefined; matchId: string | null }> = ({ view, competition, matchId }) => {
  const match = competition?.matches.find((m) => m.id === matchId);
  if (!competition || !match) return <Big><p className="text-[4vw] font-black">بازی بعدی به‌زودی…</p></Big>;
  if (competition.format === 'ranking') {
    // One performer: their picture, the score as it moves (or the time once entered), and the top three so far.
    const entry = competition.entries.find((e) => e.id === match.entryA);
    const counts = competition.rankBy === 'high';
    // The best so far, with shared places sharing a medal.
    const best = rankingTable(
      competition.matches.filter((m) => m.entryA).map((m) => ({ entryId: m.entryA!, value: m.scoreA, done: m.done })),
      competition.rankBy,
    ).filter((r) => r.rank !== null && r.rank <= 3);
    return (
      <Big>
        <p className="text-[2.4vw] font-bold" style={{ color: YALDA.gold }}>
          {competition.icon} {competition.title} · {match.roundName} از {toPersianDigits(competition.matches.length)}
          {match.live && !match.done && <span className="ms-4 inline-flex items-center gap-2 text-red-400"><span className="w-[1vw] h-[1vw] rounded-full bg-red-500 animate-pulse" />زنده</span>}
        </p>
        <EntryPicture entry={entry} people={view.people} fileUrl={fileUrl} className="w-[18vw] h-[18vw] rounded-[3vw] text-[11vw]" />
        <p className="text-[4vw] font-black leading-tight">{entryName(entry, view.people)}</p>
        {competition.kind === 'team' && entry && <p className="text-[1.8vw] opacity-75">{entry.members.map((id) => view.people[id]?.firstName).join('، ')}</p>}
        {match.done ? (
          <p className="text-[8vw] font-black leading-none tabular-nums">{performanceLine(competition, match)}</p>
        ) : (
          counts && <p className="text-[12vw] font-black leading-none tabular-nums">{toPersianDigits(match.scoreA ?? 0)}</p>
        )}
        {best.length > 0 && (
          <ol className="flex gap-[3vw] text-[1.8vw] opacity-90">
            {best.map((r) => (
              <li key={r.entryId}>
                {['🥇', '🥈', '🥉'][r.rank! - 1]} {entryName(competition.entries.find((e) => e.id === r.entryId), view.people)}:{' '}
                {performanceLine(competition, competition.matches.find((m) => m.entryA === r.entryId)!)}
              </li>
            ))}
          </ol>
        )}
      </Big>
    );
  }
  const side = (entryId: string | null, score: number | null) => {
    const entry = competition.entries.find((e) => e.id === entryId);
    const won = match.winnerId && match.winnerId === entryId;
    return (
      <div className={`flex-1 min-w-0 flex flex-col items-center gap-4 ${match.winnerId && !won ? 'opacity-50' : ''}`}>
        <EntryPicture entry={entry} people={view.people} fileUrl={fileUrl} className="w-[16vw] h-[16vw] rounded-[3vw] text-[10vw]" />
        <p className="text-[3.4vw] font-black leading-tight max-w-full break-words">
          {entryName(entry, view.people)} {won && <Crown className="inline w-[3vw] h-[3vw]" style={{ color: YALDA.gold }} aria-label="برنده" />}
        </p>
        {competition.kind === 'team' && entry && <p className="text-[1.6vw] opacity-75">{entry.members.map((id) => view.people[id]?.firstName).join('، ')}</p>}
        {competition.scoring !== 'winner' && <p className="text-[12vw] font-black leading-none tabular-nums">{toPersianDigits(score ?? 0)}</p>}
      </div>
    );
  };
  return (
    <Big>
      <p className="text-[2.4vw] font-bold" style={{ color: YALDA.gold }}>
        {competition.icon} {competition.title} · {match.roundName}
        {match.live && !match.winnerId && <span className="ms-4 inline-flex items-center gap-2 text-red-400"><span className="w-[1vw] h-[1vw] rounded-full bg-red-500 animate-pulse" />زنده</span>}
      </p>
      <div className="w-full flex items-start gap-[3vw]">
        {side(match.entryA, match.scoreA)}
        <span className="self-center text-[6vw] font-black opacity-40">–</span>
        {side(match.entryB, match.scoreB)}
      </div>
      {match.tieA !== null && match.tieB !== null && <p className="text-[2.4vw] font-bold">پنالتی: {scoreLine(match)}</p>}
      <PredictionLine view={view} competition={competition} matchId={match.id} />
    </Big>
  );
};

/** «پیش‌بینی همکاران»: how the hall picked this match, once picking closed. */
const PredictionLine: React.FC<{ view: EventView; competition: EventCompetition; matchId: string }> = ({ view, competition, matchId }) => {
  const counts = view.predictions.matches[matchId]?.counts;
  if (!counts || counts.total === 0) return null;
  const match = competition.matches.find((m) => m.id === matchId)!;
  const pct = (n: number) => toPersianDigits(Math.round((n * 100) / counts.total));
  const name = (id: string | null) => entryName(competition.entries.find((e) => e.id === id), view.people);
  return (
    <p className="text-[1.8vw] opacity-85">
      🔮 پیش‌بینی {toPersianDigits(counts.total)} همکار: {name(match.entryA)} {pct(counts.a)}٪
      {competition.format === 'league' && counts.draw > 0 && <> · مساوی {pct(counts.draw)}٪</>} · {name(match.entryB)} {pct(counts.b)}٪
    </p>
  );
};

/** «برنامهٔ امشب»: the evening's items, the one on now lit up. */
const ScheduleScene: React.FC<{ view: EventView; offset: number }> = ({ view, offset }) => {
  const { ordered, current, next } = useScheduleNow(view, offset);
  return (
    <Big className="justify-start pt-[3vw]">
      <h2 className="text-[4vw] font-black">برنامهٔ امشب</h2>
      <ol className="w-full max-w-[70vw] space-y-[0.7vw] text-right">
        {ordered.map((item) => {
          const now = current?.id === item.id;
          const past = Boolean(current && item.time < current.time);
          return (
            <li
              key={item.id}
              className={`rounded-[1.4vw] px-[1.8vw] py-[0.8vw] flex items-center gap-[2vw] text-[2.3vw] ${now ? 'bg-white/20 ring-[0.3vw] ring-amber-300' : 'bg-white/5'} ${past ? 'opacity-45' : ''}`}
            >
              <span className="w-[8vw] shrink-0 font-black tabular-nums" style={{ color: YALDA.gold }}>
                {toPersianDigits(item.time)}
              </span>
              <span className={`flex-1 min-w-0 truncate ${now ? 'font-black' : 'font-bold'}`}>{item.title}</span>
              {now && <span className="text-[1.6vw] font-black px-[1vw] py-[0.2vw] rounded-full bg-amber-300 text-amber-950">الان</span>}
              {next?.id === item.id && <span className="text-[1.6vw] font-bold opacity-80">بعدی</span>}
            </li>
          );
        })}
      </ol>
    </Big>
  );
};

/** «پاکت انتخاب‌ها»: the sealed envelope with the shortlist, then the winner once it is opened. */
const EnvelopeScene: React.FC<{ view: EventView; awardId: string | null | undefined }> = ({ view, awardId }) => {
  const award = view.awards.find((a) => a.id === awardId);
  if (!award) return <Big><p className="text-[4vw] font-black">پاکت بعدی به‌زودی…</p></Big>;
  const winner = award.stage === 'revealed' && award.winnerId ? view.people[award.winnerId] : null;
  const photo = (p: EventView['people'][string] | undefined) => (p?.avatarUrl ? fileUrl(p.avatarUrl) : undefined);
  return (
    <Big>
      <p className="text-[2.6vw] font-bold" style={{ color: YALDA.gold }}>
        {award.icon} {award.title}
      </p>
      {award.stage === 'revealed' ? (
        winner ? (
          <div key="open" className="flex flex-col items-center gap-[1.5vw] animate-[envelope-open_900ms_ease-out]">
            <p className="text-[5vw] leading-none" aria-hidden>
              ✉️🎉✨
            </p>
            <PersonAvatar person={winner} src={photo(winner)} className="w-[22vw] h-[22vw] rounded-full text-[8vw] object-cover ring-[0.6vw] ring-amber-300" />
            <p className="text-[5.5vw] font-black leading-tight">{winner.name}</p>
            {winner.position && <p className="text-[2vw] opacity-75">{winner.position}</p>}
          </div>
        ) : (
          <p className="text-[4vw] font-black">این بخش امسال برنده‌ای نداشت.</p>
        )
      ) : (
        <>
          <p className="text-[16vw] leading-none animate-pulse" aria-hidden>
            ✉️
          </p>
          <p className="text-[2.6vw] font-bold">و برنده کیست…؟</p>
          {award.nominees.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-[3vw]">
              {award.nominees.map((n) => (
                <li key={n.id} className="flex flex-col items-center gap-[0.6vw]">
                  <PersonAvatar person={view.people[n.id]} src={photo(view.people[n.id])} className="w-[9vw] h-[9vw] rounded-full text-[3.4vw] object-cover" />
                  <span className="text-[1.9vw] font-bold">{view.people[n.id]?.name ?? 'همکار'}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Big>
  );
};

/** «فال حافظ» for the whole hall. */
const FalScene: React.FC<{ index: number | null | undefined }> = ({ index }) => (
  <Big>
    <h2 className="text-[3vw] font-black" style={{ color: YALDA.gold }}>
      فال حافظ
    </h2>
    {index !== null && index !== undefined && HAFEZ_FAL[index] ? (
      <div key={index} className="space-y-[2vw] animate-[envelope-open_700ms_ease-out]">
        <Couplet index={index} className="text-[4.2vw] leading-[1.9]" />
        <p className="text-[2.1vw] opacity-80 max-w-[70vw] mx-auto leading-relaxed">{HAFEZ_FAL[index].reading}</p>
      </div>
    ) : (
      <p className="text-[3vw]">نیت کنید…</p>
    )}
  </Big>
);

/** «مسابقهٔ همه»: the question with its colored options and clock; then the right one and how the hall answered. */
const QuizScene: React.FC<{ view: EventView; offset: number }> = ({ view, offset }) => {
  const current = view.quiz.current;
  const left = useQuizLeft(current, offset);
  if (!current) return <Big><p className="text-[4vw] font-black">مسابقهٔ همه: گوشی‌ها آماده! 📱</p></Big>;
  return (
    <Big className="justify-start pt-[2.5vw] gap-[2vw]">
      <div className="w-full flex items-center gap-[2vw]">
        <p className="text-[2vw] font-bold" style={{ color: YALDA.gold }}>
          سؤال {toPersianDigits(current.index)} از {toPersianDigits(view.quiz.count)}
        </p>
        <p className="ms-auto text-[2vw] opacity-85">{toPersianDigits(current.answered)} جواب</p>
        {!current.revealed && (
          <p className={`text-[6vw] font-black leading-none tabular-nums ${left <= 5 ? 'text-red-400' : ''}`}>{toPersianDigits(left)}</p>
        )}
      </div>
      <h2 className="text-[3.8vw] font-black leading-tight">{current.text}</h2>
      <div className="w-full">
        <QuizOptions current={{ ...current, myChoice: null }} big />
      </div>
    </Big>
  );
};

/** «جدول مسابقهٔ همه». */
const QuizBoard: React.FC<{ view: EventView }> = ({ view }) => {
  const leaders = view.quiz.leaders.slice(0, 8);
  return (
    <Big className="justify-start pt-[3vw]">
      <h2 className="text-[4vw] font-black">🏅 جدول مسابقهٔ همه</h2>
      <ol className="w-full max-w-[70vw] space-y-[0.8vw] text-right">
        {leaders.map((l) => {
          const person = view.people[l.employeeId];
          return (
            <li key={l.employeeId} className="bg-white/10 rounded-[1.4vw] px-[1.6vw] py-[0.8vw] flex items-center gap-[1.4vw] text-[2.2vw]">
              <span className="w-[4vw] text-center font-black tabular-nums" style={{ color: YALDA.gold }}>
                {l.rank <= 3 ? ['🥇', '🥈', '🥉'][l.rank - 1] : toPersianDigits(l.rank)}
              </span>
              <PersonAvatar person={person} src={person?.avatarUrl ? fileUrl(person.avatarUrl) : undefined} className="w-[4vw] h-[4vw] rounded-full text-[1.6vw] object-cover" />
              <span className="flex-1 min-w-0 truncate font-black">{person?.name ?? 'همکار'}</span>
              <span className="font-bold tabular-nums">{toPersianDigits(l.points)}</span>
            </li>
          );
        })}
      </ol>
    </Big>
  );
};

/** «بهترین پیش‌بین‌ها»: who guessed the most winners. */
const Predictors: React.FC<{ view: EventView }> = ({ view }) => {
  const leaders = view.predictions.leaders.slice(0, 8);
  return (
    <Big className="justify-start pt-[3vw]">
      <h2 className="text-[4vw] font-black">🔮 بهترین پیش‌بین‌ها</h2>
      {leaders.length === 0 ? (
        <p className="text-[2.4vw] opacity-80">هنوز بازی‌ای که پیش‌بینی شده باشد تمام نشده.</p>
      ) : (
        <ol className="w-full max-w-[70vw] space-y-[0.8vw] text-right">
          {leaders.map((l) => {
            const person = view.people[l.employeeId];
            return (
              <li key={l.employeeId} className="bg-white/10 rounded-[1.4vw] px-[1.6vw] py-[0.8vw] flex items-center gap-[1.4vw] text-[2.2vw]">
                <span className="w-[4vw] text-center font-black tabular-nums" style={{ color: YALDA.gold }}>
                  {l.rank <= 3 ? ['🥇', '🥈', '🥉'][l.rank - 1] : toPersianDigits(l.rank)}
                </span>
                <PersonAvatar person={person} src={person?.avatarUrl ? fileUrl(person.avatarUrl) : undefined} className="w-[4vw] h-[4vw] rounded-full text-[1.6vw] object-cover" />
                <span className="flex-1 min-w-0 truncate font-black">{person?.name ?? 'همکار'}</span>
                <span className="font-bold tabular-nums">
                  {toPersianDigits(l.correct)} از {toPersianDigits(l.total)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Big>
  );
};

/** «چند دانه؟»: the question and how many guessed; then the answer and the three closest. */
const GuessScene: React.FC<{ view: EventView }> = ({ view }) => {
  const { guess } = view;
  if (!guess) return <Big><p className="text-[4vw] font-black">بازی «چند دانه؟» امسال نیست.</p></Big>;
  return (
    <Big>
      <h2 className="text-[4.4vw] font-black leading-tight">{guess.question}</h2>
      {guess.revealed ? (
        <>
          <p className="text-[14vw] font-black leading-none tabular-nums" style={{ color: YALDA.gold }}>
            {toPersianDigits(guess.answer ?? 0)}
          </p>
          <ol className="flex flex-wrap justify-center gap-[4vw]">
            {guess.winners.map((w, i) => {
              const person = view.people[w.employeeId];
              return (
                <li key={w.employeeId} className={`flex flex-col items-center gap-2 ${i === 0 ? '' : 'opacity-85'}`}>
                  <span className="text-[4vw] leading-none" aria-hidden>
                    {['🥇', '🥈', '🥉'][i]}
                  </span>
                  <PersonAvatar person={person} src={person?.avatarUrl ? fileUrl(person.avatarUrl) : undefined} className={`${i === 0 ? 'w-[12vw] h-[12vw] text-[5vw]' : 'w-[8vw] h-[8vw] text-[3vw]'} rounded-full object-cover`} />
                  <p className={`${i === 0 ? 'text-[3vw]' : 'text-[2vw]'} font-black`}>{person?.name ?? 'همکار'}</p>
                  <p className="text-[1.8vw] opacity-80 tabular-nums">
                    حدس {toPersianDigits(w.value)}
                    {w.diff === 0 ? ' · دقیق!' : ''}
                  </p>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <>
          <p className="text-[12vw] leading-none" aria-hidden>
            ❓
          </p>
          <p className="text-[3vw] font-bold">{toPersianDigits(guess.count)} نفر حدس زده‌اند</p>
        </>
      )}
    </Big>
  );
};

/** «آرزوهای یلدا»: the approved wishes, six at a time, turning page every few seconds. */
const WISHES_PAGE = 6;
const WishesScene: React.FC<{ view: EventView }> = ({ view }) => {
  const wall = view.wishes.wall;
  const pages = Math.max(1, Math.ceil(wall.length / WISHES_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return undefined;
    const t = window.setInterval(() => setPage((p) => (p + 1) % pages), 9000);
    return () => window.clearInterval(t);
  }, [pages]);
  // Newest first, so a wish approved a moment ago is on the first page.
  const shown = [...wall].reverse().slice((page % pages) * WISHES_PAGE, (page % pages) * WISHES_PAGE + WISHES_PAGE);
  return (
    <Big className="justify-start pt-[3vw]">
      <h2 className="text-[4vw] font-black">🕯️ آرزوهای یلدا</h2>
      {wall.length === 0 ? (
        <p className="text-[2.6vw] opacity-85">آرزویتان را در پرتال، صفحهٔ رویداد بنویسید تا اینجا بیاید.</p>
      ) : (
        <ul key={page} className="w-full grid grid-cols-2 gap-[1.6vw] text-right">
          {shown.map((w) => (
            <li key={w.id} className="rounded-[1.6vw] px-[2vw] py-[1.4vw] space-y-[0.6vw]" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="text-[2.2vw] font-bold leading-relaxed">«{w.text}»</p>
              <p className="text-[1.6vw] font-black" style={{ color: YALDA.gold }}>
                {w.byId ? (view.people[w.byId]?.name ?? 'همکار') : 'بی‌نام'}
              </p>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <p className="text-[1.4vw] opacity-60 tabular-nums">
          {toPersianDigits((page % pages) + 1)} از {toPersianDigits(pages)}
        </p>
      )}
    </Big>
  );
};

/** «گردونهٔ شانس»: names run fast and slow down to stop on the winner; then the winner, big. */
const WheelScene: React.FC<{ view: EventView; offset: number; started: boolean }> = ({ view, offset, started }) => {
  const spin = view.wheel.spins.at(-1);
  const at = spin ? new Date(spin.at).getTime() : 0;
  const elapsed = Date.now() + offset - at;
  const spinning = Boolean(spin) && elapsed < WHEEL_SPIN_MS;
  const [, tick] = useState(0);
  const lastName = useRef(-1);
  useEffect(() => {
    if (!spinning) return undefined;
    const t = window.setInterval(() => tick((n) => n + 1), 50);
    return () => window.clearInterval(t);
  }, [spinning, spin?.id]);
  const position = spin ? wheelPosition(elapsed, spin.reel.length) : 0;
  // A soft click as each name passes, and the chime when it stops.
  useEffect(() => {
    if (!spin || !started) return;
    if (lastName.current !== position && spinning) playTick();
    if (lastName.current !== -1 && lastName.current < spin.reel.length - 1 && position === spin.reel.length - 1) playChime();
    lastName.current = position;
  }, [position, spin, spinning, started]);

  if (!spin) {
    return (
      <Big>
        <p className="text-[12vw] leading-none animate-[spin_6s_linear_infinite]" aria-hidden>
          🎡
        </p>
        <h2 className="text-[5vw] font-black">گردونهٔ شانس</h2>
        <p className="text-[2.4vw] opacity-85">{toPersianDigits(view.wheel.left)} نفر در گردونه‌اند؛ هر کس در صفحهٔ رویداد کاری کرده.</p>
      </Big>
    );
  }
  if (spinning) {
    const person = view.people[spin.reel[position]];
    return (
      <Big>
        <p className="text-[2.6vw] font-bold opacity-85">🎡 گردونه می‌چرخد…{spin.prize ? ` (${spin.prize})` : ''}</p>
        <p className="text-[8vw] font-black leading-tight" style={{ color: YALDA.gold }}>
          {person?.name ?? 'همکار'}
        </p>
      </Big>
    );
  }
  const winner = view.people[spin.winnerId];
  return (
    <Big>
      <p className="text-[6vw] leading-none" aria-hidden>
        🎉🎡🎉
      </p>
      <PersonAvatar person={winner} src={winner?.avatarUrl ? fileUrl(winner.avatarUrl) : undefined} className="w-[18vw] h-[18vw] rounded-full text-[7vw] object-cover ring-[0.6vw] ring-amber-300" />
      <p className="text-[6vw] font-black leading-tight">{winner?.name ?? 'همکار'}</p>
      {spin.prize && (
        <p className="text-[3vw] font-bold" style={{ color: YALDA.gold }}>
          🎁 {spin.prize}
        </p>
      )}
      {spin.absent && <p className="text-[2vw] opacity-75">در سالن نبود؛ گردونه دوباره می‌چرخد.</p>}
    </Big>
  );
};

/** «این بچه کیه؟»: the childhood photo and how many guessed; then today's face and name beside it. */
const KidScene: React.FC<{ view: EventView }> = ({ view }) => {
  const current = view.kid.current;
  if (!current) {
    const leaders = view.kid.leaders.filter((l) => l.rank <= 3);
    return (
      <Big>
        <p className="text-[10vw] leading-none" aria-hidden>
          👶❓
        </p>
        <h2 className="text-[5vw] font-black">این بچه کیه؟</h2>
        {leaders.length > 0 && (
          <p className="text-[2.4vw] font-bold" style={{ color: YALDA.gold }}>
            بهترین حدس‌ها: {leaders.map((l) => `${view.people[l.employeeId]?.name ?? 'همکار'} (${toPersianDigits(l.correct)})`).join('، ')}
          </p>
        )}
      </Big>
    );
  }
  const owner = current.revealed && current.ownerId ? view.people[current.ownerId] : undefined;
  return (
    <Big>
      <h2 className="text-[4vw] font-black">{current.revealed ? `${owner?.name ?? 'همکار'} 🎉` : 'این بچه کیه؟'}</h2>
      <div className="flex items-center justify-center gap-[4vw]">
        <img src={fileUrl(current.url)} alt="" className="h-[55vh] max-w-[45vw] rounded-[2vw] object-contain shadow-2xl" />
        {owner && (
          <PersonAvatar person={owner} src={owner.avatarUrl ? fileUrl(owner.avatarUrl) : undefined} className="w-[22vw] h-[22vw] rounded-full text-[8vw] object-cover ring-[0.6vw] ring-amber-300 animate-[pop_0.6s_ease-out]" />
        )}
      </div>
      <p className="text-[2.6vw] font-bold" style={{ color: YALDA.gold }}>
        {current.revealed
          ? `${toPersianDigits(current.right ?? 0)} نفر از ${toPersianDigits(current.guessed)} نفر درست گفتند`
          : `${toPersianDigits(current.guessed)} نفر حدس زده‌اند؛ روی گوشی انتخاب کنید`}
      </p>
    </Big>
  );
};

const Today: React.FC<{ view: EventView }> = ({ view }) => {
  const rows = view.competitions
    .flatMap((c) => c.matches.filter((m) => isReady(c, m) && (m.onStage || m.day === view.event.programDate)).map((m) => ({ c, m })))
    .sort((a, b) => Number(a.m.onStage) - Number(b.m.onStage) || (a.m.time || '99').localeCompare(b.m.time || '99'))
    .slice(0, 12);
  return (
    <Big className="justify-start pt-[3vw]">
      <h2 className="text-[4vw] font-black">بازی‌های امروز</h2>
      {rows.length === 0 ? (
        <p className="text-[2.4vw] opacity-80">امروز بازی‌ای در جدول نیست.</p>
      ) : (
        <ul className="w-full grid grid-cols-2 gap-[1.2vw] text-right">
          {rows.map(({ c, m }) => (
            <li key={m.id} className="bg-white/10 rounded-[1.4vw] px-[1.6vw] py-[1vw] flex items-center gap-[1.2vw] text-[1.8vw]">
              <span className="w-[9vw] shrink-0 font-black tabular-nums" style={{ color: YALDA.gold }}>
                {m.onStage ? 'صحنه' : toPersianDigits(m.time || '—')}
              </span>
              <span className="shrink-0">{c.icon}</span>
              <span className="flex-1 min-w-0 truncate font-bold">{sidesLine(c, m, view.people)}</span>
              <span className="shrink-0 font-black tabular-nums">{m.done ? scoreLine(m, c) || '✓' : m.live ? 'زنده' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Big>
  );
};

const Champion: React.FC<{ view: EventView; competition: EventCompetition | undefined }> = ({ view, competition }) => {
  const list = (competition ? [competition] : view.competitions).filter((c) => c.champion);
  if (list.length === 0) return <Big><Trophy className="w-[10vw] h-[10vw]" style={{ color: YALDA.gold }} /><p className="text-[4vw] font-black">قهرمان به‌زودی معلوم می‌شود…</p></Big>;
  return (
    <Big>
      <p className="text-[6vw] leading-none" aria-hidden>
        🏆✨🎉
      </p>
      <div className="flex flex-wrap justify-center gap-[5vw]">
        {list.map((c) => {
          const entry = c.entries.find((e) => e.id === c.champion);
          return (
            <div key={c.id} className="flex flex-col items-center gap-3">
              <p className="text-[2.4vw] font-bold" style={{ color: YALDA.gold }}>
                قهرمان {c.title}
              </p>
              <EntryPicture entry={entry} people={view.people} fileUrl={fileUrl} className={`${list.length > 1 ? 'w-[12vw] h-[12vw] text-[8vw]' : 'w-[22vw] h-[22vw] text-[14vw]'} rounded-[3vw]`} />
              <p className={`${list.length > 1 ? 'text-[3vw]' : 'text-[5vw]'} font-black`}>{entryName(entry, view.people)}</p>
              {c.kind === 'team' && entry && <p className="text-[1.8vw] opacity-80">{entry.members.map((id) => view.people[id]?.name).join('، ')}</p>}
            </div>
          );
        })}
      </div>
    </Big>
  );
};

const Scene: React.FC<{ view: EventView; screen: ScreenState; offset: number; timer: number; started: boolean }> = ({ view, screen, offset, timer, started }) => {
  const competition = view.competitions.find((c) => c.id === screen.competitionId) ?? view.competitions[0];
  switch (screen.scene) {
    case 'jury':
      return (
        <Big>
          <h2 className="text-[4vw] font-black">هیئت داوران</h2>
          <JuryStrip view={view} fileUrl={fileUrl} big />
        </Big>
      );
    case 'bracket':
      return competition && competition.matches.length > 0 ? (
        <Big className="justify-start pt-[2vw]">
          <h2 className="text-[3.4vw] font-black">
            {competition.icon} {competition.title}
          </h2>
          {competition.format === 'knockout' ? (
            <div className="text-ink bg-page rounded-[2vw] p-[1.4vw] max-w-full" style={{ zoom: 1.5 }}>
              <Bracket competition={competition} people={view.people} fileUrl={fileUrl} />
            </div>
          ) : (
            <div className="text-ink bg-page rounded-[2vw] p-[1.4vw] w-full max-w-[80vw] max-h-[75vh] overflow-hidden">
              <CompetitionBoard competition={competition} people={view.people} fileUrl={fileUrl} big />
            </div>
          )}
        </Big>
      ) : (
        <Big><p className="text-[4vw] font-black">جدول به‌زودی منتشر می‌شود</p></Big>
      );
    case 'match':
      return <StageMatch view={view} competition={competition} matchId={screen.matchId} />;
    case 'today':
      return <Today view={view} />;
    case 'schedule':
      return <ScheduleScene view={view} offset={offset} />;
    case 'envelope':
      return <EnvelopeScene view={view} awardId={screen.awardId} />;
    case 'fal':
      return <FalScene index={screen.falIndex} />;
    case 'quiz':
      return <QuizScene view={view} offset={offset} />;
    case 'quizboard':
      return <QuizBoard view={view} />;
    case 'predictors':
      return <Predictors view={view} />;
    case 'guess':
      return <GuessScene view={view} />;
    case 'wishes':
      return <WishesScene view={view} />;
    case 'wheel':
      return <WheelScene view={view} offset={offset} started={started} />;
    case 'kid':
      return <KidScene view={view} />;
    case 'champion':
      return <Champion view={view} competition={screen.competitionId ? competition : undefined} />;
    case 'break':
      return (
        <Big>
          <p className="text-[9vw] leading-none" aria-hidden>
            ☕🍉
          </p>
          <h2 className="text-[6vw] font-black">استراحت</h2>
          {timer > 0 && <p className="text-[10vw] font-black tabular-nums leading-none">{countdownText(timer)}</p>}
        </Big>
      );
    default:
      return <Welcome view={view} offset={offset} />;
  }
};

/** The whole screen: the code until it is paired, then the scene the remote picked. */
export const EventScreen: React.FC = () => {
  const [answer, setAnswer] = useState<ScreenAnswer | null>(null);
  const [offline, setOffline] = useState(false);
  const [started, setStarted] = useState(false);
  const [offset, setOffset] = useState(0);
  const lastVersion = useRef<number | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const poll = useCallback(async () => {
    try {
      let res = await call<ScreenAnswer>('GET', '/api/event_screen/state');
      if (res.status === 401) {
        await call('POST', '/api/event_screen/hello');
        res = await call<ScreenAnswer>('GET', '/api/event_screen/state');
      }
      if (res.status === 404) {
        setAnswer(null);
        setOffline(true);
        return;
      }
      if (res.data && res.status === 200) {
        setAnswer(res.data);
        setOffline(false);
        if (res.data.paired) setOffset(new Date(res.data.serverNow).getTime() - Date.now());
      }
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    document.title = 'صفحهٔ بزرگ رویداد';
    void call('POST', '/api/event_screen/hello').then(poll);
  }, [poll]);

  const paired = answer?.paired ?? false;
  useEffect(() => {
    const t = window.setInterval(() => void poll(), paired ? 1000 : 2500);
    return () => window.clearInterval(t);
  }, [poll, paired]);

  // A soft chime when the remote switches the scene (once sound is allowed by a first tap).
  const version = answer?.paired ? answer.screen.version : null;
  useEffect(() => {
    if (version === null) return;
    if (lastVersion.current !== null && version !== lastVersion.current && started) playChime();
    lastVersion.current = version;
  }, [version, started]);

  const start = async () => {
    setStarted(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Some TV browsers refuse full screen; the page still works.
    }
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
      wakeLock.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      // Without a wake lock the TV's own settings decide when it dims.
    }
  };
  // The wake lock is dropped when the page is hidden; ask again when it comes back.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible' && started) void start();
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [started]);  

  const screen = answer?.paired ? answer.screen : null;
  const timer = useTimer(screen, offset);

  return (
    <div className="fixed inset-0 text-white flex flex-col select-none overflow-hidden" style={heroStyle} dir="rtl">
      {!answer ? (
        <Big>
          <p className="text-[3vw] font-black">{offline ? 'صفحهٔ بزرگ به پرتال وصل نشد یا رویداد ویژه خاموش است.' : 'در حال آماده شدن…'}</p>
          {offline && <p className="text-[1.8vw] opacity-75">چند ثانیه دیگر دوباره امتحان می‌شود.</p>}
        </Big>
      ) : !answer.paired ? (
        <Big>
          <p className="text-[2.6vw] font-bold opacity-85">برای وصل کردن این صفحه، در پرتال روی گوشی بروید به</p>
          <p className="text-[2.6vw] font-black" style={{ color: YALDA.gold }}>
            رویداد ویژه ← ریموت صفحهٔ بزرگ ← وصل کردن صفحهٔ بزرگ
          </p>
          <p className="text-[2.6vw] font-bold opacity-85">و این کد را وارد کنید:</p>
          <p className="text-[16vw] font-black leading-none tracking-[0.2em] tabular-nums" dir="ltr">
            {toPersianDigits(answer.code)}
          </p>
          <p className="text-[1.6vw] opacity-60">کد هر ۱۵ دقیقه عوض می‌شود.</p>
        </Big>
      ) : (
        <>
          <Scene view={answer} screen={answer.screen} offset={offset} timer={timer} started={started} />
          {answer.screen.scene !== 'break' && (answer.screen.timer.endsAt || timer !== answer.screen.timer.durationSec) && (
            <div className="absolute top-[2vw] left-[2vw] rounded-[1.4vw] bg-black/40 px-[2vw] py-[0.8vw] text-[4vw] font-black tabular-nums" aria-label="زمان‌سنج">
              {countdownText(timer) || toPersianDigits('00:00:00')}
            </div>
          )}
          {(() => {
            // The song playing now, in a thin strip at the bottom of every scene.
            const song = answer.screen.songId ? answer.songs.find((s) => s.id === answer.screen.songId) : undefined;
            return song ? (
              <p className="shrink-0 flex items-center justify-center gap-[1vw] text-[1.8vw] font-bold py-[0.8vw] bg-black/40" aria-label="در حال پخش">
                <span aria-hidden>🎵</span>
                <span>{song.title}</span>
                {song.artist && <span className="opacity-70">· {song.artist}</span>}
                {song.byId && answer.people[song.byId] && <span className="opacity-60 text-[1.4vw]">(پیشنهاد {answer.people[song.byId].name})</span>}
              </p>
            ) : null;
          })()}
          {answer.screen.caption && (
            <p className="shrink-0 text-center text-[2.4vw] font-bold py-[1.4vw] bg-black/30" style={{ color: YALDA.gold }}>
              {answer.screen.caption}
            </p>
          )}
        </>
      )}
      {!started && (
        <button
          type="button"
          onClick={() => void start()}
          className="absolute bottom-[2vw] right-[2vw] flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 px-[2vw] py-[1vw] text-[1.6vw] font-bold"
        >
          <Maximize className="w-[2vw] h-[2vw]" /> یک بار لمس کنید: تمام‌صفحه و صدا
        </button>
      )}
      {offline && answer && <span className="absolute bottom-[1vw] left-[1vw] text-[1.2vw] text-amber-300">ارتباط قطع شد؛ در حال وصل شدن دوباره…</span>}
    </div>
  );
};
