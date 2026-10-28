import React from 'react';
import moment from 'moment-jalaali';
import { Cake, MapPin, NotebookPen } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { todayJalali, toPersianDigits } from '../../lib/jalali';
import { dayOccasions, formatHijri } from '../../lib/occasions';
import type { CalendarEvent, CalendarNote, PersonalTodo } from '../../types';
import { byTime, timeRange, TypeIcon, TYPE_LABELS, typeChipClass } from './eventText';

const rowClass = 'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right hover:bg-[#F5F2ED] transition-colors';

const RsvpState: React.FC<{ event: CalendarEvent; past: boolean }> = ({ event, past }) => {
  if (!event.rsvp || !event.forMe) return null;
  if (event.myRsvp === null)
    return past ? null : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">منتظر پاسخ شما</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${event.myRsvp ? 'bg-emerald-100 text-emerald-800' : 'bg-[#F5F2ED] text-[#6E6A60]'}`}>
      {event.myRsvp ? 'شرکت می‌کنید' : 'شرکت نمی‌کنید'}
    </span>
  );
};

/**
 * The week from Saturday to Friday as a list: each day's occasions, colleagues' birthdays and
 * events in order of time, and the person's own notes due that day. Easier to read than the month
 * grid, above all on a phone.
 */
export const WeekAgenda: React.FC<{
  start: moment.Moment;
  onOpenEvent: (id: string) => void;
  onOpenNote: (note: CalendarNote) => void;
  onOpenTodo: (todo: PersonalTodo) => void;
}> = ({ start, onOpenEvent, onOpenNote, onOpenTodo }) => {
  const { calendarEvents, employees, customHolidays, myDueTodos } = usePortal();
  const today = todayJalali();

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = start.clone().add(i, 'day');
    const key = day.format('jYYYY/jMM/jDD');
    const [jy, jm, jd] = [day.jYear(), day.jMonth() + 1, day.jDate()];
    const occasions = dayOccasions(customHolidays, jy, jm, jd);
    return {
      key,
      label: `${JALALI_WEEKDAYS[i]} ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]}`,
      hijri: formatHijri(jy, jm, jd),
      dayOff: i === 6 || Boolean(occasions?.isHoliday),
      occasions: occasions?.items ?? [],
      birthdays: employees.filter((e) => e.isActive && e.birthDay === key.slice(5)),
      events: calendarEvents.filter((e) => e.date === key).sort(byTime),
      todos: myDueTodos(key),
    };
  });

  return (
    <ol className="space-y-3" aria-label="برنامهٔ هفته">
      {days.map((day) => {
        const isToday = day.key === today;
        const past = day.key < today;
        const empty = day.occasions.length + day.birthdays.length + day.events.length + day.todos.length === 0;
        return (
          <li
            key={day.key}
            aria-current={isToday ? 'date' : undefined}
            className={`rounded-2xl border p-3 ${isToday ? 'border-[#dc2626] bg-[#fef2f2]' : 'border-[#E6E0D5] bg-white'} ${past ? 'opacity-70' : ''}`}
          >
            <h4 className="flex flex-wrap items-baseline gap-2 px-1 mb-1">
              <span className={`text-sm font-black ${day.dayOff ? 'text-[#dc2626]' : 'text-[#2D2D2D]'}`}>{day.label}</span>
              {isToday && <span className="text-[10px] font-bold text-white bg-[#dc2626] px-2 py-0.5 rounded-full">امروز</span>}
              <span className="text-[10px] text-[#8C867A]">{day.hijri}</span>
            </h4>
            {empty ? (
              <p className="px-1 text-[11px] text-[#B5AFA3]">برنامه‌ای ثبت نشده است.</p>
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
                      <span className={`text-xs ${o.holiday ? 'font-bold text-[#dc2626]' : 'text-[#9a3412]'}`}>
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
                          <span className="text-xs font-bold text-[#2D2D2D]">{e.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeChipClass(e.type)}`}>{TYPE_LABELS[e.type]}</span>
                          <RsvpState event={e} past={past} />
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-[#6E6A60]">
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">یادداشت من</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
};
