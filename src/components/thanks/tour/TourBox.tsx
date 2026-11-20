import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPersianDigits } from '../../../lib/jalali';
import type { EffectsLevel } from '../effects';

// One step of a tutorial: the page is dimmed except the part the step is about, and a small box next to
// it says what to do. On a phone the box sits at the bottom of the screen, or at the top when the part
// lit up is down there, so it never covers it. The box is a non-modal dialog the keyboard and a screen
// reader can reach; Escape asks whether to leave the tutorial.

const PAD = 6;
const GAP = 12;
const BOX_WIDTH = 340;

type Rect = { top: number; left: number; width: number; height: number };

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

/** The first selector that finds something visible on the page. */
function find(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return el;
    }
  }
  return null;
}

const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 640;

export interface TourBoxProps {
  /** What to light up (the first selector that finds something); none: a box in the middle of a dimmed page. */
  target?: string | readonly string[] | null;
  title: string;
  children: React.ReactNode;
  /** The step's buttons («بعدی», «فهمیدم», …). */
  actions?: React.ReactNode;
  /** «رد شدن از آموزش» under the buttons. */
  onSkip?: () => void;
  /** Escape: usually the question whether to leave the tutorial. */
  onEscape?: () => void;
  /** Where the keyboard goes when the step opens: the box's first button, or the part lit up (a step that waits for it). */
  focus?: 'box' | 'target';
  /** «۳ از ۱۲». */
  progress?: { step: number; of: number };
  fx: EffectsLevel;
  /** Some identity of the step, so the box takes the focus and scrolls the target in view once per step. */
  stepKey: string;
  /**
   * The dimmed page can still be used (the steps inside the give form: its other fields and its close
   * button stay in reach). By default only the part lit up can be.
   */
  passThrough?: boolean;
}

export const TourBox: React.FC<TourBoxProps> = ({ target, title, children, actions, onSkip, onEscape, focus = 'box', progress, fx, stepKey, passThrough = false }) => {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const selectors = target ? (typeof target === 'string' ? [target] : target) : [];
  const key = selectors.join('|');

  // Follows the part lit up as the page scrolls, a dialog opens or the layout settles.
  useEffect(() => {
    if (!key) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last: Rect | null = null;
    const tick = () => {
      const el = find(key.split('|'));
      const box = el?.getBoundingClientRect();
      const next = box ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null;
      if (!sameRect(last, next)) {
        last = next;
        setRect(next);
      }
      if (window.innerWidth !== view.w || window.innerHeight !== view.h) setView({ w: window.innerWidth, h: window.innerHeight });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, view.w, view.h]);

  // Once per step: the part in view, and the keyboard where the step wants it.
  const found = rect !== null;
  useEffect(() => {
    const el = key ? find(key.split('|')) : null;
    el?.scrollIntoView({ block: 'nearest', behavior: fx === 'none' ? 'auto' : 'smooth' });
    const timer = window.setTimeout(() => {
      if (focus === 'target' && el) {
        const inner = el.matches('button, input, textarea, select, a[href], [tabindex]') ? el : el.querySelector<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]');
        (inner ?? el).focus({ preventScroll: true });
      } else {
        (boxRef.current?.querySelector<HTMLElement>('[data-tour-primary]') ?? boxRef.current?.querySelector<HTMLElement>('button') ?? boxRef.current)?.focus({ preventScroll: true });
      }
    }, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step, and once more when its part shows up
  }, [stepKey, found]);

  // Escape is the tutorial's before any dialog under it hears it.
  const escape = useRef(onEscape);
  useLayoutEffect(() => {
    escape.current = onEscape;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !escape.current) return;
      // A list opened inside the step (the colleague picker) closes first, as it would anyway.
      if (document.querySelector('[role="listbox"]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      escape.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const phone = view.w < 640 || isPhone();
  const style: React.CSSProperties = {};
  let placement: 'center' | 'bottom' | 'top' | 'below' | 'above' = 'center';
  if (phone) {
    placement = rect && rect.top + rect.height / 2 > view.h * 0.5 ? 'top' : 'bottom';
  } else if (rect) {
    const width = Math.min(BOX_WIDTH, view.w - 24);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), view.w - width - 12);
    style.width = width;
    style.left = left;
    if (view.h - (rect.top + rect.height) > 220) {
      placement = 'below';
      style.top = rect.top + rect.height + GAP;
    } else if (rect.top > 220) {
      placement = 'above';
      style.bottom = view.h - rect.top + GAP;
    } else {
      // Too tall a part to sit next to: the box goes over its lower corner.
      placement = 'below';
      style.top = Math.max(12, view.h - 260);
    }
  }

  const dim = `fixed bg-ink-strong/55 ${passThrough ? 'pointer-events-none' : 'pointer-events-auto'}`;
  return createPortal(
    <div className="sp-tour" dir="rtl" data-fx={fx}>
      {/* The page dimmed around the part lit up; only that part can be used. */}
      {rect ? (
        <>
          <div className={dim} style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
          <div className={dim} style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <div className={dim} style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          <div className={dim} style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
          <div className="sp-tour-ring fixed pointer-events-none" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
        </>
      ) : (
        <div className={`${dim} inset-0`} />
      )}

      <div
        ref={boxRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-placement={placement}
        style={style}
        className={`sp-tour-box fixed bg-white rounded-3xl shadow-2xl border border-line p-4 sm:p-5 space-y-3 text-right outline-none ${
          placement === 'center'
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(26rem,calc(100vw-1.5rem))]'
            : placement === 'bottom'
              ? 'left-3 right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))]'
              : placement === 'top'
                ? 'left-3 right-3 top-[calc(0.75rem+env(safe-area-inset-top))]'
                : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg text-ink leading-snug">
            {title}
          </h2>
          {progress && (
            <span className="shrink-0 text-[11px] font-bold text-faint pt-1 tabular-nums" aria-label={`قدم ${toPersianDigits(progress.step)} از ${toPersianDigits(progress.of)}`}>
              {toPersianDigits(progress.step)} از {toPersianDigits(progress.of)}
            </span>
          )}
        </div>
        <div className="text-sm text-ink-soft leading-loose space-y-2" aria-live="polite">
          {children}
        </div>
        {(actions || onSkip) && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {onSkip ? (
              <button type="button" onClick={onSkip} className="tap-area text-xs font-bold text-faint hover:text-ink">
                رد شدن از آموزش
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-2 ms-auto">{actions}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export const tourPrimary = 'px-4 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl disabled:opacity-50 disabled:cursor-not-allowed';
export const tourSecondary = 'px-4 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl';

/**
 * A small celebration at the end of a tutorial or of the missions, following the rules of «سپاس»'s
 * effects: coins and sparks on a computer, one coin that pops on a phone, nothing when nothing should move.
 */
export function celebrate(fx: EffectsLevel) {
  if (fx === 'none') return;
  const layer = document.createElement('div');
  layer.className = 'sp-celebration';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const pieces = fx === 'full' ? 26 : 1;
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('span');
    piece.className = i % 3 === 0 || fx === 'light' ? 'sp-celebration-coin' : 'sp-celebration-spark';
    layer.appendChild(piece);
    if (fx === 'light') {
      piece.animate([{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.5 }, { transform: 'scale(1)', opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'both' });
      continue;
    }
    const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.4;
    const reach = 120 + Math.random() * 160;
    piece.animate(
      [
        { transform: 'translate(0, 0) scale(0.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach - 60}px) scale(1) rotate(${200 + Math.random() * 300}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${Math.cos(angle) * reach * 1.1}px, ${Math.sin(angle) * reach + 80}px) scale(0.8) rotate(540deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 300, delay: Math.random() * 120, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
    );
  }
  window.setTimeout(() => layer.remove(), 1900);
}
