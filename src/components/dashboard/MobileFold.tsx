import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const STORAGE_KEY = 'roya-portal:dashboard-open';

function readOpen(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * On phones a less-used dashboard card shows as one line that opens on tap (remembered on this
 * device); on wider screens the card is always shown as is.
 */
export const MobileFold: React.FC<{
  id: string;
  title: string;
  icon: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ id, title, icon, className = '', style, children }) => {
  const [open, setOpen] = useState(() => readOpen().includes(id));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const others = readOpen().filter((x) => x !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next ? [...others, id] : others));
    } catch {
      // Storage can be blocked; the card just opens closed next time.
    }
  };

  return (
    <div className={className} style={style}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="lg:hidden w-full flex items-center gap-2 px-4 py-3 bg-white rounded-2xl border border-line text-right text-sm font-bold text-ink"
      >
        <span className="text-brand-strong">{icon}</span>
        <span className="flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={open ? 'mt-3 lg:mt-0' : 'hidden lg:block'}>{children}</div>
    </div>
  );
};
