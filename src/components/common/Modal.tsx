import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { isTouchScreen } from '../../lib/touch';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

// Open dialogs, innermost last, so Escape and the page scroll lock only act on the top one.
const openDialogs: symbol[] = [];

interface ModalShellProps {
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  labelledBy?: string;
  label?: string;
  className?: string;
}

/**
 * Backdrop and panel shared by every dialog. It is rendered into <body> so no parent
 * (sticky header, transformed card) can clip it, never grows taller than the visible
 * screen, opens as a bottom sheet on phones, and locks the page behind it.
 */
export const ModalShell: React.FC<ModalShellProps> = ({ onClose, children, size = 'lg', labelledBy, label, className = '' }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const token = Symbol('dialog');
    openDialogs.push(token);
    const previous = document.activeElement as HTMLElement | null;
    // On a phone the dialog itself takes the focus, so the keyboard does not cover the form at once.
    const first = isTouchScreen() ? null : panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select, button:not([data-close])');
    (first ?? panelRef.current)?.focus({ preventScroll: true });

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === token) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (openDialogs.length === 0) document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`relative bg-white shadow-2xl border border-[#E6E0D5] w-full ${SIZES[size]} rounded-t-3xl sm:rounded-3xl overflow-hidden text-right max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

interface ModalProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
}

/** Standard dialog: fixed title bar and footer, the body scrolls between them. */
export const Modal: React.FC<ModalProps> = ({ title, subtitle, icon, onClose, children, footer, size = 'lg' }) => {
  const titleId = useId();

  return (
    <ModalShell onClose={onClose} size={size} labelledBy={titleId}>
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-[#F5F2ED] border-b border-[#E6E0D5] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <div className="p-2 bg-red-100 text-red-700 rounded-xl shrink-0">{icon}</div>}
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-[#2D2D2D] truncate">{title}</h3>
            {subtitle && <p className="text-xs text-[#6E6A60] truncate">{subtitle}</p>}
          </div>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 text-xs">{children}</div>
      {footer && (
        <div className="px-5 sm:px-6 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#F5F2ED] border-t border-[#E6E0D5] flex flex-wrap justify-end gap-2 shrink-0">
          {footer}
        </div>
      )}
    </ModalShell>
  );
};

export const ModalCloseButton: React.FC<{ onClose: () => void; className?: string }> = ({ onClose, className = '' }) => (
  <button
    type="button"
    data-close
    onClick={onClose}
    aria-label="بستن"
    className={`p-2 text-[#8C867A] hover:text-[#2D2D2D] rounded-xl hover:bg-[#E6E0D5] transition-colors shrink-0 ${className}`}
  >
    <X className="w-5 h-5" />
  </button>
);

export const inputClass =
  'w-full p-2.5 border border-[#D9D4CB] rounded-xl bg-white text-sm focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-hidden disabled:opacity-60 disabled:bg-[#F5F2ED]';
export const labelClass = 'block text-xs font-bold text-[#4B4740] mb-1';
export const primaryButtonClass =
  'px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2';
export const secondaryButtonClass =
  'px-4 py-2 text-xs font-bold text-[#2D2D2D] bg-white hover:bg-[#F5F2ED] border border-[#D9D4CB] rounded-xl transition-colors flex items-center gap-1.5';
