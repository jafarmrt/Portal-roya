import React from 'react';
import { CalendarClock, Check, CheckCircle2, Circle } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits, todayJalali } from '../../lib/jalali';
import { haptic } from '../../lib/feedback';
import { shortDue } from '../todos/todoText';
import { taskOpen } from '../../../shared/tasks';
import { useAnswerTask } from './useAnswerTask';

/** Rows shown before the rest are behind «همه در کارهای ارجاعی». */
const SHOWN = 4;

/**
 * On the «یادداشت‌های من» card: the unfinished work colleagues handed to this person, labelled
 * «ارجاعی» so it never mixes with the private notes. A new one is accepted here; an accepted one is
 * ticked off here (with «برگردان» for a few seconds); tapping the title opens that task on the
 * «کارهای ارجاعی» page. The title has a line of its own so it stays readable on a narrow phone.
 */
export const AssignedTasksStrip: React.FC = () => {
  const { tasks, featureOn, answerTask, setActiveTab } = usePortal();
  const answer = useAnswerTask();
  if (!featureOn('tasks')) return null;
  const today = todayJalali();
  const open = tasks.mine
    .filter((t) => taskOpen(t.status))
    .sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new') || a.dueDate.localeCompare(b.dueDate));
  if (open.length === 0) return null;

  return (
    <div role="group" aria-label="کارهای ارجاعی به من" className="space-y-1">
      <h3 className="text-xs font-black text-violet-800 flex flex-wrap items-center gap-x-1">
        سپرده‌شده به شما <span className="font-bold">({toPersianDigits(open.length)})</span>
        <span className="font-normal text-faint">· سپارنده هم می‌بیند</span>
      </h3>
      <ul className="space-y-1">
        {open.slice(0, SHOWN).map((t) => {
          const late = t.dueDate < today;
          const isNew = t.status === 'new';
          return (
            <li key={t.id} className={`rounded-xl border px-1.5 py-1 flex items-start gap-1 ${late ? 'bg-red-50 border-red-200' : 'bg-violet-50/60 border-violet-200'}`}>
              {isNew ? (
                // Not a checkbox: a new task is accepted first (button on the left), then ticked off.
                <span className="w-[26px] h-[26px] shrink-0 flex items-center justify-center" title="تازه" aria-hidden="true">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                </span>
              ) : (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`انجام شد: ${t.title}`}
                  onClick={() => {
                    haptic();
                    void answer(t, 'done');
                  }}
                  className="p-1 rounded-lg hover:bg-white shrink-0"
                >
                  <Circle className="w-[18px] h-[18px] text-violet-500" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('tasks', t.groupId)}
                  className="block w-full text-right py-0.5 hover:underline"
                  title={`${t.title}\nاز ${t.from.name}`}
                >
                  <span className="line-clamp-2 break-words text-xs font-bold text-ink">
                    {isNew && <span className="sr-only">تازه: </span>}
                    {t.title}
                  </span>
                </button>
                <p className="flex items-center gap-1 text-[11px] min-w-0">
                  <span className="px-1.5 rounded-full bg-violet-100 text-violet-800 font-bold shrink-0">ارجاعی</span>
                  <span className="text-muted truncate">از {t.from.name}</span>
                  {/* An icon, not «·», before the date: next to Persian digits a dot reads as ۰ (۱۴۰ آبان). */}
                  <span className={`whitespace-nowrap shrink-0 flex items-center gap-0.5 ${late ? 'text-red-700 font-bold' : t.dueDate === today ? 'text-amber-800 font-bold' : 'text-muted'}`}>
                    <CalendarClock className="w-3 h-3" aria-hidden="true" />
                    {shortDue(t.dueDate, today)}
                  </span>
                </p>
              </div>
              {isNew && (
                <button
                  type="button"
                  onClick={() => void answerTask(t.id, 'accepted')}
                  aria-label={`پذیرفتن ${t.title}`}
                  title="می‌پذیرم"
                  className="self-center px-1.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-violet-300 text-violet-800 hover:bg-violet-100 flex items-center gap-0.5 shrink-0"
                >
                  <Check className="w-3 h-3" /> می‌پذیرم
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setActiveTab('tasks')} className="tap-area text-xs font-bold text-violet-800 hover:underline flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {open.length > SHOWN ? `همه در «کارهای ارجاعی» (${toPersianDigits(open.length)})` : 'رد کردن، توضیح و جزئیات در «کارهای ارجاعی»'}
      </button>
    </div>
  );
};
