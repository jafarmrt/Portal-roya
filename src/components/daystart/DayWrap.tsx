import React, { useEffect, useState } from 'react';
import { Sunset } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { wrapLine } from '../../../shared/dayWeek';
import { addJalaliDays } from '../../../shared/todos';
import type { PersonalTodo } from '../../types';
import { markSeen } from './seenStore';
import { countStep } from './stepStore';

const primary = 'px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50';
const quiet = 'px-2.5 py-1 rounded-lg border border-line bg-white hover:bg-surface text-[11px] font-bold text-ink-soft transition-colors disabled:opacity-50';

/** The name the wrap-up's day is remembered under (see seenStore). */
export const WRAP_SEEN = 'wrap';

/**
 * «جمع‌بندی روز»: in the afternoon, what became of the notes that were for today, and one tap to
 * take the open ones to tomorrow. Once a day; «نه، بماند» closes it. Counted like a step, without a name.
 */
export const DayWrap: React.FC<{ userId: string; today: string; notes: PersonalTodo[] }> = ({ userId, today, notes }) => {
  const { updateTodo } = usePortal();
  const [busy, setBusy] = useState(false);
  const done = notes.filter((n) => n.doneAt).length;
  const open = notes.filter((n) => !n.doneAt);

  useEffect(() => countStep('wrap', 'shown', today), [today]);

  const settle = (outcome: 'done' | 'closed') => {
    countStep('wrap', outcome, today);
    markSeen(userId, WRAP_SEEN, today);
  };
  const toTomorrow = async () => {
    setBusy(true);
    const tomorrow = addJalaliDays(today, 1);
    let count = 0;
    for (const note of open) if (await updateTodo(note.id, { dueDate: tomorrow })) count += 1;
    setBusy(false);
    if (count === 0) return;
    toast.success(count === 1 ? 'یادداشت به فردا رفت.' : `${toPersianDigits(count)} یادداشت به فردا رفت.`);
    settle('done');
  };

  return (
    <section aria-labelledby="day-wrap-title" className="space-y-2.5" data-testid="day-wrap">
      <div className="flex items-center gap-2 text-ink-soft">
        <Sunset className="w-4 h-4" />
        <h4 id="day-wrap-title" className="text-xs font-black">جمع‌بندی روز</h4>
      </div>
      <p className="text-xs font-bold text-ink leading-relaxed">{wrapLine(done, open.length, toPersianDigits)}</p>
      {open.length > 0 && (
        <ul className="space-y-1">
          {open.slice(0, 3).map((n) => (
            <li key={n.id} className="text-xs text-ink-soft truncate">{n.title}</li>
          ))}
          {open.length > 3 && <li className="text-[11px] text-faint">و {toPersianDigits(open.length - 3)} مورد دیگر</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {open.length > 0 ? (
          <>
            <button type="button" disabled={busy} onClick={() => void toTomorrow()} className={primary}>
              ببر به فردا
            </button>
            <button type="button" disabled={busy} onClick={() => settle('closed')} className={quiet}>
              نه، بماند
            </button>
          </>
        ) : (
          <button type="button" onClick={() => settle('done')} className={quiet}>
            بستن
          </button>
        )}
      </div>
    </section>
  );
};
