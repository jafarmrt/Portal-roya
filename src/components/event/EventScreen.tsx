import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Maximize, Trophy } from 'lucide-react';
import { Bracket } from './Bracket';
import { JuryStrip, countdownText } from './EventParts';
import { EntryPicture, YALDA, entryName, heroStyle, scoreLine } from './eventUi';
import { playChime } from '../../lib/sound';
import { programStart, timerLeft, type ScreenState } from '../../../shared/specialEvents';
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
    </Big>
  );
};

const Today: React.FC<{ view: EventView }> = ({ view }) => {
  const rows = view.competitions
    .flatMap((c) => c.matches.filter((m) => m.entryA && m.entryB && !m.bye && (m.onStage || m.day === view.event.programDate)).map((m) => ({ c, m })))
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
              <span className="flex-1 min-w-0 truncate font-bold">
                {entryName(c.entries.find((e) => e.id === m.entryA), view.people)} – {entryName(c.entries.find((e) => e.id === m.entryB), view.people)}
              </span>
              <span className="shrink-0 font-black tabular-nums">{m.winnerId ? scoreLine(m) || '✓' : m.live ? 'زنده' : ''}</span>
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

const Scene: React.FC<{ view: EventView; screen: ScreenState; offset: number; timer: number }> = ({ view, screen, offset, timer }) => {
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
          <div className="text-ink bg-page rounded-[2vw] p-[1.4vw] max-w-full" style={{ zoom: 1.5 }}>
            <Bracket competition={competition} people={view.people} fileUrl={fileUrl} />
          </div>
        </Big>
      ) : (
        <Big><p className="text-[4vw] font-black">جدول به‌زودی منتشر می‌شود</p></Big>
      );
    case 'match':
      return <StageMatch view={view} competition={competition} matchId={screen.matchId} />;
    case 'today':
      return <Today view={view} />;
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
          <Scene view={answer} screen={answer.screen} offset={offset} timer={timer} />
          {answer.screen.scene !== 'break' && (answer.screen.timer.endsAt || timer !== answer.screen.timer.durationSec) && (
            <div className="absolute top-[2vw] left-[2vw] rounded-[1.4vw] bg-black/40 px-[2vw] py-[0.8vw] text-[4vw] font-black tabular-nums" aria-label="زمان‌سنج">
              {countdownText(timer) || toPersianDigits('00:00:00')}
            </div>
          )}
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
