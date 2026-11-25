import React, { useEffect, useState } from 'react';
import { Bell, CalendarDays, ChevronDown, Sunrise } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { haptic } from '../../lib/feedback';
import { todayJalali } from '../../lib/jalali';
import { wrapDue } from '../../../shared/dayWeek';
import { MOOD_PRIVACY_LINE, moodReply, type Mood } from '../../../shared/mood';
import { DayQuestionAsk, DayQuestionResults } from './DayQuestion';
import { DayStep } from './DayStep';
import { DayWrap, WRAP_SEEN } from './DayWrap';
import { MoodReasons } from './MoodReasons';
import { MOOD_LOOK, MOOD_ORDER } from './moodLook';
import { MyMonth } from './MyMonth';
import { loadDayQuestion, skipDayQuestion, useDayQuestion } from './questionStore';
import { useSeen } from './seenStore';
import { TeamMood } from './TeamMood';

/**
 * «شروع روز» in three short steps: the day's mood in one tap (with what affected it, if the
 * colleague cares to say), the day's question, and one step for today. What comes back for it: a
 * sentence for the colleague, how the organisation is today («حال‌وهوای ما»), what everyone answered
 * to the question, and their own month («ماه من»). Answers are kept with the colleague's name but
 * managers only ever see totals.
 */
export const DayStartCard: React.FC = () => {
  const { currentUser, userMoods, submitMood, isLoaded, todos, featureOn, appSettings, setDayStartReminder } = usePortal();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<Mood | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  // The reasons are offered in the visit the mood was chosen in, not every time the dashboard opens.
  const [justAnswered, setJustAnswered] = useState(false);
  const [reanswering, setReanswering] = useState(false);
  // The reminder's box answers the tap at once; the saved setting follows.
  const [reminderTapped, setReminderTapped] = useState<boolean | null>(null);
  const today = todayJalali();
  const answer = userMoods.find((m) => m.date === today);
  const mine = answer?.mood ?? null;
  const userId = currentUser?.id ?? '';
  const asked = useDayQuestion();
  const wrapSeen = useSeen(userId, WRAP_SEEN);
  // The afternoon wrap-up comes by the clock, also on a page left open since the morning.
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const question = asked.key === `${userId}:${today}` ? asked : null;

  // The day's question is asked for once the mood is in: it is the second step, not the first.
  useEffect(() => {
    if (userId && mine) void loadDayQuestion(userId, today);
  }, [userId, mine, today]);

  // Until the colleague's own answers have arrived the card would ask again by mistake.
  if (!isLoaded('moods')) return null;

  const choose = async (mood: Mood) => {
    if (busy) return;
    haptic();
    setBusy(mood);
    await submitMood(mood);
    setBusy(null);
    setChanging(false);
    setJustAnswered(true);
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
  const hasQuestion = Boolean(question?.today?.question);
  const answered = hasQuestion && question!.today!.mine !== null;
  // The question waits to be answered or passed over; the day's step comes after it.
  const asking = hasQuestion && (reanswering || (!answered && !question!.skipped));
  const settled = Boolean(question?.loaded) && !asking;
  // In the afternoon, what became of the notes that were for today takes the step's place, once.
  const dueToday = featureOn('todos') && isLoaded('todos') ? todos.filter((t) => t.dueDate === today) : [];
  const wrapping = settled && wrapDue({ hour, mood: mine, done: dueToday.filter((t) => t.doneAt).length, open: dueToday.filter((t) => !t.doneAt).length, settled: wrapSeen === today });
  return (
    // Narrow: the mood and its sentence, the day's question, the day's step, «حال‌وهوای ما», then
    // «ماه من». Wide: the colleague's own side (the mood, the question, the step, «ماه من») in one
    // column and what came back («حال‌وهوای ما», the question's answers) beside it.
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
            {justAnswered && (
              <div className="mt-3">
                <MoodReasons mood={mine} chosen={answer?.reasons ?? []} />
              </div>
            )}
          </div>
        </div>

        {asking && (
          <div className="min-w-0 pt-4 border-t border-line @3xl:col-start-1">
            <DayQuestionAsk
              today={question!.today!}
              onSkip={answered ? () => setReanswering(false) : () => skipDayQuestion(userId, today)}
              skipLabel={answered ? 'انصراف' : undefined}
              onAnswered={() => setReanswering(false)}
            />
          </div>
        )}

        {/* Its wrapper is empty (and takes no room) on a day without a step, and until the question is settled */}
        <div className="min-w-0 empty:hidden pt-4 border-t border-line @3xl:col-start-1">
          {wrapping ? <DayWrap userId={userId} today={today} notes={dueToday} /> : settled && <DayStep mood={mine} />}
        </div>

        <div className="pt-4 border-t border-line min-w-0 space-y-4 @3xl:col-start-2 @3xl:row-start-1 @3xl:row-span-4 @3xl:pt-0 @3xl:border-t-0 @3xl:border-r @3xl:pr-8">
          <TeamMood refreshKey={`${today}:${mine}`} />
          {answered && !reanswering && (
            <div className="pt-4 border-t border-line">
              <DayQuestionResults today={question!.today!} onChange={() => setReanswering(true)} />
            </div>
          )}
          {hasQuestion && !answered && question!.skipped && (
            <p className="pt-4 border-t border-line text-xs text-muted leading-relaxed" data-testid="day-question-skipped">
              پرسش امروز: «{question!.today!.question!.text}»{' '}
              <button type="button" onClick={() => skipDayQuestion(userId, today, false)} className="font-bold text-brand-strong hover:underline">
                پاسخ می‌دهم
              </button>
            </p>
          )}
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
          <label className="flex items-center gap-2 text-[11px] text-muted cursor-pointer w-fit" data-testid="day-reminder">
            <input
              type="checkbox"
              checked={reminderTapped ?? Boolean(appSettings?.dayStartReminder)}
              onChange={(e) => {
                setReminderTapped(e.target.checked);
                void setDayStartReminder(e.target.checked).finally(() => setReminderTapped(null));
              }}
              className="w-3.5 h-3.5 accent-red-700"
            />
            <Bell className="w-3.5 h-3.5" />
            صبح‌های کاری «شروع روز» را یادآوری کن
          </label>
        </div>
      </div>
    </section>
  );
};
