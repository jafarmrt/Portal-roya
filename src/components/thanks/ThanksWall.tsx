import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, EyeOff, Filter, HandHeart, Loader2, Newspaper } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { haptic } from '../../lib/feedback';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import { ReactionBar } from '../common/ReactionBar';
import { EmptyState, SkeletonRows } from '../common/Placeholder';
import { CoinFace, MiniEnvelope } from './Coin';
import { flyCoins, type EffectsLevel } from './effects';
import { ThanksCardFace, toneClass } from './ThanksCardFace';
import { hideThanks, joinThanks, loadMoreWall, openGive, openReveal, setWallFilter, useThanks, watchWall, type Wallet, type WallCard } from './thanksStore';
import { Withdraw } from './Withdraw';

const fa = toPersianDigits;

/** «علی و سارا», «علی، سارا و مینا». */
const namesList = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join('، ')} و ${names.at(-1)}`);

/** Sparks around the pin when a «من هم» lands: only ever drawn on a computer. */
const Burst: React.FC = () => {
  const sparks = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
        const reach = 34 + Math.random() * 30;
        return { dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach, delay: Math.random() * 90 };
      }),
    [],
  );
  return (
    <>
      {sparks.map((s, i) => (
        <span key={i} className="sp-spark" style={{ '--sp-dx': `${s.dx.toFixed(0)}px`, '--sp-dy': `${s.dy.toFixed(0)}px`, '--sp-delay': `${s.delay.toFixed(0)}ms` } as React.CSSProperties} />
      ))}
    </>
  );
};

/**
 * One recognition pinned to the wall: the card in its value's colour, the receiver's own answer and
 * colleagues' emoji under it, and «من هم» for whoever saw the same work. Never an amount.
 */
const WallItem: React.FC<{ card: WallCard; index: number; fx: EffectsLevel; wallet: Wallet; meId: string; focused: boolean; fresh: boolean }> = ({ card, index, fx, wallet, meId, focused, fresh }) => {
  const root = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLSpanElement>(null);
  const joinButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    if (focused) root.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);

  // On a computer the card leans towards the mouse, and a light follows it.
  const onTilt = (e: React.PointerEvent) => {
    if (fx !== 'full' || e.pointerType !== 'mouse' || !root.current) return;
    const box = root.current.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const s = root.current.style;
    s.setProperty('--sp-ry', `${((x - 0.5) * 9).toFixed(1)}deg`);
    s.setProperty('--sp-rx', `${((0.5 - y) * 7).toFixed(1)}deg`);
    s.setProperty('--sp-gx', `${(x * 100).toFixed(0)}%`);
    s.setProperty('--sp-gy', `${(y * 100).toFixed(0)}%`);
  };
  const offTilt = () => {
    for (const name of ['--sp-ry', '--sp-rx']) root.current?.style.removeProperty(name);
  };

  const join = async () => {
    if (busy) return;
    setBusy(true);
    haptic();
    // The button is gone once the coins went, so where it was is kept for their flight.
    const from = joinButton.current?.getBoundingClientRect();
    const ok = await joinThanks(card.id);
    if (ok) {
      toast.success(`با قدردانی از ${card.to.name} همراه شدید. تا چند دقیقه می‌توانید پس بگیرید.`);
      if (from) await flyCoins(Array.from({ length: Math.min(wallet.joinAmount, 4) }, () => from), pin.current, fx);
      if (fx !== 'none') {
        setStamped(true);
        window.setTimeout(() => setStamped(false), 1500);
      }
    }
    setBusy(false);
  };

  const takeOff = async () => {
    setBusy(true);
    if (await hideThanks(card.id, true)) toast.success('از دیوار برداشته شد. در «دریافتی‌ها» می‌توانید آن را برگردانید.');
    else setBusy(false);
  };

  const state = `${fresh ? 'is-fresh' : ''} ${focused ? 'is-focused' : ''} ${stamped ? 'is-stamped' : ''}`;
  const style = { '--sp-i': Math.min(index, 11) } as React.CSSProperties;

  // The viewer's own, not opened yet: they read it by breaking its seal, not in passing here.
  if (card.sealed) {
    return (
      <div ref={root} className={`sp-pin ${state}`} style={style} id={`wall-${card.id}`}>
        <div className="sp-pin-inner">
          <span className="sp-pin-head" aria-hidden="true">
            <CoinFace plain />
          </span>
          <button
            type="button"
            onClick={() => openReveal(card.id)}
            className="w-full min-h-28 flex items-center gap-4 p-4 rounded-[1.25rem] bg-gold-soft border border-gold/50 hover:border-gold text-right transition-colors shadow-card"
          >
            <MiniEnvelope waiting />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg text-ink leading-tight">قدردانی از شما</span>
              <span className="block text-xs text-muted leading-relaxed">
                از طرف {card.from.name} · {timeAgo(card.at)}. دیگران آن را روی دیوار می‌بینند؛ شما اول مهرش را باز کنید.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold text-brand flex items-center gap-1">
              باز کن <ChevronLeft className="w-4 h-4" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  const others = card.joiners.filter((j) => j.id !== meId).map((j) => j.name);
  const joinLine = card.joined
    ? others.length > 0
      ? `شما و ${namesList(others)} همراه شدید.`
      : 'شما هم همراه شدید.'
    : others.length > 0
      ? `${namesList(others)} هم همراه ${others.length > 1 ? 'شدند' : 'شد'}.`
      : '';
  const canJoin = card.mine === null && !card.joined;
  const short = wallet.left < wallet.joinAmount;
  return (
    <div ref={root} className={`sp-pin ${state}`} style={style} id={`wall-${card.id}`} onPointerMove={onTilt} onPointerLeave={offTilt}>
      <div className="sp-pin-inner">
        <span ref={pin} className="sp-pin-head" aria-hidden="true">
          <CoinFace plain />
          {stamped && fx === 'full' && <Burst />}
        </span>
        <ThanksCardFace value={card.value} from={card.from} to={card.to} message={card.message} note={<span>{timeAgo(card.at)}</span>}>
          <div className="flex flex-wrap items-center gap-1.5">
            {card.reaction && (
              <span
                className="inline-flex items-center gap-1 h-7 px-2 rounded-full bg-gold-soft border border-gold/50 text-sm leading-none"
                title={`پاسخ ${card.to.name}`}
                aria-label={`پاسخ ${card.to.name}: ${card.reaction}`}
              >
                <span aria-hidden="true">{card.reaction}</span>
                <span className="text-xs font-bold text-ink-soft" aria-hidden="true">
                  {card.to.name.split(' ')[0]}
                </span>
              </span>
            )}
            <ReactionBar target="recognition" id={card.id} reactions={card.reactions} canReact={card.mine !== 'receiver'} label={`قدردانی از ${card.to.name}`} />
          </div>

          {joinLine && (
            <p className="flex items-start gap-1.5 text-xs text-muted leading-relaxed">
              <span className="w-4 h-4 shrink-0 mt-0.5">
                <CoinFace plain />
              </span>
              <span>{joinLine}</span>
            </p>
          )}

          {(card.mine !== null || canJoin || card.join?.withdrawUntil) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-faint">{card.mine === 'sender' ? 'قدردانی شما' : card.mine === 'receiver' ? 'قدردانی از شما' : ''}</span>
              {canJoin && (
                <button
                  ref={joinButton}
                  type="button"
                  onClick={() => void join()}
                  disabled={busy || short}
                  title={short ? 'سکه‌های این ماه شما برای همراهی کافی نیست.' : `${fa(wallet.joinAmount)} سکه از کیف این ماه شما به ${card.to.name} می‌رسد.`}
                  className="sp-join"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-4 h-4"><CoinFace plain /></span>}
                  من هم
                  <span className="font-display text-sm leading-none pt-0.5" dir="ltr">
                    +{fa(wallet.joinAmount)}
                  </span>
                </button>
              )}
              {card.joined && card.join && <Withdraw id={card.join.id} until={card.join.withdrawUntil} done="همراهی پس گرفته شد و سکه‌ها برگشت." small />}
              {card.mine === 'receiver' && (
                <button type="button" onClick={() => void takeOff()} disabled={busy} className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink">
                  <EyeOff className="w-3.5 h-3.5" /> از دیوار بردار
                </button>
              )}
            </div>
          )}
        </ThanksCardFace>
        <span className="sp-tilt-glare" />
      </div>
    </div>
  );
};

/**
 * «دیوار سپاس»: the public recognitions, newest first, to read, react to and join. It can be narrowed to
 * one value or to the unit of the colleagues who were recognised. No amounts, and no ranking of anyone.
 */
export const ThanksWall: React.FC<{ fx: EffectsLevel; wallet: Wallet; focusId: string | null }> = ({ fx, wallet, focusId }) => {
  const { appSettings, currentUser } = usePortal();
  const { wall } = useThanks();
  const [more, setMore] = useState(false);

  useEffect(() => {
    watchWall(true);
    return () => watchWall(false);
  }, []);

  // Cards that arrive while the wall is on screen (above the ones already seen) are pointed out for a moment.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    if (!wall.loaded) {
      seen.current = null;
      return;
    }
    const known = seen.current;
    seen.current = new Set([...(known ?? []), ...wall.items.map((c) => c.id)]);
    if (!known) return;
    const firstKnown = wall.items.findIndex((c) => known.has(c.id));
    const arrived = firstKnown > 0 ? wall.items.slice(0, firstKnown).map((c) => c.id) : [];
    if (arrived.length === 0) return;
    setFresh((f) => [...f, ...arrived]);
    const timer = window.setTimeout(() => setFresh((f) => f.filter((id) => !arrived.includes(id))), 6000);
    return () => window.clearTimeout(timer);
  }, [wall.items, wall.loaded]);

  const departments = appSettings?.departments ?? [];
  const filtered = wall.filter.value !== '' || wall.filter.department !== '';

  return (
    <section className="sp-wall" aria-label="دیوار سپاس">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="ارزش">
          <button type="button" aria-pressed={wall.filter.value === ''} onClick={() => setWallFilter({ value: '' })} className="sp-value sp-tone-slate px-3.5 py-1.5 rounded-full text-xs font-bold">
            همه
          </button>
          {wallet.values.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={wall.filter.value === v.id}
              onClick={() => setWallFilter({ value: wall.filter.value === v.id ? '' : v.id })}
              className={`sp-value ${toneClass(v.tone)} px-3.5 py-1.5 rounded-full text-xs font-bold`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {departments.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <Filter className="w-3.5 h-3.5" />
            <span className="sr-only">واحد همکار</span>
            <select
              value={wall.filter.department}
              onChange={(e) => setWallFilter({ department: e.target.value })}
              className="py-1.5 ps-2 pe-7 rounded-xl border border-line-strong bg-white text-xs font-bold text-ink focus:border-red-600 outline-hidden"
            >
              <option value="">همهٔ واحدها</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!wall.loaded ? (
        <SkeletonRows rows={3} tall />
      ) : wall.items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Newspaper />}
            title="با این فیلتر قدردانی‌ای روی دیوار نیست"
            action={
              <button type="button" onClick={() => setWallFilter({ value: '', department: '' })} className="mt-1 px-4 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl">
                همهٔ قدردانی‌ها
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<Newspaper />}
            title="دیوار هنوز خالی است"
            hint="اولین قدردانی‌ای که «برای همه» فرستاده شود همین‌جا می‌آید. کار خوب یک همکار را دیده‌اید؟"
            action={
              <button type="button" onClick={() => openGive()} disabled={wallet.left <= 0} className="mt-1 px-4 py-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                <HandHeart className="w-4 h-4" /> قدردانی کن
              </button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-6 items-start pt-3">
          {wall.items.map((card, i) => (
            <WallItem key={card.id} card={card} index={i} fx={fx} wallet={wallet} meId={currentUser?.id ?? ''} focused={card.id === focusId} fresh={fresh.includes(card.id)} />
          ))}
        </div>
      )}

      {wall.next && (
        <div className="text-center">
          <button
            type="button"
            disabled={more}
            onClick={() => {
              setMore(true);
              void loadMoreWall().finally(() => setMore(false));
            }}
            className="px-5 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl"
          >
            بیشتر
          </button>
        </div>
      )}
      <p className="text-center text-xs text-faint">روی دیوار عدد سکه‌ها دیده نمی‌شود؛ آن را فقط فرستنده و گیرنده می‌دانند.</p>
    </section>
  );
};
