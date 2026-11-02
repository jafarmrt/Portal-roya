import React, { useEffect, useId, useState } from 'react';
import { Link2, Monitor, Pause, Play, RotateCcw, Send } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { ResultModal } from './ResultModal';
import { EntryPicture, Stepper, api, entryName, useEventAction } from './eventUi';
import { countdownText } from './EventParts';
import { SCREEN_SCENES, timerLeft, type ScreenScene, type ScreenState } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventView } from './types';

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
  useEffect(() => setCaption(screen?.caption ?? ''), [screen?.caption]);
  useEffect(() => {
    if (screen?.competitionId) setCompetitionId(screen.competitionId);
  }, [screen?.competitionId]);

  if (!screen) return null;
  const competition = view.competitions.find((c) => c.id === competitionId);
  const stageMatch = competition?.matches.find((m) => m.id === screen.matchId);
  const playable = competition?.matches.filter((m) => m.entryA && m.entryB && !m.bye) ?? [];

  const show = (scene: ScreenScene, extra: Partial<Pick<ScreenState, 'competitionId' | 'matchId' | 'caption'>> = {}) =>
    run(() =>
      api.put(`/api/special_events/${event.id}/screen`, {
        scene,
        competitionId: extra.competitionId !== undefined ? extra.competitionId : competitionId || null,
        matchId: extra.matchId !== undefined ? extra.matchId : screen.matchId,
        caption: extra.caption !== undefined ? extra.caption : caption.trim(),
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
          {SCREEN_SCENES.filter((s) => s.id !== 'match').map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void show(s.id)}
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
                    className={`w-full flex items-center gap-2 p-2 rounded-xl border text-xs text-right ${active ? 'border-red-700 bg-red-50' : 'border-line hover:bg-surface'} ${m.winnerId ? 'opacity-60' : ''}`}
                  >
                    <span className="font-bold text-muted w-20 shrink-0 truncate">{m.roundName}</span>
                    <span className="flex-1 min-w-0 truncate font-bold">
                      {entryName(competition!.entries.find((e) => e.id === m.entryA), view.people)} – {entryName(competition!.entries.find((e) => e.id === m.entryB), view.people)}
                    </span>
                    {m.winnerId ? <span className="text-emerald-700">تمام</span> : m.live ? <span className="text-amber-700">زنده</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {stageMatch && competition && screen.scene === 'match' && !stageMatch.winnerId && (
          <div className="p-3 rounded-2xl bg-surface space-y-3">
            <div className="flex justify-around gap-2">
              {[
                { entryId: stageMatch.entryA, value: shownA, set: (v: number) => live(v, shownB), label: 'طرف اول' },
                { entryId: stageMatch.entryB, value: shownB, set: (v: number) => live(shownA, v), label: 'طرف دوم' },
              ].map((side) => {
                const entry = competition.entries.find((e) => e.id === side.entryId);
                return (
                  <div key={side.label} className="flex flex-col items-center gap-2 min-w-0">
                    <EntryPicture entry={entry} people={view.people} className="w-10 h-10 rounded-xl text-2xl" />
                    <span className="text-xs font-black truncate max-w-full">{entryName(entry, view.people)}</span>
                    {competition.scoring !== 'winner' && <Stepper big value={side.value} onChange={side.set} label={`امتیاز ${side.label}`} />}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setFinishing(true)} className={`${primaryButtonClass} w-full justify-center py-3`}>
              پایان بازی و ثبت نتیجه
            </button>
          </div>
        )}
      </section>

      <div className="lg:col-span-2">
        <PairScreen eventId={event.id} />
      </div>

      {finishing && stageMatch && competition && (
        <ResultModal view={view} competition={competition} match={stageMatch} initialScores={{ a: shownA, b: shownB }} onClose={() => setFinishing(false)} />
      )}
    </div>
  );
};
