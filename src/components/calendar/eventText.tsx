import React from 'react';
import { Cake, Calendar, GraduationCap, PartyPopper, Sparkles, Video } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';
import type { CalendarNote } from '../../types';

type EntryType = CalendarNote['type'];

export const TYPE_LABELS: Record<EntryType, string> = {
  meeting: 'جلسه',
  event: 'رویداد',
  holiday: 'تعطیلی',
  training: 'آموزش',
  birthday: 'تولد',
};

/** Colours of an entry's chip in the month grid and the lists. */
export const typeChipClass = (type: EntryType) =>
  ({
    meeting: 'bg-purple-100 text-purple-700',
    training: 'bg-blue-100 text-blue-700',
    holiday: 'bg-red-100 text-red-700',
    birthday: 'bg-pink-100 text-pink-700',
    event: 'bg-amber-100 text-amber-800',
  })[type];

export const TypeIcon: React.FC<{ type: EntryType; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  switch (type) {
    case 'holiday':
      return <Sparkles className={`${className} text-red-500`} />;
    case 'birthday':
      return <Cake className={`${className} text-pink-500`} />;
    case 'training':
      return <GraduationCap className={`${className} text-blue-500`} />;
    case 'meeting':
      return <Video className={`${className} text-indigo-500`} />;
    case 'event':
      return <PartyPopper className={`${className} text-amber-600`} />;
    default:
      return <Calendar className={`${className} text-muted`} />;
  }
};

/** "ساعت ۱۰:۰۰ تا ۱۱:۳۰", "ساعت ۱۰:۰۰" or nothing for an all-day entry. */
export const timeRange = (e: { time?: string; endTime?: string }) =>
  e.time ? toPersianDigits(`ساعت ${e.time}${e.endTime ? ` تا ${e.endTime}` : ''}`) : '';

/** Jalali 'YYYY/MM/DD' for a day of a Jalali month (month counted from 0). */
export const jalaliKey = (year: number, month: number, day: number) =>
  `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

/** Timed entries in order, all-day ones first. */
export const byTime = (a: { time?: string }, b: { time?: string }) => (a.time ?? '').localeCompare(b.time ?? '');
