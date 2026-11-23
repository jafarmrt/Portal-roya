import React, { useEffect, useState } from 'react';
import moment from 'moment-jalaali';
import { Users } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { JALALI_WEEKDAYS } from '../../data/holidays';
import { teamLine, type MoodTeam } from '../../../shared/mood';

const weekdayOf = (date: string) => JALALI_WEEKDAYS[(moment(date, 'jYYYY/jMM/jDD').day() + 1) % 7];

/**
 * «حال‌وهوای ما»: what comes back after answering. One sentence about today and a small chart of the
 * week, in shares only; a day with too few answers shows no number at all.
 */
export const TeamMood: React.FC<{ refreshKey: string }> = ({ refreshKey }) => {
  const [team, setTeam] = useState<MoodTeam | null>(null);
  useEffect(() => {
    let gone = false;
    api
      .get<MoodTeam>('/api/moods/team')
      .then((value) => !gone && setTeam(value))
      // The card is just as useful without it; the next answer or visit asks again.
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [refreshKey]);

  if (!team) return <div className="h-[92px]" aria-hidden />;

  return (
    <section aria-labelledby="team-mood-title" className="space-y-2.5" data-testid="team-mood">
      <div className="flex items-center gap-2 text-ink-soft">
        <Users className="w-4 h-4" />
        <h4 id="team-mood-title" className="text-xs font-black">حال‌وهوای ما</h4>
      </div>
      <p className="text-sm font-bold text-ink leading-relaxed">
        {toPersianDigits(teamLine(team))}
        {team.answers !== null && <span className="font-medium text-faint"> ({toPersianDigits(team.answers)} پاسخ تا این لحظه)</span>}
      </p>
      <ul className="flex items-end gap-1.5 h-14 max-w-sm" aria-label="سهم حال خوب در هفت روز اخیر">
        {team.days.map((day) => {
          const isToday = day.date === team.date;
          const label = `${weekdayOf(day.date)}: ${day.good === null ? 'پاسخ کافی نبود' : `${toPersianDigits(day.good)}٪ خوب یا عالی`}`;
          return (
            <li key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={label} aria-label={label}>
              {day.good === null ? (
                <span className="w-full h-1 rounded-full bg-line" />
              ) : (
                <span
                  className={`w-full rounded-md ${isToday ? 'bg-brand' : 'bg-brand/30'}`}
                  // Never a bar too short to see: a day with answers and nobody well still shows.
                  style={{ height: `${Math.max(8, Math.round(day.good * 0.36))}px` }}
                />
              )}
              <span className={`text-[10px] leading-none ${isToday ? 'font-black text-brand-strong' : 'text-faint'}`}>{weekdayOf(day.date).charAt(0)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
