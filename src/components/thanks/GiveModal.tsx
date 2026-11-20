import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Globe, HandHeart, Loader2, Lock, Send, Undo2 } from 'lucide-react';
import { messageLength, recognitionLimits } from '../../../shared/recognition';
import { usePortal } from '../../context/PortalContext';
import { errorMessage } from '../../lib/api';
import { readDraft, useDraft } from '../../lib/drafts';
import { haptic } from '../../lib/feedback';
import { toPersianDigits } from '../../lib/jalali';
import { DraftNote } from '../common/DraftNote';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { SearchableSelect } from '../common/SearchableSelect';
import { Coin3D, CoinTray } from './Coin';
import { flyCoins, useEffectsLevel } from './effects';
import { ThanksCardFace, toneClass } from './ThanksCardFace';
import { closeGive, giveThanks, loadColleagues, setGiveForm, useThanks, withdrawThanks, type Colleague, type ThanksPerson } from './thanksStore';

const fa = toPersianDigits;

/** For how long the «پس گرفتن» button stays on screen after sending; later it is on the «سپاس» page. */
const UNDO_TOAST_MS = 10_000;

/** «فرستاده شد» with a way back: the receiver hears of it only after the minutes for taking it back. */
function sentToast(id: string, name: string, undoMs: number) {
  const minutes = Math.round(undoMs / 60_000);
  const toastId = toast.custom(
    (t) => (
      <div
        role="status"
        dir="rtl"
        className={`flex items-center gap-3 pl-2 pr-4 py-2 rounded-2xl bg-ink text-white text-sm shadow-lg transition-opacity ${t.visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <span>
          قدردانی برای {name} در راه است. <span className="opacity-70">تا {fa(minutes)} دقیقه می‌توانید پس بگیرید.</span>
        </span>
        <button
          type="button"
          onClick={() => {
            toast.dismiss(toastId);
            void withdrawThanks(id).then((ok) => ok && toast.success('قدردانی پس گرفته شد و سکه‌ها برگشت.'));
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 font-bold text-xs whitespace-nowrap"
        >
          <Undo2 className="w-3.5 h-3.5" /> پس گرفتن
        </button>
      </div>
    ),
    { duration: UNDO_TOAST_MS },
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const DRAFT_NAME = 'thanks';

interface GiveDraft {
  to: string;
  amount: number | null;
  valueId: string;
  message: string;
  isPublic: boolean;
}

/**
 * «قدردانی کن»: to whom, how many coins, for which value, and the message. Next to the form the month's
 * wallet lifts the coins being given and a card shows the recognition as the colleague will get it.
 */
export const GiveModal: React.FC<{ to?: string }> = ({ to: initialTo }) => {
  const { currentUser } = usePortal();
  const { wallet, touring } = useThanks();
  const fx = useEffectsLevel();
  const [colleagues, setColleagues] = useState<Colleague[] | null>(null);
  // A message that was being written and not sent (the form was closed, the page refreshed) comes back,
  // unless the form was opened for somebody else.
  const [restored, setRestored] = useState(() => {
    const saved = readDraft<Partial<GiveDraft>>(currentUser?.id, DRAFT_NAME);
    return saved && typeof saved.message === 'string' && (!initialTo || saved.to === initialTo) ? saved : null;
  });
  const [to, setTo] = useState(initialTo ?? (typeof restored?.to === 'string' ? restored.to : ''));
  const [amount, setAmount] = useState<number | null>(typeof restored?.amount === 'number' ? restored.amount : null);
  const [valueId, setValueId] = useState(typeof restored?.valueId === 'string' ? restored.valueId : '');
  const [message, setMessage] = useState(restored?.message ?? '');
  const [isPublic, setIsPublic] = useState(restored?.isPublic !== false);
  const draft = useDraft(currentUser?.id, DRAFT_NAME, { to, amount, valueId, message, isPublic }, message.trim() !== '');
  const startOver = () => {
    setTo(initialTo ?? '');
    setAmount(null);
    setValueId('');
    setMessage('');
    setIsPublic(true);
    setRestored(null);
  };
  const [busy, setBusy] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [sent, setSent] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLSpanElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadColleagues()
      .then((list) => alive && setColleagues(list))
      .catch((err) => {
        toast.error(errorMessage(err));
        closeGive();
      });
    return () => {
      alive = false;
    };
  }, []);

  // The tutorial follows the form: who was chosen, which value, whether the message is long enough.
  const formName = colleagues?.find((c) => c.id === to)?.name ?? '';
  const formLetters = messageLength(message);
  const formEnough = formLetters >= (wallet?.messageMin ?? Infinity);
  useEffect(() => {
    setGiveForm({ colleagues: colleagues?.length ?? null, to, name: formName, valueId, letters: formLetters, enough: formEnough, restored: Boolean(restored) });
  }, [colleagues, to, formName, valueId, formLetters, formEnough, restored]);
  useEffect(() => () => setGiveForm(null), []);

  if (!wallet || !currentUser) return null;

  const me: ThanksPerson = {
    id: currentUser.id,
    name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
    avatar: currentUser.avatar,
    position: currentUser.position,
    department: currentUser.department,
  };
  const person = colleagues?.find((c) => c.id === to) ?? null;
  const value = wallet.values.find((v) => v.id === valueId) ?? null;
  // What can still go to this colleague: the month's rest, and the month's limit for one person.
  const room = wallet.rules.perPersonMax - (person?.givenThisMonth ?? 0);
  const cap = Math.min(wallet.left, room);
  const allowed = (a: number) => a <= cap;
  const fallback = [...wallet.amounts].reverse().find((a) => a <= Math.min(cap, wallet.defaultAmount)) ?? wallet.amounts.find(allowed) ?? null;
  const chosen = amount !== null && allowed(amount) ? amount : fallback;
  const letters = messageLength(message);
  const enough = letters >= wallet.messageMin;
  const dayDone = wallet.writtenToday >= wallet.rules.dailyMax;

  const blocked =
    wallet.left <= 0
      ? recognitionLimits.monthDone()
      : dayDone
        ? recognitionLimits.daily(wallet.rules.dailyMax)
        : person && room <= 0
          ? recognitionLimits.perPerson(wallet.rules.perPersonMax, person.name)
          : null;
  const canSend = Boolean(person && chosen !== null && value && enough && !blocked && !busy);

  const send = async () => {
    if (!canSend || !person || chosen === null || !value) return;
    setBusy(true);
    // Where the lifted coins are now; once the wallet answers they are no longer in it.
    const lifted = [...(trayRef.current?.querySelectorAll('.sp-disc.is-picked') ?? [])].map((el) => el.getBoundingClientRect());
    const sent = await giveThanks({ to: person.id, name: person.name, amount: chosen, valueId: value.id, message: message.trim(), isPublic });
    if (!sent) {
      setBusy(false);
      return;
    }
    draft.discard();
    haptic(12);
    setSent(true);
    await flyCoins(lifted, coinRef.current, fx);
    if (fx !== 'none') {
      setStamped(true);
      await wait(fx === 'full' ? 520 : 320);
    }
    closeGive();
    // During the tutorial its own step shows the way back, on the «سپاس» page.
    if (!touring) sentToast(sent.id, person.name, wallet.undoMs);
  };

  // The card leans towards the mouse, and a light follows it.
  const onTilt = (e: React.PointerEvent) => {
    if (fx !== 'full' || !tiltRef.current) return;
    const box = tiltRef.current.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const s = tiltRef.current.style;
    s.setProperty('--sp-ry', `${((x - 0.5) * 16).toFixed(1)}deg`);
    s.setProperty('--sp-rx', `${((0.5 - y) * 12).toFixed(1)}deg`);
    s.setProperty('--sp-gx', `${(x * 100).toFixed(0)}%`);
    s.setProperty('--sp-gy', `${(y * 100).toFixed(0)}%`);
  };
  const offTilt = () => {
    for (const name of ['--sp-ry', '--sp-rx']) tiltRef.current?.style.removeProperty(name);
  };

  return (
    <Modal
      title="قدردانی از یک همکار"
      subtitle="سکه‌هایتان فقط برای بخشیدن است؛ پیام شماست که می‌ماند."
      icon={<HandHeart className="w-5 h-5" />}
      size="xl"
      onClose={closeGive}
      footer={
        <>
          <p className="w-full sm:w-auto sm:me-auto self-center text-xs text-muted">
            {sent ? (
              <>در راه است…</>
            ) : chosen !== null && !blocked ? (
              <>
                پس از این قدردانی <strong className="text-ink">{fa(wallet.left - chosen)} سکه</strong> برایتان می‌ماند.
              </>
            ) : (
              <>{fa(wallet.left)} سکه از سهمیهٔ این ماه مانده است.</>
            )}
          </p>
          <button type="button" onClick={closeGive} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="button" onClick={() => void send()} disabled={!canSend} className={primaryButtonClass} data-tour="give-send">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            بفرست
          </button>
        </>
      }
    >
      <div className="sp flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] gap-5 text-sm" data-fx={fx}>
        {/* The month's wallet: the coins of the chosen amount lift off the last stack. */}
        <div className="order-1 lg:order-2 lg:row-span-2 lg:self-start space-y-4">
          <div ref={trayRef} className="sp-wallet-stage px-3 pt-1 pb-3">
            <CoinTray allowance={wallet.allowance} left={wallet.left} picked={blocked || sent ? 0 : (chosen ?? 0)} size="md" fx={fx} />
            <p className="text-center text-xs text-muted">
              <strong className="font-display text-lg text-ink align-middle">{fa(wallet.left)}</strong> سکه از {fa(wallet.allowance)} سکهٔ این ماه
            </p>
          </div>

          {/* The recognition as it will arrive. */}
          <div className="hidden lg:block">
            <p className={labelClass}>پیش‌نمایش</p>
            <div ref={tiltRef} className="sp-tilt" onPointerMove={onTilt} onPointerLeave={offTilt}>
              <div className="sp-tilt-inner">
                <ThanksCardFace
                  value={value}
                  from={me}
                  to={person}
                  message={message.trim()}
                  placeholder="پیام شما اینجا دیده می‌شود."
                  isPrivate={!isPublic}
                  className="pb-5"
                />
                <span className="sp-tilt-glare" />
                <span ref={coinRef} className={`sp-tilt-coin ${stamped ? 'is-stamped' : ''}`}>
                  <span className="relative grid place-items-center">
                    <Coin3D size={58} />
                    {chosen !== null && (
                      <span className="absolute -top-2 -left-2 min-w-6 h-6 px-1.5 grid place-items-center rounded-full bg-ink text-white font-display text-sm leading-none shadow">
                        {fa(chosen)}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            </div>
            <p className="mt-7 text-xs text-faint leading-relaxed">عدد سکه را فقط شما و {person?.name ?? 'همکارتان'} می‌بینید.</p>
          </div>
        </div>

        <div className="order-2 lg:order-1 space-y-4 min-w-0">
          {restored && !sent && <DraftNote onDiscard={startOver}>قدردانی‌ای که قبلاً می‌نوشتید و فرستاده نشده بود، برگردانده شد.</DraftNote>}
          <div data-tour="give-to">
            <label htmlFor="thanks-to" className={labelClass}>
              از چه کسی قدردانی می‌کنید؟
            </label>
            <SearchableSelect
              id="thanks-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
              disabled={!colleagues || busy}
              placeholder={colleagues ? 'همکار را انتخاب کنید' : 'در حال دریافت فهرست همکاران…'}
              aria-label="همکار"
            >
              {(colleagues ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.department ? ` · ${c.department}` : ''}
                </option>
              ))}
            </SearchableSelect>
            {person && person.givenThisMonth > 0 && (
              <p className="mt-1 text-xs text-faint">
                این ماه {fa(person.givenThisMonth)} سکه به {person.name} داده‌اید (سقف هر همکار {fa(wallet.rules.perPersonMax)} سکه در ماه).
              </p>
            )}
          </div>

          <div data-tour="give-amount">
            <p className={labelClass} id="thanks-amount-label">
              چند سکه؟
            </p>
            <div className="flex flex-wrap gap-3 pt-1.5" role="group" aria-labelledby="thanks-amount-label">
              {wallet.amounts.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="sp-amount font-display text-xl"
                  aria-pressed={chosen === a}
                  aria-label={`${fa(a)} سکه`}
                  disabled={!allowed(a) || Boolean(blocked)}
                  onClick={() => {
                    if (busy) return;
                    setAmount(a);
                    haptic();
                  }}
                >
                  <span className="pt-1">{fa(a)}</span>
                </button>
              ))}
            </div>
            {blocked && <p className="mt-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{blocked}</p>}
          </div>

          <div data-tour="give-values">
            <p className={labelClass} id="thanks-value-label">
              برای کدام ارزش؟
            </p>
            {/* Each value with its line from «برنامهٔ سپاس», so it is clear which one fits the work. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-labelledby="thanks-value-label">
              {wallet.values.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`sp-value sp-value-card ${toneClass(v.tone)} px-3.5 py-2 rounded-2xl text-right`}
                  aria-pressed={valueId === v.id}
                  aria-label={v.label}
                  aria-describedby={v.description ? `thanks-value-${v.id}` : undefined}
                  disabled={busy}
                  onClick={() => setValueId(v.id)}
                >
                  <span className="block text-xs font-bold">{v.label}</span>
                  {v.description && (
                    <span id={`thanks-value-${v.id}`} className="block text-xs font-normal opacity-80 leading-relaxed mt-0.5">
                      {v.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div data-tour="give-message">
            <label htmlFor="thanks-message" className={labelClass}>
              پیام تشکر
            </label>
            <textarea
              id="thanks-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={wallet.messageMax}
              disabled={busy}
              className={`${inputClass} leading-loose resize-y`}
              placeholder="چه کاری کرد؟ چه اثری داشت؟ هرچه مشخص‌تر بنویسید، بیشتر به دل می‌نشیند."
            />
            <p className={`mt-1 text-xs flex items-center gap-1 ${enough ? 'text-emerald-700' : 'text-faint'}`} aria-live="polite">
              {enough ? (
                <>
                  <Check className="w-3.5 h-3.5" /> کافی است.
                </>
              ) : (
                <>
                  {fa(letters)} از {fa(wallet.messageMin)} حرف
                </>
              )}
            </p>
          </div>

          <div data-tour="give-visibility">
            <p className={labelClass} id="thanks-visibility-label">
              چه کسی این قدردانی را ببیند؟
            </p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="thanks-visibility-label">
              {[
                { on: true, icon: <Globe className="w-4 h-4" />, label: 'همه ببینند', hint: 'روی دیوار سپاس، بدون عدد سکه' },
                { on: false, icon: <Lock className="w-4 h-4" />, label: 'فقط ما دو نفر', hint: 'هیچ‌کس دیگری آن را نمی‌خواند' },
              ].map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={isPublic === choice.on}
                  disabled={busy}
                  onClick={() => setIsPublic(choice.on)}
                  className={`flex items-start gap-2 p-3 rounded-2xl border text-right transition-colors ${
                    isPublic === choice.on ? 'border-red-600 bg-red-50 text-red-900' : 'border-line-strong bg-white text-ink-soft hover:bg-surface'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{choice.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{choice.label}</span>
                    <span className="block text-xs opacity-75">{choice.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
