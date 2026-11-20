import React, { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { usePortal } from '../../../context/PortalContext';
import { askOwnerTour, showMissions, startTour } from './tourStore';

// «؟» on the «سپاس» page (plan: section هـ): the tutorials again, and the missions card when it was hidden.

export const HelpMenu: React.FC = () => {
  const { can, setActiveTab } = usePortal();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    { label: 'آموزش سپاس را دوباره ببینم', run: () => startTour('main', 0) },
    { label: 'آموزش دریافت قدردانی', run: () => startTour('received', 0) },
    {
      label: 'مأموریت‌های سپاس',
      run: () => {
        showMissions();
        window.setTimeout(() => document.querySelector('[data-tour="missions"]')?.scrollIntoView({ block: 'nearest' }), 50);
      },
    },
    ...(can('recognition.manage')
      ? [
          {
            label: 'آموزش برنامهٔ سپاس',
            run: () => {
              askOwnerTour(true);
              setActiveTab('thanks-admin');
            },
          },
        ]
      : []),
  ];

  // Up and down move between the items, as in any menu.
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="راهنمای سپاس"
        title="راهنمای سپاس"
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 grid place-items-center rounded-xl bg-white border border-line-strong text-ink-soft hover:bg-surface hover:text-ink"
      >
        <CircleHelp className="w-5 h-5" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="راهنمای سپاس"
          onKeyDown={onMenuKey}
          className="absolute z-30 end-0 top-full mt-2 w-64 p-1.5 bg-white border border-line rounded-2xl shadow-xl text-right"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold text-ink-soft hover:bg-surface hover:text-ink focus:bg-surface focus:text-ink outline-none text-right"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
