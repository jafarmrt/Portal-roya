import React, { useState } from 'react';
import { CalendarDays, ChevronDown, Sunrise } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { haptic } from '../../lib/feedback';
import { todayJalali } from '../../lib/jalali';
import { MOOD_PRIVACY_LINE, moodReply, type Mood } from '../../../shared/mood';
import { DayStep } from './DayStep';
import { MOOD_LOOK, MOOD_ORDER } from './moodLook';
import { MyMonth } from './MyMonth';
import { TeamMood } from './TeamMood';

/**
 * «شروع روز»: the day's mood in one tap, and then what comes back for it: a sentence for the
 * colleague, how the organisation is today («حال‌وهوای ما») and their own month («ماه من»).
 * The answer is kept with the colleague's name but managers only ever see totals.
 */
export const DayStartCard: React.FC = () => {
  const { userMoods, submitMood, isLoaded } = usePortal();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<Mood | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const today = todayJalali();
  const mine = userMoods.find((m) => m.date === today)?.mood ?? null;

  // Until the colleague's own answers have arrived the card would ask again by mistake.
  if (!isLoaded('moods')) return null;

  const choose = async (mood: Mood) => {
    if (busy) return;
    haptic();
    setBusy(mood);
    await submitMood(mood);
    setBusy(null);
    setChanging(false);
  };

  if (!mine || changing) {
    return (
      // Wide (under the welcome) the question and the five answers share one row; narrow (the side
      // column, a phone) the answers go under the question.
      <section aria-labelledby="day-start-title" className="@container bg-white rounded-3xl p-5 sm:p-6 border border-line/70 shadow-card" dir="rtl" data-testid="day-start">
        <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
          <div className="flex items-center gap-2.5 pb-3 border-b border-line @3xl:pb-0 @3xl:border-b-0">
            <div className="p-2 bg-brand-soft text-brand-strong rounded-xl">
              <Sunrise className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="day-start-title" className="text-sm font-black text-ink-strong">شروع روز: حال امروزتان چطور است؟</h3>
              <p className="text-xs text-muted">{MOOD_PRIVACY_LINE}</p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1 @3xl:w-[30rem] @3xl:shrink-0" role="group" aria-label="حال امروز">
            {MOOD_ORDER.map((mood) => {
              const look = MOOD_LOOK[mood];
              const Icon = look.icon;
              return (
                <button
                  key={mood}
                  type="button"
                  onClick={() => void choose(mood)}
                  disabled={busy !== null}
                  aria-pressed={mine === mood}
                  className={`min-w-0 flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-2xl text-muted transition-all border cursor-pointer disabled:cursor-wait ${look.hover} ${mine === mood ? 'border-line bg-surface' : 'border-transparent'} ${busy === mood ? 'opacity-60' : ''}`}
                >
                  <Icon className={`w-7 h-7 ${look.text}`} />
                  <span className="text-xs font-bold whitespace-nowrap">{mood}</span>
                </button>
              );
            })}
          </div>
        </div>
        {changing && (
          <button type="button" onClick={() => setChanging(false)} className="mt-3 text-xs font-bold text-muted hover:text-ink">
            انصراف
          </button>
        )}
      </section>
    );
  }

  const look = MOOD_LOOK[mine];
  const Icon = look.icon;
  return (
    // Narrow: the mood and its sentence, the day's step, «حال‌وهوای ما», then «ماه من». Wide: the
    // colleague's own side (the mood, the step, «ماه من») in one column and «حال‌وهوای ما» beside it.
    <section aria-labelledby="day-start-title" className="@container bg-white rounded-3xl p-5 sm:p-6 border border-line/70 shadow-card" dir="rtl" data-testid="day-start">
      <div className="grid gap-4 @3xl:grid-cols-2 @3xl:gap-x-8">
        <div className="flex items-start gap-3 min-w-0 @3xl:col-start-1">
          <div className={`p-2.5 rounded-2xl shrink-0 ${look.chip}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 id="day-start-title" className="text-sm font-black text-ink-strong">حال امروز شما: {mine}</h3>
              <button type="button" onClick={() => setChanging(true)} className="text-xs font-bold text-muted hover:text-brand-strong shrink-0">
                تغییر
              </button>
            </div>
            <p className="text-xs font-medium text-ink-soft mt-1 leading-relaxed" data-testid="mood-reply">{moodReply(mine, today)}</p>
          </div>
        </div>

        {/* Its wrapper is empty (and takes no room) on a day without a step */}
        <div className="min-w-0 empty:hidden pt-4 border-t border-line @3xl:col-start-1">
          <DayStep mood={mine} />
        </div>

        <div className="pt-4 border-t border-line min-w-0 @3xl:col-start-2 @3xl:row-start-1 @3xl:row-span-3 @3xl:pt-0 @3xl:border-t-0 @3xl:border-r @3xl:pr-8">
          <TeamMood refreshKey={`${today}:${mine}`} />
        </div>

        <div className="pt-4 border-t border-line space-y-3 min-w-0 @3xl:col-start-1">
          <button
            type="button"
            onClick={() => setMonthOpen((open) => !open)}
            aria-expanded={monthOpen}
            className="w-full flex items-center justify-between text-xs font-bold text-ink-soft hover:text-brand-strong"
          >
            <span className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              ماه من
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${monthOpen ? 'rotate-180' : ''}`} />
          </button>
          {monthOpen && (
            <div className="max-w-xs">
              <MyMonth moods={userMoods} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
