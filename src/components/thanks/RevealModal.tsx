import React, { useMemo, useState } from 'react';
import { Flag, Loader2, MailOpen } from 'lucide-react';
import { WISH_REACTIONS } from '../../../shared/celebrations';
import { RECOGNITION_REPORT_NOTE_MAX } from '../../../shared/recognition';
import { usePortal } from '../../context/PortalContext';
import { haptic } from '../../lib/feedback';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import { ModalCloseButton, ModalShell, inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { Coin3D, CoinFace } from './Coin';
import { useCountUp, useEffectsLevel, type EffectsLevel } from './effects';
import { ThanksCardFace, toneClass } from './ThanksCardFace';
import { answerThanks, closeReveal, openThanks, reportThanks, useThanks, type OpenedCard, type ThanksPerson } from './thanksStore';

const fa = toPersianDigits;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Stage = 'sealed' | 'breaking' | 'opening' | 'open';

/** Sparks flying out from the seal as it breaks: only ever drawn on a computer. */
const Sparks: React.FC = () => {
  const sparks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
        const reach = 90 + Math.random() * 90;
        return { dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach - 30, delay: 300 + Math.random() * 160 };
      }),
    [],
  );
  return (
    <>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="sp-spark"
          style={{ '--sp-dx': `${s.dx.toFixed(0)}px`, '--sp-dy': `${s.dy.toFixed(0)}px`, '--sp-delay': `${s.delay.toFixed(0)}ms` } as React.CSSProperties}
        />
      ))}
    </>
  );
};

/** «گزارش»: the receiver shows this one recognition to the programme's owner, after reading what that means. */
const Report: React.FC<{ card: OpenedCard }> = ({ card }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (card.reported) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Flag className="w-3.5 h-3.5" /> این قدردانی را گزارش کرده‌اید؛ مسئول برنامهٔ «سپاس» آن را بررسی می‌کند.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="tap-area inline-flex items-center gap-1.5 text-xs text-faint hover:text-ink">
        <Flag className="w-3.5 h-3.5" /> گزارش به مسئول برنامه
      </button>
    );
  }
  return (
    <div className="p-3 rounded-2xl bg-surface border border-line space-y-2">
      <p className="text-xs text-ink-soft leading-relaxed">
        با گزارش، مسئول برنامهٔ «سپاس» می‌تواند متن همین قدردانی را بخواند{card.isPublic ? '' : '، با اینکه فقط بین شما دو نفر است'}. به فرستنده خبری داده نمی‌شود.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={RECOGNITION_REPORT_NOTE_MAX}
        className={inputClass}
        placeholder="اگر خواستید بنویسید چرا (اختیاری)"
        aria-label="توضیح گزارش"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass} disabled={busy}>
          انصراف
        </button>
        <button
          type="button"
          disabled={busy}
          className={primaryButtonClass}
          onClick={() => {
            setBusy(true);
            void reportThanks(card.id, note.trim()).finally(() => setBusy(false));
          }}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          گزارش کن
        </button>
      </div>
    </div>
  );
};

/** The opened recognition: the card, its coins counted up, the receiver's own answer and «گزارش». */
const Opened: React.FC<{ card: OpenedCard; me: ThanksPerson; fresh: boolean; fx: EffectsLevel }> = ({ card, me, fresh, fx }) => {
  const count = useCountUp(card.total, fx === 'full' ? 1100 : 500, fresh && fx !== 'none');
  const pile = Math.min(card.total, 9);
  const added = card.joiners.reduce((sum, j) => sum + j.amount, 0);
  return (
    <div className="sp-opened p-5 sm:p-6 space-y-4">
      {/* The dialog's close button sits at the other end of this line. */}
      <h3 className="font-display text-xl text-ink leading-none pt-1 pe-10">قدردانی از شما</h3>
      <ThanksCardFace value={card.value} from={card.from} to={me} message={card.message} isPrivate={!card.isPublic} note={<span>{timeAgo(card.at)}</span>}>
        <div className="flex items-center gap-3 pt-1" aria-label={`${fa(card.total)} سکه`}>
          <span className="sp-pile" aria-hidden="true">
            {Array.from({ length: pile }, (_, i) => (
              <span key={i} style={{ '--n': i } as React.CSSProperties}>
                <CoinFace />
              </span>
            ))}
          </span>
          <span className="text-sm text-ink-soft">
            <strong className="font-display text-3xl text-ink align-middle tabular-nums">{fa(count)}</strong> سکه
          </span>
        </div>
        {card.joiners.length > 0 && (
          <p className="text-xs text-muted leading-relaxed">
            {card.joiners.map((j) => j.name).join('، ')} هم با این قدردانی همراه {card.joiners.length > 1 ? 'شدند' : 'شد'} ({fa(added)} سکه از این {fa(card.total)} سکه).
          </p>
        )}
      </ThanksCardFace>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="پاسخ شما به این قدردانی">
        <span className="text-xs font-bold text-ink-soft">پاسخ شما:</span>
        {WISH_REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={card.reaction === r}
            onClick={() => {
              haptic();
              void answerThanks(card.id, card.reaction === r ? '' : r);
            }}
            className={`w-9 h-9 rounded-full text-lg leading-none transition-all ${
              card.reaction === r ? 'bg-white shadow-md scale-110 ring-2 ring-warm' : 'bg-surface hover:bg-surface-strong'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <Report card={card} />
        </div>
        <button type="button" onClick={closeReveal} className={secondaryButtonClass}>
          بستن
        </button>
      </div>
    </div>
  );
};

/**
 * A recognition arrives as a sealed envelope with the coin as its seal. The receiver breaks the seal:
 * the coin spins away, the flap opens, the letter comes out and the coins are counted. On a phone the
 * envelope simply gives way to the card; with effects off there is no movement at all.
 */
export const RevealModal: React.FC<{ id: string }> = ({ id }) => {
  const { currentUser } = usePortal();
  const { received } = useThanks();
  const fx = useEffectsLevel();
  const card = received.find((c) => c.id === id) ?? null;
  const opened = card && !card.sealed ? card : null;
  const [stage, setStage] = useState<Stage>(opened ? 'open' : 'sealed');
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!currentUser) return null;

  const me: ThanksPerson = {
    id: currentUser.id,
    name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
    avatar: currentUser.avatar,
    position: currentUser.position,
    department: currentUser.department,
  };

  const breakSeal = async () => {
    if (busy || stage !== 'sealed') return;
    setBusy(true);
    const result = await openThanks(id);
    if (!result) {
      // It was reversed meanwhile, or is not this colleague's.
      closeReveal();
      return;
    }
    haptic(15);
    setFresh(true);
    if (fx === 'full') {
      setStage('breaking');
      await wait(820);
      setStage('opening');
      await wait(950);
    }
    setStage('open');
    setBusy(false);
  };

  return (
    <ModalShell onClose={closeReveal} size="md" label="قدردانی">
      <ModalCloseButton onClose={closeReveal} className="absolute top-3 left-3 z-10" />
      <div className={`sp sp-reveal overflow-y-auto overscroll-contain ${opened ? toneClass(opened.value.tone) : 'sp-tone-gold'}`} data-fx={fx} data-stage={stage}>
        {stage === 'open' && opened ? (
          <Opened card={opened} me={me} fresh={fresh} fx={fx} />
        ) : (
          <div className="px-6 pt-4 pb-7 text-center space-y-4">
            <div className="sp-scene">
              <div className="sp-env">
                <span className="sp-env-shadow" />
                <span className="sp-env-back" />
                <span className="sp-env-letter" />
                <span className="sp-env-front" />
                <span className="sp-env-flap">
                  <span />
                  <span />
                </span>
                <button type="button" className="sp-seal" onClick={() => void breakSeal()} disabled={busy} aria-label="باز کردن مهر">
                  <Coin3D size={70} />
                </button>
                {stage === 'breaking' && fx === 'full' && <Sparks />}
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-2xl text-ink">یک قدردانی برای شما</h3>
              <p className="text-sm text-muted">{card ? <>از طرف {card.from.name}</> : 'مهرش را باز کنید و بخوانید.'}</p>
            </div>
            <button type="button" onClick={() => void breakSeal()} disabled={busy} className={`${primaryButtonClass} mx-auto !px-6 !py-2.5 !text-sm`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailOpen className="w-4 h-4" />}
              مهر را باز کن
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
