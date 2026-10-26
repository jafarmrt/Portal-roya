import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../lib/useEscapeKey';

interface ModalProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const SIZES = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Accessible dialog: closes on Escape or backdrop click and moves focus inside. */
export const Modal: React.FC<ModalProps> = ({ title, subtitle, icon, onClose, children, footer, size = 'lg' }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    (first ?? panelRef.current)?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-3xl shadow-2xl border border-[#E6E0D5] w-full ${SIZES[size]} overflow-hidden text-right max-h-[92vh] flex flex-col outline-none`}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-[#F5F2ED] border-b border-[#E6E0D5]">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <div className="p-2 bg-red-100 text-red-700 rounded-xl shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-bold text-[#2D2D2D] truncate">{title}</h3>
              {subtitle && <p className="text-xs text-[#6E6A60]">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="بستن"
            className="p-1.5 text-[#8C867A] hover:text-[#2D2D2D] rounded-lg hover:bg-[#E6E0D5] transition-colors focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 text-xs">{children}</div>
        {footer && <div className="px-6 py-4 bg-[#F5F2ED] border-t border-[#E6E0D5] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const inputClass =
  'w-full p-2.5 border border-[#D9D4CB] rounded-xl bg-white text-sm focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-hidden disabled:opacity-60 disabled:bg-[#F5F2ED]';
export const labelClass = 'block text-xs font-bold text-[#4B4740] mb-1';
export const primaryButtonClass =
  'px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2';
export const secondaryButtonClass =
  'px-4 py-2 text-xs font-bold text-[#2D2D2D] bg-white hover:bg-[#F5F2ED] border border-[#D9D4CB] rounded-xl transition-colors flex items-center gap-1.5';
