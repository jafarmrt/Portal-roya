import React from 'react';
import moment from 'moment-jalaali';
import { usePortal } from '../../context/PortalContext';
import { todayTheme } from '../../lib/dayTheme';

/** Grey bars where a card's content will appear, so the card does not say "nothing yet" while loading. */
export const SkeletonRows: React.FC<{ rows?: number; className?: string; tall?: boolean }> = ({ rows = 3, className = '', tall }) => (
  <div className={`space-y-2 ${className}`} aria-busy="true" aria-label="در حال بارگذاری">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className={`skeleton rounded-2xl ${tall ? 'h-16' : 'h-9'}`} style={{ width: `${100 - (i % 3) * 12}%` }} />
    ))}
  </div>
);

/** Tiles in a grid (the news on the dashboard). */
export const SkeletonTiles: React.FC<{ count?: number; className?: string }> = ({ count = 4, className = '' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`} aria-busy="true" aria-label="در حال بارگذاری">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="skeleton rounded-2xl h-20" />
    ))}
  </div>
);

// The season's tint for empty states: spring green, summer amber, autumn orange, winter blue;
// quiet grey on a day of mourning.
const TINTS = {
  spring: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  summer: 'bg-amber-50 text-amber-600 ring-amber-100',
  autumn: 'bg-orange-50 text-orange-600 ring-orange-100',
  winter: 'bg-sky-50 text-sky-600 ring-sky-100',
  mourning: 'bg-stone-100 text-stone-500 ring-stone-200',
} as const;

const DOTS = {
  spring: 'bg-emerald-200',
  summer: 'bg-amber-200',
  autumn: 'bg-orange-200',
  winter: 'bg-sky-200',
  mourning: 'bg-stone-300',
} as const;

export function seasonTint(month: number, mourning: boolean): keyof typeof TINTS {
  if (mourning) return 'mourning';
  if (month <= 3) return 'spring';
  if (month <= 6) return 'summer';
  if (month <= 9) return 'autumn';
  return 'winter';
}

/**
 * A friendly empty state: a small round picture in the season's colour, one warm sentence and,
 * optionally, a hint or a button.
 */
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}> = ({ icon, title, hint, action, compact }) => {
  const { customHolidays, appSettings } = usePortal();
  const mourning = todayTheme(customHolidays, appSettings?.foundingDate ?? '')?.tone === 'mourning';
  const tint = seasonTint(moment().jMonth() + 1, mourning);
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'gap-1.5 py-3' : 'gap-2 py-6'}`}>
      <div className={`relative ${compact ? 'w-11 h-11' : 'w-14 h-14'} rounded-full ring-4 flex items-center justify-center ${TINTS[tint]} [&>svg]:w-6 [&>svg]:h-6`} aria-hidden="true">
        {icon}
        <span className={`absolute -top-1 -left-1 w-3 h-3 rounded-full ${DOTS[tint]}`} />
        <span className={`absolute -bottom-0.5 -right-1.5 w-2 h-2 rounded-full ${DOTS[tint]}`} />
      </div>
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="text-xs text-muted leading-relaxed max-w-xs">{hint}</p>}
      {action}
    </div>
  );
};
