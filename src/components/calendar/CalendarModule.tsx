import React, { useState, useMemo } from 'react';
import { usePortal } from '../../context/PortalContext';
import { CalendarEvent, UserProfile } from '../../types';
import moment from 'moment-jalaali';
import {
  Calendar,
  Plus,
  Cake,
  GraduationCap,
  Briefcase,
  Flag,
  X,
  ChevronRight,
  ChevronLeft,
  Settings,
  Users,
  Video,
  Sparkles
} from 'lucide-react';
import { IRANIAN_HOLIDAYS, JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';

export const CalendarModule: React.FC = () => {
  const { calendarEvents, addCalendarEvent, userRole, employees, customHolidays, setCustomHoliday, removeCustomHoliday } = usePortal();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  // State for editing public holiday/event
  const [editingPublicDate, setEditingPublicDate] = useState<{year: number, month: number, day: number, title: string, isHoliday: boolean} | null>(null);
  const [publicTitle, setPublicTitle] = useState('');
  const [publicIsHoliday, setPublicIsHoliday] = useState(true);

  const [currentDate, setCurrentDate] = useState(() => moment());

  // Form states for normal event
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(moment().format('jYYYY/jMM/jDD'));
  const [type, setType] = useState<CalendarEvent['type']>('meeting');
  const [description, setDescription] = useState('');
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('');

  const currentYear = currentDate.jYear();
  const currentMonth = currentDate.jMonth(); // 0 to 11

  const prevMonth = () => setCurrentDate(currentDate.clone().subtract(1, 'jMonth'));
  const nextMonth = () => setCurrentDate(currentDate.clone().add(1, 'jMonth'));

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addCalendarEvent({
      title,
      date: dateStr,
      type,
      description,
      time: time || undefined,
      location: location || undefined
    });
    setIsAddOpen(false);
    setTitle('');
    setDescription('');
    setTime('10:00');
    setLocation('');
  };

  const handleSavePublicEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPublicDate) {
      const monthStr = String(editingPublicDate.month + 1).padStart(2, '0');
      const dayStr = String(editingPublicDate.day).padStart(2, '0');
      const keyY = `${editingPublicDate.year}-${monthStr}-${dayStr}`;
      
      if (!publicTitle.trim()) {
        // If they cleared the title, we set it to empty so it's not a holiday anymore
        setCustomHoliday(keyY, '', false);
      } else {
        setCustomHoliday(keyY, publicTitle, publicIsHoliday);
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

  const isToday = (year: number, month: number, day: number) => {
    const today = moment();
    return today.jYear() === year && today.jMonth() === month && today.jDate() === day;
  };

  const todayBirthdays = useMemo(() => {
    const today = moment();
    const dateFormatted = `${String(today.jMonth() + 1).padStart(2, '0')}/${String(today.jDate()).padStart(2, '0')}`;
    return employees.filter(e => e.birthDate && e.birthDate.endsWith(dateFormatted));
  }, [employees]);

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
          <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setIsAddOpen(true)}
                className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن رویداد جدید</span>
              </button>

              <div className="flex items-center gap-4">
                <button onClick={nextMonth} className="p-2 hover:bg-[#F5F2ED] rounded-xl transition-colors text-right" title="ماه قبل">
                  <ChevronRight className="w-5 h-5 text-[#2D2D2D]" />
                </button>
                <h3 className="text-xl font-bold text-[#2D2D2D]">
                  {JALALI_MONTHS[currentMonth]} {currentYear}
                </h3>
                <button onClick={prevMonth} className="p-2 hover:bg-[#F5F2ED] rounded-xl transition-colors text-left" title="ماه بعد">
                  <ChevronLeft className="w-5 h-5 text-[#2D2D2D]" />
                </button>
              </div>
            </div>

            <div className="min-w-[600px] overflow-x-auto">
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
                  const holidayObj = getDayHolidays(currentYear, currentMonth, day);
                  const isHoliday = holidayObj?.isHoliday;
                  const events = getDayEvents(currentYear, currentMonth, day);
                  const birthdays = getDayBirthdays(currentMonth, day);
                  
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
                          {day}
                        </div>
                        {userRole === 'manager' && (
                          <button 
                            onClick={(e) => {
                               e.stopPropagation();
                               setPublicTitle(holidayObj ? holidayObj.title : '');
                               setPublicIsHoliday(holidayObj ? holidayObj.isHoliday : true);
                               setEditingPublicDate({ year: currentYear, month: currentMonth, day, title: holidayObj?.title || '', isHoliday: holidayObj?.isHoliday || true });
                            }}
                            className="p-1 text-[#8C867A] hover:text-[#dc2626] transition-colors rounded-lg"
                            title="ویرایش مناسبت تقویمی"
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
                                  date: `${currentYear}/${currentMonth+1}/${day}`,
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
                                  date: `${currentYear}/${currentMonth+1}/${day}`,
                                  type: 'birthday',
                                  description: `امروز تولد ${b.firstName} ${b.lastName} عزیز در واحد ${b.department} است.`
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
                    <img src={emp.avatar || undefined} alt={emp.firstName} className="w-10 h-10 rounded-full object-cover" />
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
            {calendarEvents.length > 0 ? (
              <div className="space-y-3">
                {calendarEvents.slice(0, 5).map(e => {
                  const badge = getEventBadge(e.type);
                  return (
                    <div key={e.id} onClick={() => setSelectedEvent(e)} className="p-3 border border-[#E6E0D5] rounded-xl bg-white hover:border-[#dc2626] transition-colors cursor-pointer group">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.color} flex items-center gap-1`}>
                          {badge.icon} {e.type === 'meeting' ? 'جلسه' : e.type === 'training' ? 'آموزش' : e.type === 'holiday' ? 'تعطیل' : 'تولد'}
                        </span>
                        <span className="text-[10px] font-bold text-[#6E6A60] group-hover:text-[#dc2626] transition-colors">{e.date}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E6E0D5] w-full max-w-lg p-6 space-y-4 text-right text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
              <h3 className="text-base font-bold text-[#2D2D2D]">افزودن رویداد جدید به تقویم</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-[#6E6A60] hover:text-[#dc2626]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-[#2D2D2D] mb-1">عنوان رویداد *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2.5 border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#dc2626] transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#2D2D2D] mb-1">تاریخ رویداد *</label>
                  <input
                    type="text"
                    required
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    placeholder="1403/06/10"
                    className="w-full p-2.5 border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#dc2626] transition-colors text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#2D2D2D] mb-1">نوع رویداد</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as CalendarEvent['type'])}
                    className="w-full p-2.5 border border-[#E6E0D5] rounded-xl bg-white outline-hidden focus:border-[#dc2626] transition-colors"
                  >
                    <option value="meeting">جلسه یا همایش کاری</option>
                    <option value="training">دوره آموزشی</option>
                    <option value="birthday">تولد همکار</option>
                    <option value="holiday">رویداد سازمانی/مرخصی</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-[#2D2D2D] mb-1">توضیحات</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#dc2626] transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E6E0D5]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 font-semibold text-[#6E6A60] hover:bg-[#F5F2ED] rounded-xl transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-xl transition-colors"
                >
                  ذخیره رویداد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPublicDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E6E0D5] w-full max-w-sm p-6 space-y-4 text-right text-xs relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
              <h3 className="text-base font-bold text-[#2D2D2D]">ویرایش مناسبت تقویمی</h3>
              <button onClick={() => setEditingPublicDate(null)} className="text-[#6E6A60] hover:text-[#dc2626]">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-[#6E6A60] font-medium text-xs">
              تاریخ: {editingPublicDate.year}/{editingPublicDate.month + 1}/{editingPublicDate.day}
            </p>
            
            <form onSubmit={handleSavePublicEvent} className="space-y-4">
              <div>
                <label className="block font-bold text-[#2D2D2D] mb-1">عنوان مناسبت (خالی بگذارید تا حذف شود)</label>
                <input
                  type="text"
                  value={publicTitle}
                  onChange={(e) => setPublicTitle(e.target.value)}
                  placeholder="مثال: روز پزشک"
                  className="w-full p-2.5 border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#dc2626] transition-colors"
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={publicIsHoliday}
                  onChange={(e) => setPublicIsHoliday(e.target.checked)}
                  className="w-4 h-4 rounded text-[#dc2626] focus:ring-[#dc2626]"
                />
                <span className="font-bold text-[#2D2D2D]">این روز تعطیل رسمی است</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E6E0D5]">
                <button
                  type="button"
                  onClick={() => setEditingPublicDate(null)}
                  className="px-4 py-2 font-semibold text-[#6E6A60] hover:bg-[#F5F2ED] rounded-xl transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-xl transition-colors"
                >
                  ذخیره
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden text-right relative">
            <button 
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-slate-100 rounded-2xl">
                  {getEventIcon(selectedEvent.type)}
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#2D2D2D]">{selectedEvent.title}</h3>
                  <p className="text-xs text-[#6E6A60]">{selectedEvent.date}</p>
                </div>
              </div>
              
              <p className="text-sm text-[#6E6A60] leading-relaxed mb-4">
                {selectedEvent.description}
              </p>
              
              {selectedEvent.time && (
                <div className="text-xs font-bold text-[#6E6A60] mb-2">ساعت: <span className="text-[#2D2D2D]">{selectedEvent.time}</span></div>
              )}
              {selectedEvent.location && (
                <div className="text-xs font-bold text-[#6E6A60]">مکان: <span className="text-[#2D2D2D]">{selectedEvent.location}</span></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
