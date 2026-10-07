import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Sparkles, Cake, Users, Video } from 'lucide-react';
import { CalendarEvent } from '../../types';
import moment from 'moment-jalaali';
import { IRANIAN_HOLIDAYS, JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';

export const DashboardCalendar: React.FC = () => {
  const { calendarEvents, setActiveTab, customHolidays } = usePortal();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  const [currentDate, setCurrentDate] = useState(() => moment());
  const currentYear = currentDate.jYear();
  const currentMonth = currentDate.jMonth();
  const today = moment();

  const daysInMonth = moment.jDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = moment(`${currentYear}/${currentMonth + 1}/1`, 'jYYYY/jM/jD');
  const startDayOfWeek = (firstDayOfMonth.day() + 1) % 7;

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDayOfWeek }, (_, i) => i);
  
  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  const getEventForDay = (day: number) => {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(currentMonth + 1).padStart(2, '0');
    const farsiDayStr = dayStr.replace(/0/g, '۰').replace(/1/g, '۱').replace(/2/g, '۲').replace(/3/g, '۳').replace(/4/g, '۴').replace(/5/g, '۵').replace(/6/g, '۶').replace(/7/g, '۷').replace(/8/g, '۸').replace(/9/g, '۹');
    const farsiMonthStr = monthStr.replace(/0/g, '۰').replace(/1/g, '۱').replace(/2/g, '۲').replace(/3/g, '۳').replace(/4/g, '۴').replace(/5/g, '۵').replace(/6/g, '۶').replace(/7/g, '۷').replace(/8/g, '۸').replace(/9/g, '۹');
    
    return calendarEvents.find(e => 
      e.date.includes(`${currentYear}/${monthStr}/${dayStr}`) || 
      e.date.includes(`${currentYear}/${farsiMonthStr}/${farsiDayStr}`)
    );
  };

  const getDayHoliday = (year: number, month: number, day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const keyY = `${year}-${m}-${d}`;
    const keyM = `${m}-${d}`;
    
    if (customHolidays && customHolidays[keyY]) {
       if (!customHolidays[keyY].title) return null;
       return customHolidays[keyY];
    }
    const defaultText = IRANIAN_HOLIDAYS[keyY] || IRANIAN_HOLIDAYS[keyM];
    if (defaultText) return { title: defaultText, isHoliday: true };
    return null;
  };

  const getEventIcon = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'holiday': return <Sparkles className="w-5 h-5 text-red-500" />;
      case 'birthday': return <Cake className="w-5 h-5 text-pink-500" />;
      case 'training': return <Users className="w-5 h-5 text-blue-500" />;
      case 'meeting': return <Video className="w-5 h-5 text-indigo-500" />;
      default: return <CalendarIcon className="w-5 h-5 text-slate-500" />;
    }
  };

  const prevMonth = () => setCurrentDate(currentDate.clone().subtract(1, 'jMonth'));
  const nextMonth = () => setCurrentDate(currentDate.clone().add(1, 'jMonth'));

  return (
    <>
      <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#7f1d1d] text-white rounded-xl">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#2D2D2D]">تقویم سازمانی</h3>
              <p className="text-xs text-[#6E6A60]">{JALALI_MONTHS[currentMonth]} {currentYear}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('calendar')}
            className="text-xs font-bold text-[#dc2626] hover:underline flex items-center gap-1"
          >
            <span>جزئیات رویدادها</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="pt-2">
          <div className="flex items-center justify-between mb-4 px-2">
            <button onClick={nextMonth} className="p-1 text-[#8C867A] hover:text-[#2D2D2D]"><ChevronRight className="w-4 h-4" /></button>
            <span className="text-sm font-bold text-[#2D2D2D]">{JALALI_MONTHS[currentMonth]} {currentYear}</span>
            <button onClick={prevMonth} className="p-1 text-[#8C867A] hover:text-[#2D2D2D]"><ChevronLeft className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-[10px] font-bold text-[#8C867A]">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {blanks.map(b => (
              <div key={`blank-${b}`} className="aspect-square p-1"></div>
            ))}
            {days.map(day => {
              const evt = getEventForDay(day);
              const holidayObj = getDayHoliday(currentYear, currentMonth, day);
              const holiday = holidayObj?.title;
              const isToday = today.jYear() === currentYear && today.jMonth() === currentMonth && today.jDate() === day;
              const isFriday = (startDayOfWeek + day - 1) % 7 === 6;
              const isHoliday = holidayObj?.isHoliday || isFriday;
              
              const clickEvt = evt || (holiday ? {
                id: `hol-${currentYear}-${currentMonth}-${day}`,
                title: holiday,
                date: `${currentYear}/${String(currentMonth + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
                type: 'holiday',
                description: holiday
              } : null);
              
              return (
                <div 
                  key={day} 
                  onClick={() => clickEvt && setSelectedEvent(clickEvt as CalendarEvent)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium relative transition-all ${
                    clickEvt ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isToday ? 'bg-[#dc2626] text-white shadow-sm' : 
                    isHoliday ? 'text-[#f87171] bg-[#F5F2ED]/50' :
                    'text-[#2D2D2D] hover:bg-[#F5F2ED]'
                  }`}
                  title={holiday || (evt ? evt.title : '')}
                >
                  <span>{day}</span>
                  {evt && !isToday && (
                    <span className={`absolute bottom-1 w-1 h-1 rounded-full ${evt.type === 'holiday' ? 'bg-[#f87171]' : evt.type === 'birthday' ? 'bg-[#dc2626]' : 'bg-[#7f1d1d]'}`}></span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

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
              
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setActiveTab('calendar');
                }}
                className="w-full mt-6 py-2.5 bg-[#f5f2ed] hover:bg-[#e5e5e5] text-[#2d2d2d] text-sm font-bold rounded-xl transition-colors"
              >
                رفتن به تقویم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
