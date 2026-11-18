import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { RECOGNITION_REASON_MAX, RECOGNITION_REASON_MIN } from '../../../shared/recognition';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { reverseRecognition } from './ownerStore';

/**
 * «برگرداندن»: the programme's owner takes a recognition back. The coins return to the sender's month,
 * the card leaves the wall, and both people read the reason. It cannot be undone, so it asks for one.
 */
export const ReverseDialog: React.FC<{ id: string; from: string; to: string; onClose: (done: boolean) => void }> = ({ id, from, to, onClose }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const short = reason.trim().length < RECOGNITION_REASON_MIN;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (short || busy) return;
    setBusy(true);
    const ok = await reverseRecognition(id, reason.trim());
    setBusy(false);
    if (ok) onClose(true);
  };
  return (
    <Modal
      title="برگرداندن قدردانی"
      subtitle={`از ${from} به ${to}`}
      icon={<Undo2 className="w-5 h-5" />}
      onClose={() => onClose(false)}
      size="md"
      footer={
        <>
          <button type="button" onClick={() => onClose(false)} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form="reverse-recognition" disabled={short || busy} className={primaryButtonClass}>
            برگرداندن
          </button>
        </>
      }
    >
      <form id="reverse-recognition" onSubmit={submit} className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          سکه‌ها به سهمیهٔ فرستنده برمی‌گردد، قدردانی از دیوار و از فهرست‌های هر دو نفر برداشته می‌شود و هر دو نفر دلیل شما را در اعلان‌هایشان می‌خوانند. اگر همکاری با «من هم» همراه شده بود، سکه‌های او هم برمی‌گردد. این کار برگشت‌پذیر نیست.
        </p>
        <label className="block">
          <span className={labelClass}>دلیل (برای هر دو نفر)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={RECOGNITION_REASON_MAX}
            rows={3}
            required
            className={inputClass}
            placeholder="مثلاً: دو بار ثبت شده بود."
          />
        </label>
      </form>
    </Modal>
  );
};
