import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, EyeOff, Target } from 'lucide-react';
import { RECOGNITION_MISSIONS, type RecognitionMission } from '../../../../shared/recognitionTutorial';
import { toPersianDigits } from '../../../lib/jalali';
import type { EffectsLevel } from '../effects';
import { openGive, showThanksTab, useThanks } from '../thanksStore';
import { celebrate } from './TourBox';
import { hideMissions, missionsDone, saveTutorial, useTour } from './tourStore';

// «مأموریت‌های سپاس» (plan: section د): five small things that show the rest of «سپاس», ticked from what
// the colleague actually did, before the tutorial too. No coins for them: «سپاس» is not a game of points.

const fa = toPersianDigits;

const MISSIONS: Record<RecognitionMission, { label: string; go: () => void }> = {
  sent: { label: 'اولین قدردانی را بفرستید', go: () => openGive() },
  opened: { label: 'یک قدردانی دریافتی را باز کنید', go: () => showThanksTab('received') },
  joined: { label: 'روی دیوار «من هم» بزنید', go: () => showThanksTab('wall') },
  reacted: { label: 'به یک کارت دیوار واکنش نشان دهید', go: () => showThanksTab('wall') },
  twoValues: { label: 'برای دو ارزش مختلف قدردانی کنید', go: () => openGive() },
};

export const Missions: React.FC<{ fx: EffectsLevel }> = ({ fx }) => {
  const { missions, progress, missionsShown, loaded } = useTour();
  const { wallet, received } = useThanks();
  const [note, setNote] = useState<string | null>(null);
  const done = missionsDone(missions);
  const all = done === RECOGNITION_MISSIONS.length;
  const celebrated = progress.missions?.celebrated === true;
  // The celebration is once; the card stays with its line until the colleague leaves the page.
  const [justFinished, setJustFinished] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    if (!all || celebrated || fired.current) return;
    fired.current = true;
    setJustFinished(true);
    celebrate(fx);
    saveTutorial({ missions: { celebrated: true } });
  }, [all, celebrated, fx]);

  const hidden = progress.missions?.hidden === true || (celebrated && !justFinished);
  if (!loaded || !missions || !wallet || (hidden && !missionsShown)) return null;

  return (
    <section className="bg-white border border-line/70 shadow-card rounded-3xl p-4 sm:p-5 space-y-3" aria-labelledby="sp-missions-title" data-tour="missions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-brand" />
          <h2 id="sp-missions-title" className="text-sm font-black text-ink">
            مأموریت‌های سپاس
          </h2>
          <span className="text-xs font-bold text-muted tabular-nums">
            {fa(done)} از {fa(RECOGNITION_MISSIONS.length)}
          </span>
        </div>
        <button type="button" onClick={hideMissions} className="tap-area inline-flex items-center gap-1 text-xs font-bold text-faint hover:text-ink">
          <EyeOff className="w-3.5 h-3.5" /> پنهان کردن فهرست
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-surface overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${(done / RECOGNITION_MISSIONS.length) * 100}%` }} />
      </div>
      {all ? (
        <p className="text-sm font-bold text-emerald-800">همهٔ مأموریت‌ها تمام شد! حالا سپاس دست شماست.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {RECOGNITION_MISSIONS.map((key) => {
            const ok = missions[key];
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={ok}
                  aria-label={`${MISSIONS[key].label}${ok ? ' (انجام شد)' : ''}`}
                  onClick={() => {
                    setNote(key === 'opened' && received.length === 0 ? 'وقتی کسی از شما قدردانی کند، اینجا روشن می‌شود.' : null);
                    MISSIONS[key].go();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-2xl border text-right text-xs font-bold transition-colors ${
                    ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-ink-soft hover:bg-surface'
                  }`}
                >
                  <span className={`w-5 h-5 shrink-0 grid place-items-center rounded-full border ${ok ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-line-strong'}`}>
                    {ok && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <span className={`flex-1 ${ok ? 'line-through decoration-emerald-700/40' : ''}`}>{MISSIONS[key].label}</span>
                  {!ok && <ChevronLeft className="w-4 h-4 text-faint" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {note && (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      )}
    </section>
  );
};
