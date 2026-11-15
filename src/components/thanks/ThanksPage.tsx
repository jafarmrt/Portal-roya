import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, HandHeart, Inbox, Send, Sparkles, Undo2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import { PageHeader } from '../common/PageHeader';
import { EmptyState, SkeletonRows } from '../common/Placeholder';
import { CoinBadge, CoinFace, CoinTray, MiniEnvelope } from './Coin';
import { effectsWanted, setEffectsWanted, useEffectsLevel } from './effects';
import { MonthLine } from './ThanksCard';
import { ThanksCardFace } from './ThanksCardFace';
import {
  loadMoreThanks,
  openGive,
  openReveal,
  useThanks,
  withdrawThanks,
  type GivenCard,
  type ReceivedCard,
  type ThanksPerson,
} from './thanksStore';

const fa = toPersianDigits;

/** «پس گرفتن», with the time left for it; it is gone when the time is. */
const Withdraw: React.FC<{ card: GivenCard }> = ({ card }) => {
  const until = card.withdrawUntil ? new Date(card.withdrawUntil).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const seconds = Math.max(0, Math.round((until - now) / 1000));
  if (seconds <= 0) return <span className="text-xs text-faint">در راه است…</span>;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void withdrawThanks(card.id).then((ok) => {
          if (ok) toast.success('قدردانی پس گرفته شد و سکه‌ها برگشت.');
          else setBusy(false);
        });
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line-strong bg-white hover:bg-surface text-xs font-bold text-ink"
    >
      <Undo2 className="w-3.5 h-3.5" />
      پس گرفتن
      <span className="tabular-nums text-faint">
        {fa(Math.floor(seconds / 60))}:{fa(String(seconds % 60).padStart(2, '0'))}
      </span>
    </button>
  );
};

const givenState = (card: GivenCard) => {
  if (!card.delivered) return null;
  if (card.opened) return card.reaction ? `خوانده شد ${card.reaction}` : 'خوانده شد';
  return 'رسید؛ هنوز باز نشده';
};

const Given: React.FC<{ card: GivenCard; me: ThanksPerson }> = ({ card, me }) => (
  <ThanksCardFace
    value={card.value}
    from={me}
    to={card.to}
    message={card.message}
    placeholder={`با قدردانی دیگری از ${card.to.name} همراه شدید («من هم»).`}
    isPrivate={!card.isPublic}
    note={<span>{timeAgo(card.at)}</span>}
    className={card.reversed ? 'opacity-70' : ''}
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CoinBadge amount={card.amount} />
      {card.reversed ? (
        <span className="text-xs font-bold text-danger-700">برگردانده شد</span>
      ) : card.withdrawUntil ? (
        <Withdraw card={card} />
      ) : (
        <span className="text-xs text-muted">{givenState(card) ?? 'در راه است…'}</span>
      )}
    </div>
    {card.reversed && card.reverseReason && <p className="text-xs text-muted leading-relaxed">دلیل مسئول برنامه: {card.reverseReason}</p>}
  </ThanksCardFace>
);

const Received: React.FC<{ card: ReceivedCard; me: ThanksPerson; focused: boolean }> = ({ card, me, focused }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);
  if (card.sealed) {
    return (
      <div ref={ref}>
        <button
          type="button"
          onClick={() => openReveal(card.id)}
          className="w-full h-full min-h-28 flex items-center gap-4 p-4 rounded-[1.25rem] bg-gold-soft border border-gold/50 hover:border-gold text-right transition-colors shadow-card"
        >
          <MiniEnvelope waiting />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg text-ink leading-tight">قدردانی مهرشده</span>
            <span className="block text-xs text-muted">
              از طرف {card.from.name} · {timeAgo(card.at)}
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold text-brand flex items-center gap-1">
            باز کن <ChevronLeft className="w-4 h-4" />
          </span>
        </button>
      </div>
    );
  }
  return (
    <div ref={ref} className={focused ? 'rounded-[1.25rem] ring-2 ring-gold ring-offset-2 ring-offset-page' : undefined}>
      <ThanksCardFace value={card.value} from={card.from} to={me} message={card.message} isPrivate={!card.isPublic} note={<span>{timeAgo(card.at)}</span>} className="h-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CoinBadge amount={card.total} title={card.joiners.length ? `${fa(card.amount)} سکه و ${fa(card.total - card.amount)} سکه از همراهان` : undefined} />
          <button type="button" onClick={() => openReveal(card.id)} className="tap-area text-xs font-bold text-brand hover:underline">
            {card.reaction ? `پاسخ شما ${card.reaction}` : 'پاسخ بدهید'}
          </button>
        </div>
        {card.joiners.length > 0 && <p className="text-xs text-muted">{card.joiners.map((j) => j.name).join('، ')} هم همراه شدند.</p>}
      </ThanksCardFace>
    </div>
  );
};

/**
 * The «سپاس» page: the month's wallet and the colleague's own recognitions, the ones they received
 * (sealed until they open them) and the ones they gave (with «پس گرفتن» for the first minutes).
 */
export const ThanksPage: React.FC = () => {
  const { currentUser, focusId } = usePortal();
  const { wallet, received, receivedNext, given, givenNext, loaded } = useThanks();
  const fx = useEffectsLevel();
  const [tab, setTab] = useState<'received' | 'given'>('received');
  const [wanted, setWanted] = useState(effectsWanted);
  const [more, setMore] = useState(false);

  // A notification brings the colleague here for one recognition: a sealed one opens at once.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !focusId || handled.current === focusId) return;
    handled.current = focusId;
    const card = received.find((c) => c.id === focusId);
    if (card?.sealed) openReveal(card.id);
    else if (!card && given.some((g) => g.id === focusId)) setTab('given');
  }, [loaded, focusId, received, given]);

  if (!currentUser) return null;
  const me: ThanksPerson = {
    id: currentUser.id,
    name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
    avatar: currentUser.avatar,
    position: currentUser.position,
    department: currentUser.department,
  };
  const sealedCount = received.filter((c) => c.sealed).length;
  const next = tab === 'received' ? receivedNext : givenNext;

  return (
    <div className="sp space-y-6" data-fx={fx}>
      <PageHeader
        icon={<HandHeart />}
        title="سپاس"
        description="قدردانی همکاران از هم، با «سکهٔ سپاس» و یک پیام. سکه‌های هر ماه فقط برای بخشیدن است؛ آنچه می‌گیرید برای همیشه می‌ماند."
      >
        <button
          type="button"
          onClick={() => openGive()}
          disabled={!wallet || wallet.left <= 0}
          className="px-4 py-2.5 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-brand/20 transition-colors flex items-center gap-1.5"
        >
          <HandHeart className="w-4 h-4" /> قدردانی کن
        </button>
      </PageHeader>

      {!loaded || !wallet ? (
        <SkeletonRows rows={4} tall />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 bg-white border border-line/70 shadow-card rounded-3xl p-4 sm:p-5 grid sm:grid-cols-2 gap-4 items-center" aria-label="کیف این ماه">
              <div className="sp-wallet-stage px-3 pt-1 pb-3">
                <CoinTray allowance={wallet.allowance} left={wallet.left} size="md" fx={fx} filling />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-bold text-muted">کیف این ماه</p>
                  <p className="text-sm text-ink-soft">
                    <strong className="font-display text-4xl text-ink align-middle">{fa(wallet.left)}</strong> سکه برای بخشیدن
                    <span className="text-faint"> از {fa(wallet.allowance)}</span>
                  </p>
                </div>
                <MonthLine wallet={wallet} />
                <p className="text-xs text-faint leading-relaxed">
                  هر قدردانی {wallet.amounts.map(fa).join('، ')} سکه است؛ به هر همکار تا {fa(wallet.rules.perPersonMax)} سکه در ماه.
                </p>
              </div>
            </section>

            <section className="bg-white border border-line/70 shadow-card rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3" aria-label="گنجینهٔ من">
              <div className="flex items-center gap-3">
                <span className="w-14 h-14 shrink-0">
                  <CoinFace />
                </span>
                <div>
                  <p className="text-xs font-bold text-muted">گنجینهٔ من</p>
                  {wallet.received.coins > 0 ? (
                    <p className="text-sm text-ink-soft">
                      <strong className="font-display text-4xl text-ink align-middle">{fa(wallet.received.coins)}</strong> سکه
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-ink-soft pt-1">هنوز سکه‌ای در آن نیست</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-faint leading-relaxed">
                سکه‌هایی که از همکاران گرفته‌اید. این سکه‌ها نمی‌سوزد و قابل بخشیدن دوباره نیست.
                {sealedCount > 0 && ` ${fa(sealedCount)} قدردانی مهرشده هنوز شمرده نشده است.`}
              </p>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex p-1 bg-surface rounded-2xl" role="tablist" aria-label="قدردانی‌های من">
              {[
                { id: 'received' as const, label: 'دریافتی‌ها', icon: <Inbox className="w-4 h-4" />, badge: sealedCount },
                { id: 'given' as const, label: 'داده‌ها', icon: <Send className="w-4 h-4" />, badge: 0 },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {t.badge > 0 && <span className="px-1.5 rounded-full bg-gold text-ink-strong text-xs">{fa(t.badge)}</span>}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={wanted}
                onChange={(e) => {
                  setWanted(e.target.checked);
                  setEffectsWanted(e.target.checked);
                }}
                className="accent-red-600"
              />
              <Sparkles className="w-3.5 h-3.5" /> جلوه‌های حرکتی
            </label>
          </div>

          {tab === 'received' ? (
            received.length === 0 ? (
              <EmptyState icon={<Inbox />} title="هنوز قدردانی‌ای برایتان نرسیده است" hint="وقتی همکاری از شما قدردانی کند، مثل یک پاکت مهرشده همین‌جا می‌آید." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* What still waits to be opened comes first. */}
                {[...received.filter((c) => c.sealed), ...received.filter((c) => !c.sealed)].map((card) => (
                  <Received key={card.id} card={card} me={me} focused={card.id === focusId} />
                ))}
              </div>
            )
          ) : given.length === 0 ? (
            <EmptyState
              icon={<Send />}
              title="هنوز از کسی قدردانی نکرده‌اید"
              hint="کار خوب یک همکار را دیده‌اید؟ چند سکه و یک پیام کافی است."
              action={
                <button type="button" onClick={() => openGive()} className="mt-1 px-4 py-2 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded-xl">
                  قدردانی کن
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {given.map((card) => (
                <Given key={card.id} card={card} me={me} />
              ))}
            </div>
          )}

          {next && (
            <div className="text-center">
              <button
                type="button"
                disabled={more}
                onClick={() => {
                  setMore(true);
                  void loadMoreThanks(tab).finally(() => setMore(false));
                }}
                className="px-5 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl"
              >
                بیشتر
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
