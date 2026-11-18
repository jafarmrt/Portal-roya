import React, { useState } from 'react';
import { readDraft, useDraft } from '../../lib/drafts';
import { DraftNote } from '../common/DraftNote';
import { MessageSquareHeart } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import type { TrainingProgram } from '../../types';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

export const RATING_LABELS = ['خیلی کم', 'کم', 'متوسط', 'زیاد', 'خیلی زیاد'];

const Rating: React.FC<{ name: string; legend: string; value: number; onChange: (value: number) => void }> = ({ name, legend, value, onChange }) => (
  <fieldset className="space-y-2">
    <legend className={labelClass}>{legend}</legend>
    <div className="grid grid-cols-5 gap-1.5">
      {RATING_LABELS.map((label, i) => (
        <label
          key={label}
          className={`relative flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-400 ${
            value === i + 1 ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong text-ink-soft hover:border-red-300'
          }`}
        >
          <input type="radio" name={name} value={i + 1} checked={value === i + 1} onChange={() => onChange(i + 1)} className="sr-only" required />
          <span className="text-base">{toPersianDigits(i + 1)}</span>
          <span>{label}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

interface FeedbackDraft {
  satisfaction?: number;
  usefulness?: number;
  comment?: string;
}

const rating = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0);

/** The two-question survey after a course; answers reach the organisers and the instructor without names. */
export const TrainingFeedbackModal: React.FC<{ training: TrainingProgram; onClose: () => void }> = ({ training, onClose }) => {
  const { sendTrainingFeedback, currentUser } = usePortal();
  // What was chosen and written before but not sent (the form was closed, the page refreshed) comes back.
  const draftName = `training-feedback.${training.id}`;
  const [restored, setRestored] = useState(() => readDraft<FeedbackDraft>(currentUser?.id, draftName));
  const [satisfaction, setSatisfaction] = useState(() => rating(restored?.satisfaction));
  const [usefulness, setUsefulness] = useState(() => rating(restored?.usefulness));
  const [comment, setComment] = useState(() => (typeof restored?.comment === 'string' ? restored.comment : ''));
  const [busy, setBusy] = useState(false);
  const draft = useDraft(currentUser?.id, draftName, { satisfaction, usefulness, comment }, satisfaction > 0 || usefulness > 0 || comment.trim() !== '');
  const startOver = () => {
    setSatisfaction(0);
    setUsefulness(0);
    setComment('');
    setRestored(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await sendTrainingFeedback(training.id, { satisfaction, usefulness, comment });
    setBusy(false);
    if (ok) {
      draft.discard();
      onClose();
    }
  };

  return (
    <Modal
      title="دوره چطور بود؟"
      subtitle={training.title}
      icon={<MessageSquareHeart className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>بعداً</button>
          <button type="submit" form="training-feedback" disabled={busy} className={primaryButtonClass}>ثبت نظر</button>
        </>
      }
    >
      <form id="training-feedback" onSubmit={submit} className="space-y-5">
        {restored && <DraftNote onDiscard={startOver}>نظری که قبلاً نوشته بودید و ثبت نشده بود، برگردانده شد.</DraftNote>}
        <p className="text-xs text-muted leading-relaxed">
          {training.myFeedback ? 'قبلاً نظر داده‌اید؛ با ثبت دوباره، نظر قبلی‌تان عوض می‌شود. ' : ''}
          پاسخ شما بدون نام به مسئول آموزش و مدرس نشان داده می‌شود.
        </p>
        <Rating name="satisfaction" legend="در مجموع چقدر از دوره راضی بودید؟" value={satisfaction} onChange={setSatisfaction} />
        <Rating name="usefulness" legend="مطالب دوره چقدر در کارتان به کار می‌آید؟" value={usefulness} onChange={setUsefulness} />
        <div>
          <label htmlFor="training-comment" className={labelClass}>پیشنهاد یا نظر دیگری دارید؟ (اختیاری)</label>
          <textarea id="training-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
        </div>
      </form>
    </Modal>
  );
};
