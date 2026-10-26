import React, { useState, useMemo } from 'react';
import { usePortal } from '../../context/PortalContext';
import type { CalendarEvent } from '../../types';
import { Avatar } from '../common/Avatar';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { formatDate, todayJalali, toPersianDigits } from '../../lib/jalali';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import moment from 'moment-jalaali';
import {
  Calendar,
  Plus,
  Cake,
  GraduationCap,
  Flag,
  ChevronRight,
  ChevronLeft,
  Settings,
  Users,
  Video,
  Sparkles,
  Trash2
} from 'lucide-react';
import { IRANIAN_HOLIDAYS, JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';

export const CalendarModule: React.FC = () => {
  const { calendarEvents, addCalendarEvent, deleteCalendarEvent, can, employees, customHolidays, setCustomHoliday, removeCustomHoliday } = usePortal();
  const isManager = can('calendar.manage');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  // State for editing public holiday/event
  const [editingPublicDate, setEditingPublicDate] = useState<{year: number, month: number, day: number, title: string, isHoliday: boolean} | null>(null);
  const [publicTitle, setPublicTitle] = useState('');
  const [publicIsHoliday, setPublicIsHoliday] = useState(true);

  const [currentDate, setCurrentDate] = useState(() => moment());
  const today = todayJalali();

  // Form states for normal event
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(todayJalali());
  const [type, setType] = useState<CalendarEvent['type']>('meeting');
  const [description, setDescription] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const currentYear = currentDate.jYear();
  const currentMonth = currentDate.jMonth(); // 0 to 11

  const prevMonth = () => setCurrentDate(currentDate.clone().subtract(1, 'jMonth'));
  const nextMonth = () => setCurrentDate(currentDate.clone().add(1, 'jMonth'));

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addCalendarEvent({
      title,
      date: dateStr,
      type,
      description,
      time: time || undefined,
      location: location || undefined
    });
    if (!ok) return;
    setIsAddOpen(false);
    setTitle('');
    setDescription('');
    setTime('');
    setLocation('');
  };

  const handleSavePublicEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPublicDate) {
      const monthStr = String(editingPublicDate.month + 1).padStart(2, '0');
      const dayStr = String(editingPublicDate.day).padStart(2, '0');
      const keyY = `${editingPublicDate.year}-${monthStr}-${dayStr}`;
      const hasBuiltIn = Boolean(IRANIAN_HOLIDAYS[keyY] || IRANIAN_HOLIDAYS[`${monthStr}-${dayStr}`]);
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

  const getDayHolidays = (year: number, month: number, day: number) => {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const keyY = `${year}-${monthStr}-${dayStr}`;
    const keyM = `${monthStr}-${dayStr}`;
    if (customHolidays && customHolidays[keyY]) {
      if (!customHolidays[keyY].title) return null; // cleared
      return customHolidays[keyY];
    }
    const defaultText = IRANIAN_HOLIDAYS[keyY] || IRANIAN_HOLIDAYS[keyM];
    if (defaultText) {
      return { title: defaultText, isHoliday: true, isDefault: true };
    }
    return null;
  };

  const getDayEvents = (year: number, month: number, day: number) => {
    const dateFormatted = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    return calendarEvents.filter(e => e.date === dateFormatted);
  };

  const getDayBirthdays = (month: number, day: number) => {
    const dateFormatted = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    return employees.filter(e => e.birthDate && e.birthDate.endsWith(dateFormatted));
  };

  const isToday = (year: number, month: number, day: number) =>
    today === `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

  const upcomingEvents = useMemo(
    () => calendarEvents.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [calendarEvents, today],
  );

  const todayBirthdays = useMemo(
    () => employees.filter((e) => e.isActive && e.birthDate && e.birthDate.slice(5) === today.slice(5)),
    [employees, today],
  );

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'meeting': return { color: 'bg-purple-100 text-purple-700', icon: <Calendar className="w-3 h-3" /> };
      case 'training': return { color: 'bg-blue-100 text-blue-700', icon: <GraduationCap className="w-3 h-3" /> };
      case 'holiday': return { color: 'bg-red-100 text-red-700', icon: <Flag className="w-3 h-3" /> };
      case 'birthday': return { color: 'bg-pink-100 text-pink-700', icon: <Cake className="w-3 h-3" /> };
      default: return { color: 'bg-gray-100 text-gray-700', icon: <Calendar className="w-3 h-3" /> };
    }
  };

  const getEventIcon = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'holiday': return <Sparkles className="w-5 h-5 text-red-500" />;
      case 'birthday': return <Cake className="w-5 h-5 text-pink-500" />;
      case 'training': return <Users className="w-5 h-5 text-blue-500" />;
      case 'meeting': return <Video className="w-5 h-5 text-indigo-500" />;
      default: return <Calendar className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-[#7f1d1d] text-white rounded-2xl shadow-lg">
          <Calendar className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#2D2D2D]">تقویم سازمانی</h2>
          <p className="text-sm text-[#6E6A60]">مشاهده رویدادها، جلسات، آموزش‌ها و تولدها</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-3xl p-4 sm:p-6 border border-[#E6E0D5] shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              {isManager ? <button
                onClick={() => setIsAddOpen(true)}
                className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن رویداد جدید</span>
              </button> : <span />}

              <div className="flex items-center gap-4">
                <button onClick={prevMonth} className="p-2 hover:bg-[#F5F2ED] rounded-xl transition-colors text-right" title="ماه قبل" aria-label="ماه قبل">
                  <ChevronRight className="w-5 h-5 text-[#2D2D2D]" />
                </button>
                <h3 className="text-xl font-bold text-[#2D2D2D]">
                  {JALALI_MONTHS[currentMonth]} {toPersianDigits(currentYear)}
                </h3>
                <button onClick={nextMonth} className="p-2 hover:bg-[#F5F2ED] rounded-xl transition-colors text-left" title="ماه بعد" aria-label="ماه بعد">
                  <ChevronLeft className="w-5 h-5 text-[#2D2D2D]" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {JALALI_WEEKDAYS.map(day => (
                  <div key={day} className="text-center text-xs font-bold text-[#8C867A] py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {days.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`} className="h-28 rounded-2xl bg-[#FDFBF7] border border-transparent"></div>;
                  const isFri = (index % 7) === 6;
                  const dayDate = `${currentYear}/${String(currentMonth + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
                  const holidayObj = getDayHolidays(currentYear, currentMonth, day);
                  const isHoliday = holidayObj?.isHoliday;
                  const events = getDayEvents(currentYear, currentMonth, day);
                  const birthdays = getDayBirthdays(currentMonth, day).filter((b) => b.isActive);
                  const isDayOff = isFri || !!isHoliday;
                  const today = isToday(currentYear, currentMonth, day);

                  return (
                    <div 
                      key={day} 
                      className={`h-28 overflow-hidden rounded-2xl border p-2 flex flex-col ${
                        today ? 'border-[#dc2626] bg-[#fef2f2] shadow-sm' : 
                        isDayOff ? 'border-[#fca5a5] bg-[#fff5f5]' : 
                        'border-[#E6E0D5] hover:border-[#D5CEC2] bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className={`text-sm font-black ${today ? 'text-[#dc2626]' : isDayOff ? 'text-[#ef4444]' : 'text-[#2D2D2D]'}`}>
                          {toPersianDigits(day)}
                        </div>
                        {isManager && (
                          <button 
                            onClick={(e) => {
                               e.stopPropagation();
                               setPublicTitle(holidayObj ? holidayObj.title : '');
                               setPublicIsHoliday(holidayObj ? holidayObj.isHoliday : true);
                               setEditingPublicDate({ year: currentYear, month: currentMonth, day, title: holidayObj?.title || '', isHoliday: holidayObj?.isHoliday ?? true });
                            }}
                            className="p-1 text-[#8C867A] hover:text-[#dc2626] transition-colors rounded-lg"
                            title="ویرایش مناسبت تقویمی"
                            aria-label={`ویرایش مناسبت ${toPersianDigits(day)} ${JALALI_MONTHS[currentMonth]}`}
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar">
                        {holidayObj && (
                          <div 
                            className={`text-[9px] font-bold px-1 py-0.5 rounded leading-tight cursor-pointer ${isHoliday ? 'text-[#dc2626] bg-red-100' : 'text-[#ea580c] bg-orange-100'}`} 
                            title={holidayObj.title}
                            onClick={() => {
                               setSelectedEvent({
                                  id: 'hol-' + day,
                                  title: holidayObj.title,
                                  date: dayDate,
                                  type: 'holiday',
                                  description: `مناسبت: ${holidayObj.title}`
                               });
                            }}
                          >
                            {holidayObj.title}
                          </div>
                        )}
                        {birthdays.map(b => (
                          <div 
                            key={b.id} 
                            onClick={() => {
                               setSelectedEvent({
                                  id: 'bday-' + b.id,
                                  title: `تولد ${b.firstName} ${b.lastName}`,
                                  date: dayDate,
                                  type: 'birthday',
                                  description: `تولد ${b.firstName} ${b.lastName} عزیز از واحد ${b.department}.`
                               });
                            }}
                            className="text-[9px] font-bold bg-pink-100 text-pink-700 px-1 py-0.5 rounded flex items-center gap-1 leading-tight truncate cursor-pointer" 
                            title={`تولد ${b.firstName} ${b.lastName}`}
                          >
                            <Cake className="w-2.5 h-2.5 shrink-0" />
                            تولد {b.firstName}
                          </div>
                        ))}

                        {events.map(e => (
                          <div 
                            key={e.id} 
                            onClick={() => setSelectedEvent(e)}
                            className={`text-[9px] font-bold px-1 py-0.5 rounded truncate leading-tight cursor-pointer ${
                              e.type === 'meeting' ? 'bg-purple-100 text-purple-700' :
                              e.type === 'training' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                            }`} 
                            title={e.title}
                          >
                            {e.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-5 border border-[#E6E0D5] shadow-xs">
            <h3 className="text-sm font-bold text-[#2D2D2D] mb-4 flex items-center gap-2">
              <Cake className="w-4 h-4 text-pink-500" />
              متولدین امروز
            </h3>
            {todayBirthdays.length > 0 ? (
              <div className="space-y-3">
                {todayBirthdays.map(emp => (
                  <div key={emp.id} className="flex items-center gap-3 p-3 bg-[#FDFBF7] border border-[#E6E0D5] rounded-xl">
                    <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-10 h-10 rounded-full text-xs" />
                    <div>
                      <div className="font-bold text-sm text-[#2D2D2D]">{emp.firstName} {emp.lastName}</div>
                      <div className="text-[10px] text-[#6E6A60]">{emp.department} - {emp.position}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6E6A60] text-center py-4 bg-[#F5F2ED] rounded-xl">
                امروز تولد هیچ یک از همکاران نیست.
              </p>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 border border-[#E6E0D5] shadow-xs">
            <h3 className="text-sm font-bold text-[#2D2D2D] mb-4">رویدادهای پیش‌رو</h3>
            {upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {upcomingEvents.map(e => {
                  const badge = getEventBadge(e.type);
                  return (
                    <div key={e.id} onClick={() => setSelectedEvent(e)} className="p-3 border border-[#E6E0D5] rounded-xl bg-white hover:border-[#dc2626] transition-colors cursor-pointer group">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.color} flex items-center gap-1`}>
                          {badge.icon} {e.type === 'meeting' ? 'جلسه' : e.type === 'training' ? 'آموزش' : e.type === 'holiday' ? 'تعطیل' : e.type === 'birthday' ? 'تولد' : 'رویداد'}
                        </span>
                        <span className="text-[10px] font-bold text-[#6E6A60] group-hover:text-[#dc2626] transition-colors">{formatDate(e.date)}</span>
                      </div>
                      <div className="text-xs font-bold text-[#2D2D2D] leading-tight truncate">{e.title}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#6E6A60] text-center py-4 bg-[#F5F2ED] rounded-xl">
                رویدادی برای نمایش وجود ندارد.
              </p>
            )}
          </div>
        </div>
      </div>

      {isAddOpen && (
        <Modal
          title="افزودن رویداد جدید به تقویم"
          icon={<Plus className="w-5 h-5" />}
          onClose={() => setIsAddOpen(false)}
          size="md"
          footer={
            <>
              <button type="button" onClick={() => setIsAddOpen(false)} className={secondaryButtonClass}>انصراف</button>
              <button type="submit" form="add-event" className={primaryButtonClass}>ذخیره رویداد</button>
            </>
          }
        >
          <form id="add-event" onSubmit={handleAddSubmit} className="space-y-3">
            <div>
              <label htmlFor="event-title" className={labelClass}>عنوان رویداد *</label>
              <input id="event-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-date" className={labelClass}>تاریخ رویداد *</label>
                <JalaliDateInput id="event-date" required value={dateStr} onChange={setDateStr} />
              </div>
              <div>
                <label htmlFor="event-type" className={labelClass}>نوع رویداد</label>
                <select id="event-type" value={type} onChange={(e) => setType(e.target.value as CalendarEvent['type'])} className={inputClass}>
                  <option value="meeting">جلسه یا همایش کاری</option>
                  <option value="event">رویداد سازمانی</option>
                  <option value="training">دوره آموزشی</option>
                  <option value="holiday">تعطیلی یا مرخصی سازمانی</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-time" className={labelClass}>ساعت</label>
                <input id="event-time" type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="event-location" className={labelClass}>مکان</label>
                <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="event-description" className={labelClass}>توضیحات</label>
              <textarea id="event-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </div>
          </form>
        </Modal>
      )}

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
              <span className="font-bold text-[#2D2D2D]">این روز تعطیل رسمی است</span>
            </label>
          </form>
        </Modal>
      )}

      {selectedEvent && (
        <Modal
          title={selectedEvent.title}
          subtitle={formatDate(selectedEvent.date)}
          icon={getEventIcon(selectedEvent.type)}
          onClose={() => setSelectedEvent(null)}
          size="sm"
        >
          {selectedEvent.description && <p className="text-sm text-[#6E6A60] leading-relaxed mb-4">{selectedEvent.description}</p>}
          {selectedEvent.time && (
            <div className="text-xs font-bold text-[#6E6A60] mb-2">ساعت: <span className="text-[#2D2D2D]">{toPersianDigits(selectedEvent.time)}</span></div>
          )}
          {selectedEvent.location && (
            <div className="text-xs font-bold text-[#6E6A60]">مکان: <span className="text-[#2D2D2D]">{selectedEvent.location}</span></div>
          )}
          {isManager && calendarEvents.some((ev) => ev.id === selectedEvent.id) && (
            <button
              onClick={async () => {
                await deleteCalendarEvent(selectedEvent.id);
                setSelectedEvent(null);
              }}
              className="mt-4 flex items-center gap-1.5 text-xs font-bold text-red-700 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" /> حذف این رویداد
            </button>
          )}
        </Modal>
      )}
    </div>
  );
};
