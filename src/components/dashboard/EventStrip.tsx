import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { hasEvent } from '../event/types';
import { countdownText, useCountdown } from '../event/EventParts';
import { heroStyle } from '../event/eventUi';
import { programStart } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';

/**
 * A thin strip at the top of the dashboard while a special event is on: how long until the program,
 * what is open now (signup, the brackets, «زنده»), and one tap to its page.
 */
export const EventStrip: React.FC = () => {
  const { specialEvent, setActiveTab } = usePortal();
  const view = hasEvent(specialEvent) ? specialEvent : null;
  const left = useCountdown(view ? programStart(view.event) : new Date(0));
  if (!view) return null;
  const { event } = view;
  // Only once colleagues see it, and not after the program.
  if (event.status !== 'active' || event.phase === 'memories' || event.phase === 'ended') return null;

  const now =
    event.phase === 'live'
      ? 'برنامه شروع شده؛ نتیجه‌ها و صفحهٔ بزرگ زنده‌اند'
      : event.phase === 'signup'
        ? `ثبت‌نام مسابقه‌ها، آهنگ و ایده تا پایان ${toPersianDigits(event.signupEnd)}`
        : event.phase === 'matchday'
          ? 'امروز روز مسابقه‌هاست؛ جدول‌ها را دنبال کنید'
          : 'قرعه کشیده شد؛ جدول‌ها و حریف‌ها را ببینید';

  return (
    <button
      type="button"
      onClick={() => setActiveTab('event')}
      className="w-full text-right rounded-2xl text-white px-4 py-3 flex items-center gap-3 shadow-sm hover:brightness-110 transition"
      style={heroStyle}
      aria-label={`${event.title}: ${now}`}
    >
      <span className="text-2xl leading-none shrink-0" aria-hidden>
        {event.theme === 'yalda' ? '🍉' : '✨'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-black truncate">
          {event.title}
          {left > 0 && <span className="font-bold text-amber-200"> · {countdownText(left)} مانده</span>}
          {event.phase === 'live' && <span className="ms-2 inline-block px-2 py-0.5 rounded-full text-[10px] bg-amber-400 text-amber-950 align-middle">زنده</span>}
        </span>
        <span className="block text-[11px] text-white/80 leading-relaxed">{now}</span>
      </span>
      <ChevronLeft className="w-5 h-5 shrink-0 opacity-80" aria-hidden />
    </button>
  );
};
