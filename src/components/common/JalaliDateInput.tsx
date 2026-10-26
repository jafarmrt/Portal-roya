import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 340;

/** Text field for Jalali dates (YYYY/MM/DD) with a pop-up month picker. */
export const JalaliDateInput: React.FC<JalaliDateInputProps> = ({ id, value, onChange, required, placeholder = '۱۴۰۵/۰۸/۱۵', defaultYear }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => initialView(value, defaultYear));
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // The picker floats above the page (not inside the field's box), so a scrolling dialog
  // never cuts it off; it opens upward when there is no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = wrapperRef.current?.querySelector('input')?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const top = below >= POPOVER_HEIGHT + 8 || rect.top < POPOVER_HEIGHT + 8
        ? Math.min(rect.bottom + 4, window.innerHeight - POPOVER_HEIGHT - 8)
        : rect.top - POPOVER_HEIGHT - 4;
      const left = Math.min(Math.max(8, rect.right - POPOVER_WIDTH), window.innerWidth - POPOVER_WIDTH - 8);
      setPosition({ top: Math.max(8, top), left: Math.max(8, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapperRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    // Escape closes only the picker, not the dialog it sits in.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey, true);
    };
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

      {open && position && createPortal(
        <div
          ref={popoverRef}
          dir="rtl"
          style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
          className="fixed z-[70] bg-white border border-[#E6E0D5] rounded-2xl shadow-xl p-3 text-xs text-right"
          role="dialog"
          aria-label="انتخاب تاریخ"
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
};

function initialView(value: string, defaultYear?: number) {
  if (isValidJalaliDate(value)) return moment(value, 'jYYYY/jMM/jDD');
  if (defaultYear) return moment(`${defaultYear}/1/1`, 'jYYYY/jM/jD');
  return moment();
}
