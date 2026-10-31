import React, { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { WISH_DESIGNS, type WishDesign, type WishOccasion, yearsLabel } from '../../../shared/celebrations';
import { usePortal } from '../../context/PortalContext';
import type { UserProfile } from '../../types';
import { CARD_DESIGNS, GreetingCard } from '../common/GreetingCard';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

const SUGGESTIONS: Record<WishOccasion, string[]> = {
  birthday: [
    'تولدت مبارک! سالی پر از سلامتی، شادی و موفقیت برایت آرزو می‌کنم.',
    'زادروزت خجسته باد؛ همیشه لبخند به لب باشی.',
    'خوشحالم که همکارم هستی. تولدت مبارک! 🎂',
  ],
  anniversary: [
    'سالگرد همکاری‌ات مبارک! کار کردن کنارت همیشه دلگرمی است.',
    'یک سال دیگر همراهی؛ ممنون بابت همهٔ زحمت‌هایت.',
    'به سال‌های بیشتر و موفق‌تر در کنار هم!',
  ],
};

interface Props {
  colleague: UserProfile;
  occasion: WishOccasion;
  /** For a work anniversary: how many years, shown in the dialog title. */
  years?: number;
  onClose: () => void;
}

/** Lets a colleague write a greeting card: pick a look, write the message, and choose who may see it. */
export const GreetingCardComposer: React.FC<Props> = ({ colleague, occasion, years, onClose }) => {
  const { sendBirthdayWish, currentUser } = usePortal();
  const [design, setDesign] = useState<WishDesign>(occasion === 'birthday' ? 'confetti' : 'flowers');
  const [message, setMessage] = useState('');
  // A card is a personal note, so it is private unless the sender wants everyone to see it.
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const name = `${colleague.firstName} ${colleague.lastName}`;

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    const ok = await sendBirthdayWish(colleague.id, { message: message.trim(), occasion, design, isPrivate });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={`کارت تبریک برای ${name}`}
      subtitle={occasion === 'birthday' ? 'تبریک تولد' : `تبریک سالگرد همکاری${years ? ` (${yearsLabel(years)})` : ''}`}
      icon={<Mail className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="button" onClick={send} disabled={busy || !message.trim()} className={primaryButtonClass}>
            <Send className="w-3.5 h-3.5" />
            {busy ? 'در حال ارسال…' : 'ارسال کارت'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className={labelClass}>طرح کارت</legend>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {WISH_DESIGNS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDesign(d)}
                aria-pressed={design === d}
                className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 text-lg transition-all ${
                  design === d ? 'border-warm scale-105 shadow-sm' : 'border-transparent hover:border-line'
                }`}
                style={{ background: CARD_DESIGNS[d].background }}
              >
                <span aria-hidden>{CARD_DESIGNS[d].motifs[0]}</span>
                <span className="text-xs font-bold" style={{ color: CARD_DESIGNS[d].ink }}>{CARD_DESIGNS[d].label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="card-message" className={labelClass}>متن کارت</label>
          <textarea
            id="card-message"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="چند کلمه از طرف خودتان بنویسید…"
            className={inputClass}
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SUGGESTIONS[occasion].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setMessage(s)}
                className="px-2.5 py-1 text-xs bg-surface hover:bg-warm-soft border border-line rounded-full text-ink-soft text-right"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className={labelClass}>چه کسی کارت را ببیند؟</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="card-visibility" checked={isPrivate} onChange={() => setIsPrivate(true)} className="mt-0.5 accent-red-700" />
            <span>
              <strong>فقط {colleague.firstName}</strong>
              <span className="block text-xs text-faint">کارت در داشبورد خودش نشان داده می‌شود و دیگران آن را نمی‌بینند.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="card-visibility" checked={!isPrivate} onChange={() => setIsPrivate(false)} className="mt-0.5 accent-red-700" />
            <span>
              <strong>همهٔ همکاران</strong>
              <span className="block text-xs text-faint">کارت زیر نام او در کارت تولدهای داشبورد هم دیده می‌شود.</span>
            </span>
          </label>
        </fieldset>

        <div>
          <p className={labelClass}>پیش‌نمایش</p>
          <GreetingCard
            design={design}
            occasion={occasion}
            text={message.trim() || 'متن کارت شما اینجا نشان داده می‌شود.'}
            senderName={currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : ''}
            senderAvatar={currentUser?.avatar}
            isPrivate={isPrivate}
          />
        </div>
      </div>
    </Modal>
  );
};
