import React from 'react';
import moment from 'moment-jalaali';
import { Cake, MapPin, NotebookPen } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { todayJalali, toPersianDigits } from '../../lib/jalali';
import { dayOccasions, formatHijri } from '../../lib/occasions';
import type { CalendarEvent, CalendarNote, PersonalTodo } from '../../types';
import { byTime, timeRange, TypeIcon, TYPE_LABELS, typeChipClass } from './eventText';

const rowClass = 'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right hover:bg-surface transition-colors';

const RsvpState: React.FC<{ event: CalendarEvent; past: boolean }> = ({ event, past }) => {
  if (!event.rsvp || !event.forMe) return null;
  if (event.myRsvp === null)
    return past ? null : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">منتظر پاسخ شما</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${event.myRsvp ? 'bg-emerald-100 text-emerald-800' : 'bg-surface text-muted'}`}>
      {event.myRsvp ? 'شرکت می‌کنید' : 'شرکت نمی‌کنید'}
    </span>
  );
};

/**
 * Seven days from `start` as a list (on the calendar page Saturday to Friday): each day's occasions,
 * colleagues' birthdays and events in order of time, and the person's own notes due that day. Easier
 * to read than the month grid, above all on a phone.
 *
 * `compact` (the dashboard) leaves out past days and days with nothing on them, except today.
 */
export const WeekAgenda: React.FC<{
  start: moment.Moment;
  onOpenEvent: (id: string) => void;
  onOpenNote: (note: CalendarNote) => void;
  onOpenTodo: (todo: PersonalTodo) => void;
  compact?: boolean;
  label?: string;
}> = ({ start, onOpenEvent, onOpenNote, onOpenTodo, compact, label = 'برنامهٔ هفته' }) => {
  const { calendarEvents, employees, customHolidays, myDueTodos } = usePortal();
  const today = todayJalali();

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = start.clone().add(i, 'day');
    const key = day.format('jYYYY/jMM/jDD');
    const [jy, jm, jd] = [day.jYear(), day.jMonth() + 1, day.jDate()];
    const occasions = dayOccasions(customHolidays, jy, jm, jd);
    const weekday = (day.day() + 1) % 7; // 0 = Saturday … 6 = Friday
    return {
      key,
      label: `${JALALI_WEEKDAYS[weekday]} ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]}`,
      hijri: formatHijri(jy, jm, jd),
      dayOff: weekday === 6 || Boolean(occasions?.isHoliday),
      occasions: occasions?.items ?? [],
      birthdays: employees.filter((e) => e.isActive && e.birthDay === key.slice(5)),
      events: calendarEvents.filter((e) => e.date === key).sort(byTime),
      todos: myDueTodos(key),
    };
  });

  const isEmpty = (day: (typeof days)[number]) => day.occasions.length + day.birthdays.length + day.events.length + day.todos.length === 0;
  const shown = compact ? days.filter((d) => d.key === today || (d.key > today && !isEmpty(d))) : days;
  const restEmpty = compact && shown.every((d) => d.key === today);

  return (
    <ol className={compact ? 'space-y-2' : 'space-y-3'} aria-label={label}>
      {shown.map((day) => {
        const isToday = day.key === today;
        const past = day.key < today;
        const empty = isEmpty(day);
        return (
          <li
            key={day.key}
            aria-current={isToday ? 'date' : undefined}
            className={`rounded-2xl border ${compact ? 'p-2.5' : 'p-3'} ${isToday ? 'border-brand bg-brand-soft' : compact ? 'border-line/70 bg-surface-soft' : 'border-line bg-white'} ${past ? 'opacity-70' : ''}`}
          >
            <h4 className="flex flex-wrap items-baseline gap-2 px-1 mb-1">
              <span className={`text-sm font-black ${day.dayOff ? 'text-brand' : 'text-ink'}`}>{day.label}</span>
              {isToday && <span className="text-xs font-bold text-white bg-brand px-2 py-0.5 rounded-full">امروز</span>}
              <span className="text-xs text-faint">{day.hijri}</span>
            </h4>
            {empty ? (
              <p className="px-1 text-xs text-subtle">{compact && isToday ? 'امروز برنامه‌ای در تقویم نیست.' : 'برنامه‌ای ثبت نشده است.'}</p>
            ) : (
              <ul className="space-y-0.5">
                {day.occasions.map((o, i) => (
                  <li key={`o${i}`}>
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() =>
                        onOpenNote({ id: `hol-${day.key}-${i}`, title: o.title, date: day.key, type: 'holiday', description: `${o.holiday ? 'تعطیل رسمی' : 'مناسبت تقویم'} · ${day.hijri}` })
                      }
                    >
                      <TypeIcon type="holiday" className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className={`text-xs ${o.holiday ? 'font-bold text-brand' : 'text-orange-800'}`}>
                        {o.title}
                        {o.holiday && <span className="mr-1 font-normal">(تعطیل)</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {day.birthdays.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() =>
                        onOpenNote({ id: `bday-${b.id}`, title: `تولد ${b.firstName} ${b.lastName}`, date: day.key, type: 'birthday', description: `تولد ${b.firstName} ${b.lastName} عزیز از واحد ${b.department}.` })
                      }
                    >
                      <Cake className="w-4 h-4 mt-0.5 shrink-0 text-pink-500" />
                      <span className="text-xs text-pink-700">
                        تولد {b.firstName} {b.lastName}
                      </span>
                    </button>
                  </li>
                ))}
                {day.events.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={rowClass} onClick={() => onOpenEvent(e.id)}>
                      <TypeIcon type={e.type} className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="flex-1 min-w-0 space-y-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-ink">{e.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${typeChipClass(e.type)}`}>{TYPE_LABELS[e.type]}</span>
                          <RsvpState event={e} past={past} />
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                          <span>{timeRange(e) || 'تمام روز'}</span>
                          {e.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {e.location}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {day.todos.map((t) => (
                  <li key={t.id}>
                    <button type="button" className={rowClass} onClick={() => onOpenTodo(t)}>
                      <NotebookPen className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-sky-900">{t.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800">یادداشت من</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      {restEmpty && <li className="px-2 text-xs text-subtle">در روزهای پیش رو هم برنامه‌ای ثبت نشده است.</li>}
    </ol>
  );
};
