import React, { useEffect, useState } from 'react';
import { CalendarRange, ClipboardCheck, HandHeart, Lock, NotebookPen, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api } from '../../lib/api';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { toPersianDigits, todayJalali } from '../../lib/jalali';
import { previousWeek, type MyWeek } from '../../../shared/dayWeek';
import { MOOD_LOOK } from './moodLook';
import { markSeen, useSeen } from './seenStore';

const fa = toPersianDigits;
/** '1405/09/07' → '۷ آذر'. */
const dayLabel = (date: string) => `${fa(Number(date.slice(8, 10)))} ${JALALI_MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** The name the closed week is remembered under (see seenStore). */
const WEEK_SEEN = 'week';

/**
 * «هفتهٔ من»: the colleague's own last week in the portal, on the first visit of a new week and until
 * they close it. Only they ever see it. A week with nothing in it brings no card: nobody is told they
 * did nothing.
 */
export const MyWeekCard: React.FC = () => {
  const { currentUser, setActiveTab } = usePortal();
  const userId = currentUser?.id ?? '';
  const last = previousWeek(todayJalali());
  const seen = useSeen(userId, WEEK_SEEN);
  const [week, setWeek] = useState<MyWeek | null>(null);
  const due = Boolean(userId) && seen !== last.from;

  useEffect(() => {
    if (!due) return;
    let gone = false;
    api
      .get<{ week: MyWeek | null }>('/api/moods/week')
      .then(({ week: mine }) => {
        if (gone) return;
        // Nothing to show: not asked for again this week.
        if (!mine) markSeen(userId, WEEK_SEEN, last.from);
        else setWeek(mine);
      })
      // Not worth an error message; the next visit asks again.
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [due, userId, last.from]);

  if (!due || !week || week.from !== last.from) return null;

  const lines: { icon: React.ReactNode; text: string; tab: Parameters<typeof setActiveTab>[0] }[] = [];
  if (week.notesDone) lines.push({ icon: <NotebookPen className="w-4 h-4" />, text: `${fa(week.notesDone)} یادداشت را بستید`, tab: 'todos' });
  if (week.tasksDone) lines.push({ icon: <ClipboardCheck className="w-4 h-4" />, text: `${fa(week.tasksDone)} کار ارجاعی را تمام کردید`, tab: 'tasks' });
  if (week.given || week.received) {
    const parts = [week.given ? `${fa(week.given)} قدردانی دادید` : '', week.received ? `${fa(week.received)} قدردانی گرفتید` : ''].filter(Boolean);
    lines.push({ icon: <HandHeart className="w-4 h-4" />, text: parts.join(' و '), tab: 'thanks' });
  }
  const anyMood = week.moods.some((m) => m !== null);

  return (
    <section aria-labelledby="my-week-title" className="bg-white rounded-3xl p-5 sm:p-6 border border-line/70 shadow-card space-y-4" dir="rtl" data-testid="my-week">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-brand-soft text-brand-strong rounded-xl shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 id="my-week-title" className="text-sm font-black text-ink-strong">هفتهٔ گذشتهٔ شما</h3>
            <p className="text-xs text-muted">
              {dayLabel(week.from)} تا {dayLabel(week.to)}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => markSeen(userId, WEEK_SEEN, week.from)} aria-label="بستن هفتهٔ گذشتهٔ شما" className="p-2 -m-1 text-faint hover:text-ink rounded-xl hover:bg-surface shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {lines.length > 0 && (
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {lines.map((line) => (
              <li key={line.text}>
                <button type="button" onClick={() => setActiveTab(line.tab)} className="flex items-center gap-2 text-xs font-bold text-ink hover:text-brand-strong text-right">
                  <span className="text-brand-strong shrink-0">{line.icon}</span>
                  {line.text}
                </button>
              </li>
            ))}
          </ul>
        )}
        {anyMood && (
          <ul className="flex items-center gap-2 shrink-0" aria-label="حال شما در روزهای هفتهٔ گذشته">
            {week.moods.map((mood, i) => {
              const look = mood ? MOOD_LOOK[mood] : null;
              const Icon = look?.icon;
              const label = `${JALALI_WEEKDAYS[i]}: ${mood ?? 'ثبت نشده'}`;
              return (
                <li key={i} className="flex flex-col items-center gap-1" title={label} aria-label={label}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center ${look ? look.chip : 'bg-surface text-faint'}`}>
                    {Icon ? <Icon className="w-4 h-4" /> : <span className="w-1.5 h-1.5 rounded-full bg-line-strong" />}
                  </span>
                  <span className="text-[10px] leading-none text-faint">{JALALI_WEEKDAYS[i].charAt(0)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-faint flex items-center gap-1">
        <Lock className="w-3 h-3" /> فقط خودتان این را می‌بینید.
      </p>
    </section>
  );
};
