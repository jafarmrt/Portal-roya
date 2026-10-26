import React, { useEffect, useId, useRef, useState } from 'react';
import moment from 'moment-jalaali';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { JALALI_MONTH_NAMES, isValidJalaliDate, toLatinDigits, toPersianDigits } from '../../lib/jalali';
import { inputClass } from './Modal';

interface JalaliDateInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  /** Opens the picker on this year when there is no value (e.g. 1370 for birthdays). */
  defaultYear?: number;
}

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** Text field for Jalali dates (YYYY/MM/DD) with a pop-up month picker. */
export const JalaliDateInput: React.FC<JalaliDateInputProps> = ({ id, value, onChange, required, placeholder = '۱۴۰۵/۰۸/۱۵', defaultYear }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => initialView(value, defaultYear));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const year = view.jYear();
  const month = view.jMonth();
  const daysInMonth = moment.jDaysInMonth(year, month);
  const firstWeekday = (moment(`${year}/${month + 1}/1`, 'jYYYY/jM/jD').day() + 1) % 7; // 0 = Saturday
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const pick = (day: number) => {
    onChange(`${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`);
    setOpen(false);
  };

  const invalid = value !== '' && !isValidJalaliDate(value);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          dir="ltr"
          required={required}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(toLatinDigits(e.target.value))}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className={`${inputClass} text-left pr-16 ${invalid ? 'border-red-500' : ''}`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button type="button" onClick={() => onChange('')} aria-label="پاک کردن تاریخ" className="p-1 text-[#8C867A] hover:text-[#2D2D2D]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label="انتخاب تاریخ از تقویم"
            aria-expanded={open}
            onClick={() => {
              setView(initialView(value, defaultYear));
              setOpen((o) => !o);
            }}
            className="p-1 text-red-700 hover:bg-red-50 rounded-lg"
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {invalid && <p className="text-[11px] text-red-600 mt-1">تاریخ را به شکل ۱۴۰۵/۰۸/۱۵ وارد کنید.</p>}

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-72 bg-white border border-[#E6E0D5] rounded-2xl shadow-xl p-3 text-xs" role="dialog" aria-label="انتخاب تاریخ">
          <div className="flex items-center justify-between mb-2 gap-1">
            <button type="button" aria-label="ماه قبل" onClick={() => setView(view.clone().subtract(1, 'jMonth'))} className="p-1.5 hover:bg-[#F5F2ED] rounded-lg">
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              <select
                aria-label="ماه"
                value={month}
                onChange={(e) => setView(moment(`${year}/${Number(e.target.value) + 1}/1`, 'jYYYY/jM/jD'))}
                className="bg-[#F5F2ED] rounded-lg px-1 py-1 font-bold"
              >
                {JALALI_MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
              <input
                aria-label="سال"
                type="number"
                value={year}
                min={1300}
                max={1499}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (y >= 1300 && y <= 1499) setView(moment(`${y}/${month + 1}/1`, 'jYYYY/jM/jD'));
                }}
                className="w-16 bg-[#F5F2ED] rounded-lg px-1 py-1 font-bold text-center"
              />
            </div>
            <button type="button" aria-label="ماه بعد" onClick={() => setView(view.clone().add(1, 'jMonth'))} className="p-1.5 hover:bg-[#F5F2ED] rounded-lg">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d) => (
              <div key={d} className={`py-1 font-bold ${d === 'ج' ? 'text-red-600' : 'text-[#8C867A]'}`}>{d}</div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const dateStr = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
              const selected = dateStr === value;
              const today = dateStr === moment().format('jYYYY/jMM/jDD');
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className={`py-1.5 rounded-lg font-bold ${selected ? 'bg-red-700 text-white' : today ? 'ring-1 ring-red-600 text-red-700' : 'hover:bg-[#F5F2ED]'}`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { setView(moment()); pick(moment().jDate()); }} className="mt-2 w-full py-1.5 rounded-lg bg-[#F5F2ED] hover:bg-[#E6E0D5] font-bold">
            امروز
          </button>
        </div>
      )}
    </div>
  );
};

function initialView(value: string, defaultYear?: number) {
  if (isValidJalaliDate(value)) return moment(value, 'jYYYY/jMM/jDD');
  if (defaultYear) return moment(`${defaultYear}/1/1`, 'jYYYY/jM/jD');
  return moment();
}
