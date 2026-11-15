import React from 'react';
import { ChevronLeft, HandHeart } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { featureInPreview } from '../../lib/features';
import { JALALI_MONTH_NAMES, toPersianDigits } from '../../lib/jalali';
import { CoinFace, CoinTray, MiniEnvelope } from './Coin';
import { useEffectsLevel } from './effects';
import { toneClass } from './ThanksCardFace';
import { openGive, openReveal, useThanks, type OpenedCard, type Wallet } from './thanksStore';

const fa = toPersianDigits;

/** «آبان»: the name of the wallet's Jalali month ('1405/08'). */
export const monthName = (month: string) => JALALI_MONTH_NAMES[Number(month.slice(5)) - 1] ?? '';

/** How far the month has gone, with what that means for the coins left. */
export const MonthLine: React.FC<{ wallet: Wallet }> = ({ wallet }) => (
  <div className="space-y-1.5">
    <div className="sp-month" role="progressbar" aria-valuemin={0} aria-valuemax={wallet.daysInMonth} aria-valuenow={wallet.day} aria-label="روزهای گذشته از ماه">
      <span style={{ width: `${(wallet.day / wallet.daysInMonth) * 100}%` }} />
    </div>
    <p className="text-xs text-faint">
      {wallet.daysLeft <= 1 ? `امروز آخرین روز ${monthName(wallet.month)} است` : `${fa(wallet.daysLeft)} روز تا پایان ${monthName(wallet.month)}`}
      {wallet.left > 0 && '؛ سکه‌های مانده با ماه تمام می‌شود.'}
    </p>
  </div>
);

/**
 * The dashboard card of «سپاس»: this month's coins as stacks, how much of the month is left, the
 * button to recognise a colleague, and what has arrived for this colleague (sealed envelopes first).
 */
export const ThanksCard: React.FC = () => {
  const { appSettings, setActiveTab } = usePortal();
  const { wallet, received, loaded } = useThanks();
  const fx = useEffectsLevel();
  if (!loaded || !wallet) return null;

  const sealed = received.filter((c) => c.sealed);
  const lastOpened = received.find((c): c is OpenedCard => !c.sealed) ?? null;

  return (
    <section className="sp bg-white border border-line/70 shadow-card rounded-3xl p-4 space-y-3" data-fx={fx} aria-labelledby="thanks-card-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 shrink-0">
            <CoinFace />
          </span>
          <h2 id="thanks-card-title" className="font-display text-xl text-ink leading-none pt-1">
            سپاس
          </h2>
          {featureInPreview(appSettings, 'recognition') && <span className="px-2 py-0.5 text-xs font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>}
        </div>
        <button type="button" onClick={() => setActiveTab('thanks')} className="tap-area text-xs font-bold text-brand hover:underline flex items-center gap-1 whitespace-nowrap">
          گنجینهٔ من
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="sp-wallet-stage px-3 pt-1 pb-3">
        <CoinTray allowance={wallet.allowance} left={wallet.left} fx={fx} filling />
        <p className="text-center text-xs text-muted">
          <strong className="font-display text-2xl text-ink align-middle">{fa(wallet.left)}</strong> سکه برای بخشیدن
          <span className="text-faint"> از {fa(wallet.allowance)}</span>
        </p>
      </div>

      <MonthLine wallet={wallet} />

      {sealed.length > 0 ? (
        <button
          type="button"
          onClick={() => openReveal(sealed[0].id)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gold-soft border border-gold/50 text-right hover:border-gold transition-colors"
        >
          <MiniEnvelope waiting />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black text-ink">
              {sealed.length === 1 ? `${sealed[0].from.name} از شما قدردانی کرده است` : `${fa(sealed.length)} قدردانی مهرشده برای شماست`}
            </span>
            <span className="block text-xs text-muted">مهر را باز کنید و بخوانید</span>
          </span>
          <ChevronLeft className="w-4 h-4 text-faint shrink-0" />
        </button>
      ) : (
        lastOpened && (
          <button
            type="button"
            onClick={() => openReveal(lastOpened.id)}
            className={`${toneClass(lastOpened.value.tone)} w-full p-3 rounded-2xl text-right border transition-colors`}
            style={{ background: 'var(--sp-soft)', borderColor: 'color-mix(in oklab, var(--sp-a) 30%, transparent)' }}
          >
            <span className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold truncate" style={{ color: 'var(--sp-ink)' }}>
                {lastOpened.from.name} · {lastOpened.value.label}
              </span>
              {lastOpened.reaction && <span>{lastOpened.reaction}</span>}
            </span>
            <span className="block mt-1 text-xs text-ink-soft leading-relaxed line-clamp-2">{lastOpened.message}</span>
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => openGive()}
        disabled={wallet.left <= 0}
        className="w-full py-2.5 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-brand/20 transition-colors flex items-center justify-center gap-1.5"
      >
        <HandHeart className="w-4 h-4" />
        {wallet.left > 0 ? 'قدردانی کن' : 'سهمیهٔ این ماه تمام شد'}
      </button>
      {wallet.received.coins > 0 && (
        <p className="text-center text-xs text-faint">
          تا امروز <strong className="text-ink-soft">{fa(wallet.received.coins)} سکه</strong> از همکاران گرفته‌اید.
        </p>
      )}
    </section>
  );
};
