import React, { useEffect, useId, useState } from 'react';
import { Check, Eye, EyeOff, Link2, Monitor, Music, Square, Pause, Play, RotateCcw, Send, SkipForward, WholeWord } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { ResultModal } from './ResultModal';
import { GuessReveal } from './GamesSection';
import { EnvelopePanel } from './NightSection';
import { QuizRemote } from './QuizSection';
import { WheelRemote } from './WishesSection';
import { EntryPicture, Stepper, api, entryName, isReady, sidesLine, useEventAction } from './eventUi';
import { countdownText } from './EventParts';
import { SCREEN_SCENES, randomFal, timerLeft, type ScreenScene, type ScreenState } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventView } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';
const TIMER_PRESETS = [60, 120, 300, 600];

/** Connects a big screen: it shows four digits, the organizer types them here. */
const PairScreen: React.FC<{ eventId: string }> = ({ eventId }) => {
  const run = useEventAction();
  const id = useId();
  const [code, setCode] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const ok = await run(() => api.post(`/api/special_events/${eventId}/screens/pair`, { code: digits }), 'صفحهٔ بزرگ وصل شد.');
    if (ok) setCode('');
  };
  return (
    <form onSubmit={submit} className={card}>
      <h2 className="text-sm font-black text-ink flex items-center gap-1.5">
        <Link2 className="w-4 h-4 text-red-700" /> وصل کردن صفحهٔ بزرگ
      </h2>
      <p className="text-xs text-muted">
        روی صفحهٔ بزرگ (تلویزیون اندرویدی) مرورگر را باز کنید و نشانی پرتال را با <span dir="ltr" className="font-mono">#screen</span> در آخرش بزنید. صفحه یک کد ۴ رقمی نشان
        می‌دهد؛ همان را اینجا وارد کنید. صفحهٔ بزرگ حساب کاربری نمی‌خواهد و چیزی را تغییر نمی‌دهد.
      </p>
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          کد صفحهٔ بزرگ
        </label>
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="کد ۴ رقمی"
          className={`${inputClass} w-36 text-center text-lg tracking-widest`}
          dir="ltr"
        />
        <button type="submit" disabled={code.length !== 4} className={`${primaryButtonClass} whitespace-nowrap`}>
          وصل کن
        </button>
      </div>
    </form>
  );
};

/** The live timer on the screen: start, stop and reset, with a few presets. */
const TimerControls: React.FC<{ eventId: string; screen: ScreenState }> = ({ eventId, screen }) => {
  const run = useEventAction();
  const [, tick] = useState(0);
  const running = Boolean(screen.timer.endsAt);
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const left = timerLeft(screen.timer);
  const send = (action: 'start' | 'stop' | 'reset', durationSec?: number) => run(() => api.post(`/api/special_events/${eventId}/screen/timer`, { action, durationSec }));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-3xl font-black tabular-nums text-ink w-28 text-center">{countdownText(left) || toPersianDigits('00:00:00')}</span>
        {running ? (
          <button type="button" onClick={() => void send('stop')} className={secondaryButtonClass}>
            <Pause className="w-4 h-4" /> توقف
          </button>
        ) : (
          <button type="button" onClick={() => void send('start')} className={primaryButtonClass}>
            <Play className="w-4 h-4" /> شروع
          </button>
        )}
        <button type="button" onClick={() => void send('reset')} className={secondaryButtonClass} aria-label="از اول">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIMER_PRESETS.map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => void send('reset', sec)}
            aria-pressed={screen.timer.durationSec === sec}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${screen.timer.durationSec === sec ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong'}`}
          >
            {toPersianDigits(sec / 60)} دقیقه
          </button>
        ))}
      </div>
    </div>
  );
};

/** «در حال پخش»: the music lead picks the song playing now; the big screen shows it at the bottom. */
const NowPlaying: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const [all, setAll] = useState(false);
  const playing = view.event.screen?.songId ?? null;
  const songs = view.songs.filter((s) => !s.hidden);
  const shown = all ? songs : songs.slice(0, 8);
  const current = songs.find((s) => s.id === playing);
  const play = (songId: string | null) => run(() => api.post(`/api/special_events/${view.event.id}/now_playing`, { songId }));
  return (
    <section className={card} aria-labelledby="remote-music-title">
      <h2 id="remote-music-title" className="text-sm font-black text-ink flex items-center gap-1.5">
        <Music className="w-4 h-4 text-red-700" /> در حال پخش
      </h2>
      {current ? (
        <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-amber-50 border border-amber-200">
          <span className="flex-1 min-w-0 truncate text-xs font-black">
            🎵 {current.title}
            {current.artist && <span className="font-bold text-muted"> · {current.artist}</span>}
          </span>
          <button type="button" onClick={() => void play(null)} className={secondaryButtonClass}>
            <Square className="w-3.5 h-3.5" /> قطع
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">آهنگی روی صفحهٔ بزرگ نیست. با «پخش» نامش پایین صفحهٔ بزرگ می‌آید.</p>
      )}
      {songs.length === 0 ? (
        <p className="text-xs text-muted">همکاران هنوز آهنگی پیشنهاد نداده‌اند.</p>
      ) : (
        <ol className="space-y-1">
          {shown.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <span className={`flex-1 min-w-0 truncate font-bold ${s.playedAt && s.id !== playing ? 'text-muted' : 'text-ink'}`}>
                {s.title}
                {s.artist && <span className="font-normal text-muted"> · {s.artist}</span>}
              </span>
              <span className="text-[11px] text-muted tabular-nums shrink-0">♥ {toPersianDigits(s.votes)}</span>
              <button
                type="button"
                disabled={s.id === playing}
                onClick={() => void play(s.id)}
                className={`${secondaryButtonClass} px-2.5 py-1`}
                aria-label={`پخش ${s.title}`}
              >
                <Play className="w-3.5 h-3.5" /> {s.playedAt && s.id !== playing ? 'دوباره' : 'پخش'}
              </button>
            </li>
          ))}
        </ol>
      )}
      {songs.length > 8 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] font-bold text-red-700">
          {all ? 'فقط ۸ تای اول' : `همهٔ ${toPersianDigits(songs.length)} آهنگ`}
        </button>
      )}
    </section>
  );
};

/**
 * «کارت کلمه» of a pantomime: the next word nobody has had, on the organizer's phone only (it is shown to
 * the one acting, never on the big screen). «حدس زدند» adds a point to the side playing and deals the next.
 */
const WordCard: React.FC<{ competition: EventCompetition; onGuessed?: () => void }> = ({ competition, onGuessed }) => {
  const run = useEventAction();
  const [word, setWord] = useState<string | null>(null);
  const [left, setLeft] = useState(competition.words.length - competition.wordsUsed);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setWord(null);
    setLeft(competition.words.length - competition.wordsUsed);
  }, [competition.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: 'next' | 'reset') => {
    setBusy(true);
    const answer = await run(() => api.post<{ word: string | null; left: number }>(`/api/event_competitions/${competition.id}/word`, { action }));
    setBusy(false);
    if (!answer) return;
    setWord(answer.word);
    setLeft(answer.left);
    setHidden(false);
  };

  return (
    <div className="p-3 rounded-2xl border-2 border-dashed border-red-300 bg-red-50/40 space-y-2" aria-label="کارت کلمه">
      <p className="text-xs font-black text-ink flex items-center gap-1.5">
        <WholeWord className="w-4 h-4 text-red-700" aria-hidden /> کارت کلمه
        <span className="ms-auto text-[11px] font-bold text-muted">{toPersianDigits(left)} کلمه مانده</span>
      </p>
      <div className="min-h-20 rounded-xl bg-white border border-line flex items-center justify-center p-3 text-center" aria-live="polite">
        {word ? (
          hidden ? (
            <span className="text-sm text-muted">کلمه پنهان است</span>
          ) : (
            <span className="text-3xl font-black text-ink leading-snug break-words">{word}</span>
          )
        ) : (
          <span className="text-xs text-muted">«کلمهٔ بعدی» را بزنید و گوشی را فقط به کسی که اجرا می‌کند نشان دهید.</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {word && onGuessed ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onGuessed();
              void send('next');
            }}
            className="px-5 py-3 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" /> حدس زدند (+۱)
          </button>
        ) : null}
        <button type="button" disabled={busy || left === 0} onClick={() => void send('next')} className={`${word && onGuessed ? secondaryButtonClass : primaryButtonClass} justify-center py-3`}>
          <SkipForward className="w-4 h-4" /> {word ? 'رد شد؛ کلمهٔ بعدی' : 'کلمهٔ بعدی'}
        </button>
      </div>
      <div className="flex gap-2">
        {word && (
          <button type="button" onClick={() => setHidden((h) => !h)} className={secondaryButtonClass}>
            {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />} {hidden ? 'نشان بده' : 'پنهان کن'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm('همهٔ کلمه‌ها دوباره قابل استفاده شوند؟')) void send('reset');
          }}
          className={`${secondaryButtonClass} ms-auto`}
        >
          <RotateCcw className="w-4 h-4" /> از اول
        </button>
      </div>
    </div>
  );
};

/**
 * «ریموت»: the organizer's phone drives the big screen: which scene it shows, the match on stage with its
 * score moving live, the timer and a short caption.
 */
export const RemotePanel: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const { event } = view;
  const screen = event.screen;
  const [caption, setCaption] = useState(screen?.caption ?? '');
  const [competitionId, setCompetitionId] = useState(screen?.competitionId ?? view.competitions[0]?.id ?? '');
  const [finishing, setFinishing] = useState(false);
  const [scores, setScores] = useState<{ matchId: string; a: number; b: number } | null>(null);
  // Whose turn it is for the word card's «حدس زدند».
  const [turn, setTurn] = useState<'a' | 'b'>('a');
  useEffect(() => setCaption(screen?.caption ?? ''), [screen?.caption]);
  useEffect(() => {
    if (screen?.competitionId) setCompetitionId(screen.competitionId);
  }, [screen?.competitionId]);

  if (!screen) return null;
  const competition = view.competitions.find((c) => c.id === competitionId);
  const stageMatch = competition?.matches.find((m) => m.id === screen.matchId);
  const playable = competition?.matches.filter((m) => isReady(competition, m)) ?? [];
  const ranking = competition?.format === 'ranking';
  // A ranking by time is entered at the end; a score moves live.
  const counts = competition ? (ranking ? competition.rankBy === 'high' : competition.scoring !== 'winner') : false;

  const show = (scene: ScreenScene, extra: Partial<Pick<ScreenState, 'competitionId' | 'matchId' | 'caption' | 'awardId' | 'falIndex'>> = {}) =>
    run(() =>
      api.put(`/api/special_events/${event.id}/screen`, {
        scene,
        competitionId: extra.competitionId !== undefined ? extra.competitionId : competitionId || null,
        matchId: extra.matchId !== undefined ? extra.matchId : screen.matchId,
        caption: extra.caption !== undefined ? extra.caption : caption.trim(),
        awardId: extra.awardId ?? null,
        falIndex: extra.falIndex ?? null,
      }),
    );

  const live = (scoreA: number, scoreB: number) => {
    if (!stageMatch) return;
    setScores({ matchId: stageMatch.id, a: scoreA, b: scoreB });
    void run(() => api.post(`/api/event_matches/${stageMatch.id}/live`, { scoreA, scoreB }));
  };
  // Taps change the score here at once; the screen follows a moment later.
  const local = scores && stageMatch && scores.matchId === stageMatch.id ? scores : null;
  const shownA = local ? local.a : (stageMatch?.scoreA ?? 0);
  const shownB = local ? local.b : (stageMatch?.scoreB ?? 0);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section className={card}>
        <h2 className="text-sm font-black text-ink flex items-center gap-1.5">
          <Monitor className="w-4 h-4 text-red-700" /> صفحهٔ بزرگ الان چه نشان دهد؟
        </h2>
        <div>
          <label htmlFor={`${id}-comp`} className={labelClass}>
            مسابقه (برای جدول، بازی و قهرمان)
          </label>
          <select id={`${id}-comp`} value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} className={inputClass}>
            {view.competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCREEN_SCENES.filter((s) => s.id !== 'match' && s.id !== 'envelope' && (s.id !== 'guess' || view.guess) && (s.id !== 'schedule' || event.schedule.length > 0) && ((s.id !== 'quiz' && s.id !== 'quizboard') || view.quiz.count > 0)).map((s) => (
            <button
              key={s.id}
              type="button"
              // «فال حافظ» draws a new verse for the hall at each tap.
              onClick={() => void show(s.id, s.id === 'fal' ? { falIndex: randomFal() } : {})}
              aria-pressed={screen.scene === s.id}
              className={`p-3 rounded-2xl text-sm font-bold border-2 ${screen.scene === s.id ? 'border-red-700 bg-red-50 text-red-900' : 'border-line bg-white text-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor={`${id}-caption`} className={labelClass}>
            یک خط زیر صفحه (اختیاری)
          </label>
          <div className="flex gap-2">
            <input id={`${id}-caption`} value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} className={inputClass} placeholder="مثلاً ۱۰ دقیقه استراحت؛ چای و انار آماده است" />
            <button type="button" onClick={() => void show(screen.scene, { caption: caption.trim() })} className={secondaryButtonClass} aria-label="نشان دادن این خط">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="pt-2 border-t border-line">
          <p className={labelClass}>زمان‌سنج روی صفحه</p>
          <TimerControls eventId={event.id} screen={screen} />
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-black text-ink">بازی روی صحنه</h2>
        {playable.length === 0 ? (
          <p className="text-xs text-muted">این مسابقه هنوز بازی آماده‌ای ندارد.</p>
        ) : (
          <ul className="space-y-1.5">
            {playable.map((m) => {
              const active = screen.scene === 'match' && screen.matchId === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void show('match', { matchId: m.id, competitionId })}
                    aria-pressed={active}
                    className={`w-full flex items-center gap-2 p-2 rounded-xl border text-xs text-right ${active ? 'border-red-700 bg-red-50' : 'border-line hover:bg-surface'} ${m.done ? 'opacity-60' : ''}`}
                  >
                    <span className="font-bold text-muted w-20 shrink-0 truncate">{m.roundName}</span>
                    <span className="flex-1 min-w-0 truncate font-bold">{sidesLine(competition!, m, view.people)}</span>
                    {m.done ? <span className="text-emerald-700">تمام</span> : m.live ? <span className="text-amber-700">زنده</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {stageMatch && competition && screen.scene === 'match' && !stageMatch.done && (
          <div className="p-3 rounded-2xl bg-surface space-y-3">
            <div className="flex justify-around gap-2">
              {[
                { key: 'a' as const, entryId: stageMatch.entryA, value: shownA, set: (v: number) => live(v, shownB), label: ranking ? 'اجراکننده' : 'طرف اول' },
                ...(ranking ? [] : [{ key: 'b' as const, entryId: stageMatch.entryB, value: shownB, set: (v: number) => live(shownA, v), label: 'طرف دوم' }]),
              ].map((side) => {
                const entry = competition.entries.find((e) => e.id === side.entryId);
                return (
                  <div key={side.label} className="flex flex-col items-center gap-2 min-w-0">
                    <EntryPicture entry={entry} people={view.people} className="w-10 h-10 rounded-xl text-2xl" />
                    <span className="text-xs font-black truncate max-w-full">{entryName(entry, view.people)}</span>
                    {counts && <Stepper big value={side.value} onChange={side.set} label={`امتیاز ${side.label}`} />}
                    {!ranking && competition.words.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTurn(side.key)}
                        aria-pressed={turn === side.key}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold border ${turn === side.key ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong'}`}
                      >
                        {turn === side.key ? 'نوبت این طرف' : 'نوبت این طرف شود'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setFinishing(true)} className={`${primaryButtonClass} w-full justify-center py-3`}>
              {ranking ? 'پایان اجرا و ثبت نتیجه' : 'پایان بازی و ثبت نتیجه'}
            </button>
          </div>
        )}
        {/* One card in one place, so its word stays put while the scene changes. */}
        {competition && competition.words.length > 0 && (
          <WordCard
            competition={competition}
            onGuessed={
              counts && stageMatch && screen.scene === 'match' && !stageMatch.done ? () => (turn === 'b' && !ranking ? live(shownA, shownB + 1) : live(shownA + 1, shownB)) : undefined
            }
          />
        )}
      </section>

      <NowPlaying view={view} />
      <QuizRemote view={view} onBoard={() => void show('quizboard')} />
      <WheelRemote view={view} />
      <GuessReveal view={view} onShow={() => void show('guess')} />
      <EnvelopePanel view={view} onShow={(awardId) => void show('envelope', { awardId })} />
      <PairScreen eventId={event.id} />

      {finishing && stageMatch && competition && (
        <ResultModal view={view} competition={competition} match={stageMatch} initialScores={{ a: shownA, b: shownB }} onClose={() => setFinishing(false)} />
      )}
    </div>
  );
};
