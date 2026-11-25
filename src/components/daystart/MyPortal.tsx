import React from 'react';
import { Check } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { DISCOVER_INFO, type DiscoverPart, type DiscoverStatus } from '../../../shared/discover';
import { startDiscoverTour } from './discoverStore';

/**
 * «پرتال من»: the parts of «کشف پرتال» the colleague can use, with a tick where they have, read from
 * what really happened. «امتحان کنید» opens the part with its short tour. Nothing is rewarded, and
 * only the colleague sees it.
 */
export const MyPortal: React.FC<{ parts: DiscoverStatus[] }> = ({ parts }) => {
  const { currentUser, setActiveTab } = usePortal();
  const tryIt = (part: DiscoverPart) => {
    const { tab } = DISCOVER_INFO[part];
    if (tab !== 'dashboard') setActiveTab(tab, part === 'unit' ? (currentUser?.department ?? null) : null);
    startDiscoverTour(part);
  };
  return (
    <ul className="space-y-1.5 max-w-sm" data-testid="my-portal">
      {parts.map(({ part, used }) => (
        <li key={part} className="flex items-center justify-between gap-2 text-xs">
          <span className={`flex items-center gap-1.5 min-w-0 ${used ? 'text-ink-soft' : 'text-ink'}`}>
            <span
              className={`w-4 h-4 shrink-0 rounded-full grid place-items-center ${used ? 'bg-green-600 text-white' : 'border border-line-strong'}`}
              aria-label={used ? 'استفاده کرده‌اید' : 'هنوز امتحان نکرده‌اید'}
              role="img"
            >
              {used && <Check className="w-3 h-3" />}
            </span>
            <span className="truncate">{DISCOVER_INFO[part].label}</span>
          </span>
          <button type="button" onClick={() => tryIt(part)} className="shrink-0 text-[11px] font-bold text-brand-strong hover:underline">
            {used ? 'راهنمای کوتاه' : 'امتحان کنید'}
          </button>
        </li>
      ))}
    </ul>
  );
};

/** «۳ از ۵» beside the title. */
export const myPortalCount = (parts: DiscoverStatus[]) => `${toPersianDigits(parts.filter((p) => p.used).length)} از ${toPersianDigits(parts.length)}`;
