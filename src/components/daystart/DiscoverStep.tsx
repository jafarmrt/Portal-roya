import React from 'react';
import { Lightbulb } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { DISCOVER_INFO, weekOf, type DiscoverMemory, type DiscoverPart } from '../../../shared/discover';
import { saveDiscoverMemory, startDiscoverTour } from './discoverStore';
import { countStep } from './stepStore';

const primary = 'px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors';

/**
 * «می‌دانستید؟»: once a week in the place of the day's step, a part of the portal the colleague has not
 * used yet. «همین حالا امتحان کنید» opens the part's own page with a short tour; «بعداً» leaves it for
 * another week, «این را می‌دانم» for good. Counted without a name, like the steps.
 */
export const DiscoverStep: React.FC<{ part: DiscoverPart; userId: string; today: string; memory: DiscoverMemory }> = ({ part, userId, today, memory }) => {
  const { currentUser, setActiveTab } = usePortal();
  const info = DISCOVER_INFO[part];
  const settle = (state: 'done' | 'closed', known = false) => {
    saveDiscoverMemory(userId, {
      known: known ? [...new Set([...memory.known, part])] : memory.known,
      last: { week: weekOf(today), date: today, part, state },
    });
    countStep('discover', known ? 'muted' : state, today);
  };
  const tryIt = () => {
    settle('done');
    if (info.tab !== 'dashboard') setActiveTab(info.tab, part === 'unit' ? (currentUser?.department ?? null) : null);
    startDiscoverTour(part);
  };

  return (
    <section aria-labelledby="day-discover-title" className="space-y-2.5" data-testid="day-discover" data-part={part}>
      <div className="flex items-center gap-2 text-ink-soft">
        <Lightbulb className="w-4 h-4" />
        <h4 id="day-discover-title" className="text-xs font-black">
          می‌دانستید؟ <span className="font-bold text-muted">«{info.label}»</span>
        </h4>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed">{info.pitch}</p>
      <button type="button" onClick={tryIt} className={primary}>
        همین حالا امتحان کنید
      </button>
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={() => settle('closed')} className="text-[11px] font-bold text-muted hover:text-ink">
          بعداً
        </button>
        <button type="button" onClick={() => settle('closed', true)} className="text-[11px] text-faint hover:text-ink">
          این را می‌دانم
        </button>
      </div>
    </section>
  );
};
