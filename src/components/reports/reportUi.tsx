import React from 'react';
import { toPersianDigits } from '../../lib/jalali';

export const cardClass = 'bg-white rounded-3xl p-5 sm:p-6 border border-line shadow-xs space-y-4';

/** "۲۵ دقیقه"، "۳ ساعت" or "۲ روز", rounded to the unit that reads naturally. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${toPersianDigits(Math.max(1, minutes))} دقیقه`;
  if (minutes < 48 * 60) return `${toPersianDigits(Math.round(minutes / 60))} ساعت`;
  return `${toPersianDigits(Math.round(minutes / (24 * 60)))} روز`;
}

export const formatPercent = (value: number | null) => (value === null ? '—' : `${toPersianDigits(value)}٪`);

/** A one-decimal 1–5 rating, "۴٫۳ از ۵". */
export const formatRating = (value: number | null) => (value === null ? '—' : `${toPersianDigits(String(value).replace('.', '٫'))} از ۵`);

export const SectionTitle: React.FC<{ id: string; icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({ id, icon, title, hint, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <span className="text-brand-strong shrink-0">{icon}</span>
      <div>
        <h3 id={id} className="text-base font-black text-ink">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
    {action}
  </div>
);

export const StatTile: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="p-4 rounded-2xl bg-surface space-y-1">
    <p className="text-xs font-bold text-muted">{label}</p>
    <p className="text-xl font-black text-ink">{value}</p>
    {note && <p className="text-xs text-muted">{note}</p>}
  </div>
);

/** A bar with the share and the counts beside it, e.g. "۷۵٪ (۳ از ۴)". */
export const ShareBar: React.FC<{ part: number; total: number; label: string }> = ({ part, total, label }) => {
  const pct = total > 0 ? Math.round((part / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[9rem]">
      <div
        className="flex-1 h-2 bg-surface rounded-full overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-brand-strong rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-muted">
        {total > 0 ? `${toPersianDigits(pct)}٪` : '—'}{' '}
        <span className="text-xs">({toPersianDigits(part)} از {toPersianDigits(total)})</span>
      </span>
    </div>
  );
};

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-muted text-center py-6 bg-surface rounded-xl">{children}</p>
);

export const th = 'text-right font-bold py-2 pl-3 whitespace-nowrap';
export const td = 'py-2.5 pl-3';
