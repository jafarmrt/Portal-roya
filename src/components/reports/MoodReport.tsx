import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import moment from 'moment-jalaali';
import { Activity } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import type { MoodState, MoodSummaryRow } from '../../types';
import { cardClass, SectionTitle } from './reportUi';

type Range = 'daily' | 'weekly' | 'monthly';
const RANGE_DAYS: Record<Range, number> = { daily: 1, weekly: 7, monthly: 30 };
const RANGE_LABELS: Record<Range, string> = { daily: 'امروز', weekly: '۷ روز اخیر', monthly: '۳۰ روز اخیر' };

const MOODS: { name: MoodState; color: string }[] = [
  { name: 'خیلی بد', color: '#f87171' },
  { name: 'بد', color: '#fca5a5' },
  { name: 'معمولی', color: '#d4d4d8' },
  { name: 'خوب', color: '#991b1b' },
  { name: 'عالی', color: '#dc2626' },
];

/** The anonymous daily mood answers, added up; nobody's own answer is ever shown. */
export const MoodReport: React.FC = () => {
  const [rows, setRows] = useState<MoodSummaryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('weekly');

  useEffect(() => {
    api
      .get<MoodSummaryRow[]>('/api/moods/summary')
      .then(setRows)
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const { data, total } = useMemo(() => {
    const since = moment().subtract(RANGE_DAYS[range] - 1, 'days').format('jYYYY/jMM/jDD');
    const counts = new Map<MoodState, number>();
    for (const row of rows) {
      if (row.date >= since) counts.set(row.mood, (counts.get(row.mood) ?? 0) + row.count);
    }
    const chart = MOODS.map((m) => ({ ...m, count: counts.get(m.name) ?? 0 }));
    return { data: chart, total: chart.reduce((sum, m) => sum + m.count, 0) };
  }, [rows, range]);

  return (
    <section aria-labelledby="mood-title" className={cardClass}>
      <SectionTitle
        id="mood-title"
        icon={<Activity className="w-5 h-5" />}
        title="حال‌وهوای سازمان"
        hint={`جمع پاسخ‌های بی‌نام همکاران در ${RANGE_LABELS[range]} (${toPersianDigits(total)} پاسخ)`}
        action={
          <div className="flex bg-[#F5F2ED] rounded-xl p-1 border border-[#E6E0D5] w-fit" role="group" aria-label="بازهٔ حال‌وهوا">
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${range === r ? 'bg-white text-[#dc2626] shadow-sm' : 'text-[#8C867A] hover:text-[#2D2D2D]'}`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        }
      />
      {loadError ? (
        <p role="alert" className="text-xs text-red-700">{loadError}</p>
      ) : (
        <div className="h-64 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6e6a60' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6e6a60' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#f5f2ed' }}
                formatter={(value) => [toPersianDigits(String(value)), 'تعداد']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5', fontSize: '12px', textAlign: 'right' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
