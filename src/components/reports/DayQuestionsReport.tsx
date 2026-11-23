import React, { useEffect, useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { questionResults, themeLabel } from '../../../shared/dayQuestion';
import { cardClass, SectionTitle } from './reportUi';

interface AskedDay {
  date: string;
  text: string;
  theme: string;
  options: string[];
  counts: number[];
}

/** How many questions are listed before «نمایش همه». */
const SHOWN = 6;

/**
 * «پرسش روز» for managers: what colleagues answered to each day's question in the last 30 days, as
 * shares. Nobody's own answer is shown, and the server leaves out a day with too few answers.
 */
export const DayQuestionsReport: React.FC = () => {
  const [days, setDays] = useState<AskedDay[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    api
      .get<AskedDay[]>('/api/moods/questions/results')
      .then(setDays)
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  // Nothing to show before «شروع روز» has asked anyone anything.
  if (!loadError && (!days || days.length === 0)) return null;

  return (
    <section aria-labelledby="day-questions-title" className={cardClass} data-testid="day-questions-report">
      <SectionTitle id="day-questions-title" icon={<MessageCircleQuestion className="w-5 h-5" />} title="پرسش‌های روز" hint="پاسخ بی‌نام همکاران به پرسش هر روز در ۳۰ روز اخیر" />
      {loadError ? (
        <p role="alert" className="text-xs text-danger-700">{loadError}</p>
      ) : (
        <>
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(all ? days! : days!.slice(0, SHOWN)).map((day) => {
              const results = questionResults(day.counts);
              return (
                <li key={day.date} className="rounded-2xl bg-surface p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-ink leading-relaxed">{day.text}</p>
                    <span className="shrink-0 text-[11px] text-faint whitespace-nowrap tabular-nums">{toPersianDigits(day.date)}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {day.options.map((option, i) => (
                      <li key={option} className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-soft truncate">{option}</span>
                          <span className="tabular-nums text-muted shrink-0">
                            {toPersianDigits(results?.shares[i] ?? 0)}٪ <span className="text-faint">({toPersianDigits(day.counts[i])})</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-white overflow-hidden" aria-hidden>
                          <div className="h-full rounded-full bg-brand/60" style={{ width: `${results?.shares[i] ?? 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-faint">
                    {themeLabel(day.theme)} · {toPersianDigits(results?.answers ?? 0)} پاسخ
                  </p>
                </li>
              );
            })}
          </ul>
          {days!.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-bold text-brand-strong hover:underline">
              {all ? 'نمایش کمتر' : `نمایش همه (${toPersianDigits(days!.length)})`}
            </button>
          )}
        </>
      )}
    </section>
  );
};
