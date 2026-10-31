import React, { useEffect, useMemo, useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import type { CalendarEvent, CalendarNote, PersonalTodo } from '../../types';
import { TodoFormModal } from '../todos/TodoFormModal';
import { Avatar } from '../common/Avatar';
import { formatDate, todayJalali, toPersianDigits } from '../../lib/jalali';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import moment from 'moment-jalaali';
import { Calendar, CalendarDays, Plus, Cake, Flag, ChevronRight, ChevronLeft, List, Settings } from 'lucide-react';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { dayOccasions, formatHijri, GREGORIAN_MONTHS, gregorianDate, HIJRI_MONTHS, hijriDate, holidayKey, occasionsFor } from '../../lib/occasions';
import { EventDetailsModal } from './EventDetailsModal';
import { EventFormModal } from './EventFormModal';
import { byTime, jalaliKey, timeRange, TypeIcon, TYPE_LABELS, typeChipClass } from './eventText';
import { WeekAgenda } from './WeekAgenda';

type View = 'month' | 'week';
type Selected = { kind: 'event'; id: string } | { kind: 'note'; note: CalendarNote } | null;

/** The Saturday that starts the Iranian week of this day. */
const weekOf = (day: moment.Moment) => day.clone().startOf('day').subtract((day.day() + 1) % 7, 'day');

// Phones get the week list first; the month grid needs a wide screen.
const initialView = (): View => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'week' : 'month');

const toggleClass = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-colors ${active ? 'bg-brand-strong text-white' : 'text-muted hover:bg-surface'}`;

export const CalendarModule: React.FC = () => {
  const { calendarEvents, can, employees, customHolidays, setCustomHoliday, removeCustomHoliday, focusId, myDueTodos } = usePortal();
  const [openTodo, setOpenTodo] = useState<PersonalTodo | null>(null);
  const isManager = can('calendar.manage');
  const [view, setView] = useState<View>(initialView);
  const [form, setForm] = useState<{ event?: CalendarEvent; date?: string } | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  // State for editing public holiday/event
  const [editingPublicDate, setEditingPublicDate] = useState<{year: number, month: number, day: number, title: string, isHoliday: boolean} | null>(null);
  const [publicTitle, setPublicTitle] = useState('');
  const [publicIsHoliday, setPublicIsHoliday] = useState(true);

  const [currentDate, setCurrentDate] = useState(() => moment());
  const [weekStart, setWeekStart] = useState(() => weekOf(moment()));
  const today = todayJalali();
  const thisWeek = weekOf(moment());

  const currentYear = currentDate.jYear();
  const currentMonth = currentDate.jMonth(); // 0 to 11

  const prevMonth = () => setCurrentDate(currentDate.clone().subtract(1, 'jMonth'));
  const nextMonth = () => setCurrentDate(currentDate.clone().add(1, 'jMonth'));
  const weekEnd = weekStart.clone().add(6, 'day');
  const weekTitle =
    weekStart.jMonth() === weekEnd.jMonth()
      ? `${toPersianDigits(weekStart.jDate())} تا ${toPersianDigits(weekEnd.jDate())} ${JALALI_MONTHS[weekEnd.jMonth()]} ${toPersianDigits(weekEnd.jYear())}`
      : `${toPersianDigits(weekStart.jDate())} ${JALALI_MONTHS[weekStart.jMonth()]} تا ${toPersianDigits(weekEnd.jDate())} ${JALALI_MONTHS[weekEnd.jMonth()]} ${toPersianDigits(weekEnd.jYear())}`;

  // An event linked from a notification, "my tasks" or the dashboard (#calendar/<id>): show its
  // month and week, and open it.
  const loaded = calendarEvents.length > 0;
  useEffect(() => {
    if (!focusId) return;
    const event = calendarEvents.find((e) => e.id === focusId);
    if (!event) return;
    const day = moment(event.date, 'jYYYY/jMM/jDD');
    setCurrentDate(day);
    setWeekStart(weekOf(day));
    setSelected({ kind: 'event', id: event.id });
    // Only when the link changes, not on every refresh of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loaded]);

  const selectedEvent = selected?.kind === 'event' ? calendarEvents.find((e) => e.id === selected.id) : undefined;
  const openEvent = (id: string) => setSelected({ kind: 'event', id });
  const openNote = (note: CalendarNote) => setSelected({ kind: 'note', note });

  const handleSavePublicEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPublicDate) {
      const { year, month, day } = editingPublicDate;
      const keyY = holidayKey(year, month + 1, day);
      const hasBuiltIn = occasionsFor(year, month + 1, day).length > 0;
      if (publicTitle.trim()) {
        await setCustomHoliday(keyY, publicTitle.trim(), publicIsHoliday);
      } else if (hasBuiltIn) {
        // An empty override hides the built-in occasion for this year.
        await setCustomHoliday(keyY, '', false);
      } else {
        await removeCustomHoliday(keyY);
      }
      setEditingPublicDate(null);
    }
  };

  const daysInMonth = moment.jDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = moment(`${currentYear}/${currentMonth + 1}/1`, 'jYYYY/jM/jD');
  const startDayOfWeek = (firstDayOfMonth.day() + 1) % 7; // 0 for Sat

  const days = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const getDayHolidays = (year: number, month: number, day: number) => dayOccasions(customHolidays, year, month + 1, day);

  // Hijri and Gregorian months the shown Jalali month spans, plus its occasions for the side list.
  const monthInfo = useMemo(() => {
    const first = hijriDate(currentYear, currentMonth + 1, 1);
    const last = hijriDate(currentYear, currentMonth + 1, daysInMonth);
    const gFirst = gregorianDate(currentYear, currentMonth + 1, 1);
    const gLast = gregorianDate(currentYear, currentMonth + 1, daysInMonth);
    const hijriLabel = first.month === last.month
      ? `${HIJRI_MONTHS[first.month - 1]} ${first.year}`
      : `${HIJRI_MONTHS[first.month - 1]}${first.year !== last.year ? ` ${first.year}` : ''} – ${HIJRI_MONTHS[last.month - 1]} ${last.year}`;
    const gregorianLabel = `${GREGORIAN_MONTHS[gFirst.month - 1]}${gFirst.year !== gLast.year ? ` ${gFirst.year}` : ''} – ${GREGORIAN_MONTHS[gLast.month - 1]} ${gLast.year}`;
    const list: { day: number; title: string; holiday: boolean; estimated: boolean }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const info = dayOccasions(customHolidays, currentYear, currentMonth + 1, day);
      const estimated = hijriDate(currentYear, currentMonth + 1, day).estimated;
      info?.items.forEach((o) => list.push({ day, title: o.title, holiday: o.holiday, estimated: estimated && o.kind === 'lunar' && !info.custom }));
    }
    return { hijriLabel: toPersianDigits(hijriLabel), gregorianLabel: toPersianDigits(gregorianLabel), list };
  }, [currentYear, currentMonth, daysInMonth, customHolidays]);

  const getDayEvents = (year: number, month: number, day: number) =>
    calendarEvents.filter((e) => e.date === jalaliKey(year, month, day)).sort(byTime);

  const getDayBirthdays = (month: number, day: number) => {
    const dateFormatted = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    return employees.filter(e => e.birthDay === dateFormatted);
  };

  const isToday = (year: number, month: number, day: number) => today === jalaliKey(year, month, day);

  const upcomingEvents = useMemo(
    () => calendarEvents.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [calendarEvents, today],
  );

  const todayBirthdays = useMemo(
    () => employees.filter((e) => e.isActive && e.birthDay === today.slice(5)),
    [employees, today],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-brand-deep text-white rounded-2xl shadow-lg">
          <Calendar className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-ink">تقویم سازمانی</h2>
          <p className="text-sm text-muted">مشاهده رویدادها، جلسات، آموزش‌ها و تولدها</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-3xl p-4 sm:p-6 border border-line/70 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                {isManager && (
                  <button
                    onClick={() => setForm({})}
                    className="px-5 py-3 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>افزودن رویداد جدید</span>
                  </button>
                )}
                <div className="flex items-center gap-1 bg-page border border-line p-1 rounded-2xl" role="group" aria-label="نمای تقویم">
                  <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')} className={toggleClass(view === 'month')}>
                    <CalendarDays className="w-4 h-4" /> ماه
                  </button>
                  <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')} className={toggleClass(view === 'week')}>
                    <List className="w-4 h-4" /> هفته
                  </button>
                </div>
              </div>

              {view === 'month' ? (
                <div className="flex items-center gap-4">
                  <button onClick={prevMonth} className="p-2 hover:bg-surface rounded-xl transition-colors text-right" title="ماه قبل" aria-label="ماه قبل">
                    <ChevronRight className="w-5 h-5 text-ink" />
                  </button>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-ink">
                      {JALALI_MONTHS[currentMonth]} {toPersianDigits(currentYear)}
                    </h3>
                    <p className="text-xs text-faint mt-0.5">{monthInfo.hijriLabel} · {monthInfo.gregorianLabel}</p>
                  </div>
                  <button onClick={nextMonth} className="p-2 hover:bg-surface rounded-xl transition-colors text-left" title="ماه بعد" aria-label="ماه بعد">
                    <ChevronLeft className="w-5 h-5 text-ink" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-4">
                  <button onClick={() => setWeekStart(weekStart.clone().subtract(7, 'day'))} className="p-2 hover:bg-surface rounded-xl transition-colors" title="هفتهٔ قبل" aria-label="هفتهٔ قبل">
                    <ChevronRight className="w-5 h-5 text-ink" />
                  </button>
                  <div className="text-center">
                    <h3 className="text-base sm:text-lg font-bold text-ink">{weekStart.isSame(thisWeek, 'day') ? 'این هفته' : 'هفتهٔ'} {weekTitle}</h3>
                    {!weekStart.isSame(thisWeek, 'day') && (
                      <button type="button" onClick={() => setWeekStart(thisWeek)} className="text-xs font-bold text-brand hover:underline">
                        برگشت به این هفته
                      </button>
                    )}
                  </div>
                  <button onClick={() => setWeekStart(weekStart.clone().add(7, 'day'))} className="p-2 hover:bg-surface rounded-xl transition-colors" title="هفتهٔ بعد" aria-label="هفتهٔ بعد">
                    <ChevronLeft className="w-5 h-5 text-ink" />
                  </button>
                </div>
              )}
            </div>

            {view === 'week' ? (
              <WeekAgenda start={weekStart} onOpenEvent={openEvent} onOpenNote={openNote} onOpenTodo={setOpenTodo} />
            ) : (
            <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {JALALI_WEEKDAYS.map(day => (
                  <div key={day} className="text-center text-xs font-bold text-faint py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {days.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`} className="h-28 rounded-2xl bg-page border border-transparent"></div>;
                  const isFri = (index % 7) === 6;
                  const dayDate = jalaliKey(currentYear, currentMonth, day);
                  const holidayObj = getDayHolidays(currentYear, currentMonth, day);
                  const isHoliday = holidayObj?.isHoliday;
                  const events = getDayEvents(currentYear, currentMonth, day);
                  const birthdays = getDayBirthdays(currentMonth, day).filter((b) => b.isActive);
                  const isDayOff = isFri || !!isHoliday;
                  const isTodayCell = isToday(currentYear, currentMonth, day);

                  return (
                    <div 
                      key={day} 
                      className={`h-28 overflow-hidden rounded-2xl border p-2 flex flex-col ${
                        isTodayCell ? 'border-brand bg-brand-soft shadow-sm' : 
                        isDayOff ? 'border-red-300 bg-brand-soft' : 
                        'border-line hover:border-line-strong bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-sm font-black ${isTodayCell ? 'text-brand' : isDayOff ? 'text-red-500' : 'text-ink'}`}>
                            {toPersianDigits(day)}
                          </span>
                          <span className="text-[10px] text-faint" title={formatHijri(currentYear, currentMonth + 1, day)}>
                            {toPersianDigits(hijriDate(currentYear, currentMonth + 1, day).day)}
                          </span>
                          <span className="text-[10px] text-subtle" dir="ltr">{gregorianDate(currentYear, currentMonth + 1, day).day}</span>
                        </div>
                        {isManager && (
                          <button 
                            onClick={(e) => {
                               e.stopPropagation();
                               setPublicTitle(holidayObj ? holidayObj.title : '');
                               setPublicIsHoliday(holidayObj ? holidayObj.isHoliday : false);
                               setEditingPublicDate({ year: currentYear, month: currentMonth, day, title: holidayObj?.title || '', isHoliday: holidayObj?.isHoliday ?? true });
                            }}
                            className="p-1 text-faint hover:text-brand transition-colors rounded-lg"
                            title="ویرایش مناسبت تقویمی"
                            aria-label={`ویرایش مناسبت ${toPersianDigits(day)} ${JALALI_MONTHS[currentMonth]}`}
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar">
                        {holidayObj?.items.map((occasion, i) => (
                          <div
                            key={i}
                            className={`text-[10px] font-bold px-1 py-0.5 rounded leading-tight cursor-pointer ${occasion.holiday ? 'text-brand bg-red-100' : 'text-orange-800 bg-orange-50'}`}
                            title={occasion.title}
                            onClick={() =>
                              openNote({
                                id: `hol-${dayDate}-${i}`,
                                title: occasion.title,
                                date: dayDate,
                                type: 'holiday',
                                description: `${occasion.holiday ? 'تعطیل رسمی' : 'مناسبت تقویم'} · ${formatHijri(currentYear, currentMonth + 1, day)}`,
                              })
                            }
                          >
                            {occasion.title}
                          </div>
                        ))}
                        {birthdays.map(b => (
                          <div 
                            key={b.id} 
                            onClick={() =>
                              openNote({
                                id: 'bday-' + b.id,
                                title: `تولد ${b.firstName} ${b.lastName}`,
                                date: dayDate,
                                type: 'birthday',
                                description: `تولد ${b.firstName} ${b.lastName} عزیز از واحد ${b.department}.`,
                              })
                            }
                            className="text-[10px] font-bold bg-pink-100 text-pink-700 px-1 py-0.5 rounded flex items-center gap-1 leading-tight truncate cursor-pointer" 
                            title={`تولد ${b.firstName} ${b.lastName}`}
                          >
                            <Cake className="w-2.5 h-2.5 shrink-0" />
                            تولد {b.firstName}
                          </div>
                        ))}

                        {events.map((e) => {
                          const waiting = e.rsvp && e.forMe && e.myRsvp === null && e.date >= today;
                          return (
                            <button
                              type="button"
                              key={e.id}
                              onClick={() => openEvent(e.id)}
                              className={`block w-full text-right text-[10px] font-bold px-1 py-0.5 rounded truncate leading-tight ${typeChipClass(e.type)} ${waiting ? 'ring-1 ring-amber-500' : ''}`}
                              title={[e.title, timeRange(e), waiting ? 'منتظر پاسخ شما' : ''].filter(Boolean).join(' · ')}
                            >
                              {e.time && <span className="font-normal">{toPersianDigits(e.time)} </span>}
                              {e.title}
                            </button>
                          );
                        })}
                        {/* The person's own notes due that day; nobody else sees them */}
                        {myDueTodos(dayDate).map((t) => (
                          <button
                            type="button"
                            key={t.id}
                            onClick={() => setOpenTodo(t)}
                            className="block w-full text-right text-[10px] font-bold px-1 py-0.5 rounded truncate leading-tight bg-sky-50 text-sky-800 border border-dashed border-sky-300"
                            title={`یادداشت من: ${t.title}`}
                          >
                            {t.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-5 border border-line/70 shadow-card">
            <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
              <Flag className="w-4 h-4 text-brand" />
              مناسبت‌های {JALALI_MONTHS[currentMonth]}
            </h3>
            {monthInfo.list.length > 0 ? (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {monthInfo.list.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                    <span className={`shrink-0 w-7 text-center font-black ${o.holiday ? 'text-brand' : 'text-muted'}`}>{toPersianDigits(o.day)}</span>
                    <span className={o.holiday ? 'font-bold text-brand' : 'text-ink'}>
                      {o.title}
                      {o.holiday && <span className="mr-1 text-xs font-normal">(تعطیل)</span>}
                      {o.estimated && <span className="mr-1 text-xs text-faint" title="تاریخ تقریبی">*</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted text-center py-4 bg-surface rounded-xl">مناسبتی در این ماه ثبت نشده است.</p>
            )}
            {monthInfo.list.some((o) => o.estimated) && (
              <p className="mt-3 text-xs text-faint leading-relaxed">
                * تقویم رسمی این سال هنوز در پرتال ثبت نشده و تاریخ مناسبت‌های قمری محاسبه‌ای است؛ ممکن است یک روز جابه‌جا باشد. مدیر تقویم می‌تواند هر روز را اصلاح کند.
              </p>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 border border-line/70 shadow-card">
            <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
              <Cake className="w-4 h-4 text-pink-500" />
              متولدین امروز
            </h3>
            {todayBirthdays.length > 0 ? (
              <div className="space-y-3">
                {todayBirthdays.map(emp => (
                  <div key={emp.id} className="flex items-center gap-3 p-3 bg-page border border-line rounded-xl">
                    <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-10 h-10 rounded-full text-xs" />
                    <div>
                      <div className="font-bold text-sm text-ink">{emp.firstName} {emp.lastName}</div>
                      <div className="text-xs text-muted">{emp.department} - {emp.position}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted text-center py-4 bg-surface rounded-xl">
                امروز تولد هیچ یک از همکاران نیست.
              </p>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 border border-line/70 shadow-card">
            <h3 className="text-sm font-bold text-ink mb-4">رویدادهای پیش‌رو</h3>
            {upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {upcomingEvents.map((e) => {
                  const waiting = e.rsvp && e.forMe && e.myRsvp === null;
                  return (
                    <button
                      type="button"
                      key={e.id}
                      onClick={() => openEvent(e.id)}
                      className="block w-full text-right p-3 border border-line rounded-xl bg-white hover:border-brand transition-colors group"
                    >
                      <span className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeChipClass(e.type)} flex items-center gap-1`}>
                          <TypeIcon type={e.type} className="w-3 h-3" /> {TYPE_LABELS[e.type]}
                        </span>
                        <span className="text-xs font-bold text-muted group-hover:text-brand transition-colors">{formatDate(e.date)}</span>
                      </span>
                      <span className="block text-xs font-bold text-ink leading-tight truncate">{e.title}</span>
                      {(e.time || waiting) && (
                        <span className="flex items-center justify-between gap-2 mt-1 text-xs text-muted">
                          <span>{timeRange(e)}</span>
                          {waiting && <span className="font-bold text-amber-700">منتظر پاسخ شما</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted text-center py-4 bg-surface rounded-xl">
                رویدادی برای نمایش وجود ندارد.
              </p>
            )}
          </div>
        </div>
      </div>

      {form && <EventFormModal event={form.event} date={form.date} onClose={() => setForm(null)} />}
      {openTodo && <TodoFormModal todo={openTodo} onClose={() => setOpenTodo(null)} />}

      {editingPublicDate && (
        <Modal
          title="ویرایش مناسبت تقویمی"
          subtitle={`تاریخ: ${toPersianDigits(editingPublicDate.day)} ${JALALI_MONTHS[editingPublicDate.month]} ${toPersianDigits(editingPublicDate.year)}`}
          icon={<Flag className="w-5 h-5" />}
          onClose={() => setEditingPublicDate(null)}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setEditingPublicDate(null)} className={secondaryButtonClass}>انصراف</button>
              <button type="submit" form="public-event" className={primaryButtonClass}>ذخیره</button>
            </>
          }
        >
          <form id="public-event" onSubmit={handleSavePublicEvent} className="space-y-4">
            <div>
              <label htmlFor="public-title" className={labelClass}>عنوان مناسبت (خالی بگذارید تا حذف شود)</label>
              <input id="public-title" type="text" value={publicTitle} onChange={(e) => setPublicTitle(e.target.value)} placeholder="مثال: روز پزشک" className={inputClass} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={publicIsHoliday}
                onChange={(e) => setPublicIsHoliday(e.target.checked)}
                className="w-4 h-4 accent-red-700"
              />
              <span className="font-bold text-ink">این روز تعطیل رسمی است</span>
            </label>
          </form>
        </Modal>
      )}

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setSelected(null);
            setForm({ event: selectedEvent });
          }}
        />
      )}

      {selected?.kind === 'note' && (
        <Modal
          title={selected.note.title}
          subtitle={formatDate(selected.note.date)}
          icon={<TypeIcon type={selected.note.type} />}
          onClose={() => setSelected(null)}
          size="sm"
        >
          <p className="text-sm text-muted leading-relaxed">{selected.note.description}</p>
        </Modal>
      )}
    </div>
  );
};
