import React from 'react';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { todayJalali } from '../../lib/jalali';
import { quickDueDates } from '../../../shared/todos';

/** A row of one-tap due dates: today, tomorrow, the end of the working week, a week from today. */
export const QuickDueDates: React.FC<{ value: string; onPick: (date: string) => void; only?: string[] }> = ({ value, onPick, only }) => (
  <div className="flex flex-wrap gap-1.5" role="group" aria-label="تاریخ‌های آماده">
    {quickDueDates(todayJalali())
      .filter((d) => !only || only.includes(d.id))
      .map((d) => (
        <button
          key={d.id}
          type="button"
          aria-pressed={value === d.date}
          onClick={() => onPick(d.date)}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-full border transition-colors ${
            value === d.date ? 'bg-sky-700 border-sky-700 text-white' : 'bg-white border-[#E6E0D5] text-[#4B4740] hover:border-sky-600'
          }`}
        >
          {d.label}
        </button>
      ))}
  </div>
);

/** The required due date of a note: the quick buttons, or any day from the picker. */
export const DueDateField: React.FC<{ id?: string; value: string; onChange: (date: string) => void }> = ({ id, value, onChange }) => (
  <div className="space-y-1.5">
    <QuickDueDates value={value} onPick={onChange} />
    <JalaliDateInput id={id} value={value} onChange={onChange} required placeholder="یا یک روز دیگر" />
  </div>
);
