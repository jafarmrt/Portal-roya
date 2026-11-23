import React, { useState } from 'react';
import moment from 'moment-jalaali';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { toPersianDigits } from '../../lib/jalali';
import type { Mood } from '../../../shared/mood';
import type { UserMood } from '../../types';
import { MOOD_LOOK, MOOD_ORDER } from './moodLook';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * «ماه من»: the colleague's own answers as a small month, this month and the one before (the portal
 * keeps the last sixty days at hand). Only they ever see it.
 */
export const MyMonth: React.FC<{ moods: UserMood[] }> = ({ moods }) => {
  const [back, setBack] = useState(0);
  const month = moment().startOf('jMonth').subtract(back, 'jMonth');
  const year = month.jYear();
  const monthIndex = month.jMonth();
  const days = moment.jDaysInMonth(year, monthIndex);
  // Saturday is the first column.
  const lead = (month.day() + 1) % 7;
  const byDate = new Map<string, Mood>(moods.map((m) => [m.date, m.mood]));
  const today = moment().format('jYYYY/jMM/jDD');
  const answered = Array.from({ length: days }, (_, i) => byDate.get(`${year}/${pad(monthIndex + 1)}/${pad(i + 1)}`)).filter(Boolean).length;

  return (
    <section aria-labelledby="my-month-title" className="space-y-2.5" data-testid="my-month">
      <div className="flex items-center justify-between">
        <h4 id="my-month-title" className="text-xs font-black text-ink-soft">
          ماه من: {JALALI_MONTHS[monthIndex]} {toPersianDigits(year)}
        </h4>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setBack(1)} disabled={back === 1} aria-label="ماه قبل" className="p-1 rounded-lg text-muted hover:bg-surface disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setBack(0)} disabled={back === 0} aria-label="این ماه" className="p-1 rounded-lg text-muted hover:bg-surface disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {JALALI_WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] text-faint" aria-hidden>{w.charAt(0)}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${year}/${pad(monthIndex + 1)}/${pad(i + 1)}`;
          const mood = byDate.get(date);
          const label = `${toPersianDigits(i + 1)} ${JALALI_MONTHS[monthIndex]}: ${mood ?? 'بدون پاسخ'}`;
          return (
            <span
              key={date}
              title={label}
              aria-label={label}
              className={`aspect-square rounded-lg text-[11px] font-bold flex items-center justify-center ${mood ? MOOD_LOOK[mood].cell : 'text-subtle'} ${date === today ? 'ring-2 ring-brand ring-offset-1' : ''}`}
            >
              {toPersianDigits(i + 1)}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {MOOD_ORDER.map((m) => (
          <span key={m} className="flex items-center gap-1 text-[10px] text-muted">
            <span className={`w-2.5 h-2.5 rounded-sm ${MOOD_LOOK[m].cell}`} />
            {m}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-faint">
        {answered > 0 ? `${toPersianDigits(answered)} روز از این ماه را ثبت کرده‌اید. این صفحه را فقط خودتان می‌بینید.` : 'در این ماه چیزی ثبت نشده است. این صفحه را فقط خودتان می‌بینید.'}
      </p>
    </section>
  );
};
