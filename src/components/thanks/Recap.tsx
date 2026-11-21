import React from 'react';
import { ModalCloseButton, ModalShell } from '../common/Modal';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../lib/jalali';
import { CoinFace } from './Coin';
import type { EffectsLevel } from './effects';
import { toneClass } from './ThanksCardFace';
import type { ThanksPerson } from './thanksStore';

// «کارنامهٔ سپاس» (phase 2, 2.3): a small personal card for a month, like a year-in-review but monthly.
// It is the colleague's alone: nobody else, not even the programme's owner, can read it.

const fa = toPersianDigits;

export interface Recap {
  month: string;
  gave: { recognitions: number; people: number; units: number; newUnits: number; coins: number };
  received: {
    recognitions: number;
    coins: number;
    topValue: { label: string; tone: string } | null;
    quote: { message: string; from: ThanksPerson } | null;
  };
}

/** «آبان ۱۴۰۵». */
export const monthTitle = (month: string) => `${JALALI_MONTH_NAMES[Number(month.slice(5)) - 1] ?? ''} ${fa(month.slice(0, 4))}`;

/** What the month comes to in one line, from what was done in it (never a reproach for what was not). */
function headline(r: Recap) {
  const { gave } = r;
  if (gave.people > 0) {
    return gave.units > 1
      ? `این ماه از ${fa(gave.people)} همکار در ${fa(gave.units)} واحد قدردانی کردید`
      : `این ماه از ${fa(gave.people)} همکار قدردانی کردید`;
  }
  return `این ماه ${fa(r.received.recognitions)} قدردانی برایتان رسید`;
}

/** The card itself: also shown again, smaller, among the past months in «گنجینهٔ من». */
export const RecapCard: React.FC<{ recap: Recap; headingId?: string }> = ({ recap, headingId }) => {
  const { gave, received } = recap;
  const stats = [
    { n: gave.coins, label: 'سکه بخشیدید', show: gave.coins > 0 },
    { n: received.coins, label: 'سکه گرفتید', show: received.coins > 0 },
    { n: gave.newUnits, label: 'واحد تازه', show: gave.newUnits > 0 },
  ].filter((s) => s.show);
  return (
    <div className="sp-recap space-y-4">
      <p className="text-xs font-bold text-muted flex items-center gap-1.5">
        <span className="w-5 h-5 inline-block">
          <CoinFace />
        </span>
        کارنامهٔ سپاس · {monthTitle(recap.month)}
      </p>
      <h2 id={headingId} className="font-display text-2xl text-ink leading-snug">
        {headline(recap)}
      </h2>
      {stats.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="p-3 rounded-2xl bg-gold-soft/60 border border-gold/40 text-center">
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <strong className="block font-display text-2xl text-ink">{fa(s.n)}</strong>
                <span className="text-xs text-muted">{s.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {received.topValue && (
        <p className="text-sm text-ink-soft">
          ارزشی که بیشتر برایش از شما تشکر شد:{' '}
          <span className={`sp-value ${toneClass(received.topValue.tone)} inline-block px-2.5 py-0.5 rounded-full text-xs font-bold`} aria-pressed="true">
            {received.topValue.label}
          </span>
        </p>
      )}
      {received.quote && (
        <blockquote className="p-4 rounded-2xl bg-surface border border-line text-sm text-ink leading-loose">
          «{received.quote.message}»
          <footer className="mt-1 text-xs text-muted">
            {received.quote.from.name}
            {received.quote.from.department ? `، ${received.quote.from.department}` : ''}
          </footer>
        </blockquote>
      )}
    </div>
  );
};

/** Opens by itself once, the first time the page is seen in the month after. */
export const RecapDialog: React.FC<{ recap: Recap; fx: EffectsLevel; onClose: () => void }> = ({ recap, fx, onClose }) => (
  <ModalShell onClose={onClose} size="md" label={`کارنامهٔ سپاس ${monthTitle(recap.month)}`}>
    <ModalCloseButton onClose={onClose} className="absolute top-3 left-3 z-10" />
    <div className="sp p-6 sm:p-7 overflow-y-auto" data-fx={fx}>
      <RecapCard recap={recap} />
      <p className="mt-4 text-xs text-faint">این کارنامه فقط برای خود شماست. بعداً هم در «گنجینهٔ من» هست.</p>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl">
          ممنون
        </button>
      </div>
    </div>
  </ModalShell>
);
