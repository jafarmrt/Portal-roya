import React, { useState } from 'react';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { NewColleagueWelcome, UserProfile } from '../../types';
import { todayJalali } from '../../lib/jalali';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface IntroduceColleagueModalProps {
  colleague: UserProfile;
  /** The existing card when editing; without it a new introduction is created. */
  card?: NewColleagueWelcome;
  onClose: () => void;
}

/** Creates or edits the "new colleague" card shown on the dashboard. */
export const IntroduceColleagueModal: React.FC<IntroduceColleagueModalProps> = ({ colleague, card, onClose }) => {
  const { introduceColleague, updateIntroduction } = usePortal();
  const [message, setMessage] = useState(card?.welcomeMessage ?? '');
  const [joinDate, setJoinDate] = useState(card?.joinDate ?? (colleague.hireDate || todayJalali()));
  const [busy, setBusy] = useState(false);
  const name = `${colleague.firstName} ${colleague.lastName}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = card
      ? await updateIntroduction(card.id, { welcomeMessage: message.trim(), joinDate })
      : await introduceColleague(colleague.id, { message: message.trim(), joinDate });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={card ? 'ویرایش کارت معرفی' : 'معرفی همکار جدید'}
      subtitle={name}
      icon={<UserPlus className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="introduce-colleague" disabled={busy || (card !== undefined && !message.trim())} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'در حال ثبت...' : card ? 'ذخیره' : 'معرفی در داشبورد'}
          </button>
        </>
      }
    >
      <form id="introduce-colleague" onSubmit={handleSubmit} className="space-y-4">
        {!card && (
          <p className="p-3 bg-[#F5F2ED] rounded-xl leading-relaxed text-[#4B4740]">
            کارت معرفی تا ۶۰ روز در داشبورد نمایش داده می‌شود و به همهٔ همکاران اعلان داده می‌شود.
          </p>
        )}
        <div>
          <label htmlFor="intro-date" className={labelClass}>تاریخ پیوستن</label>
          <JalaliDateInput id="intro-date" value={joinDate} onChange={setJoinDate} required />
        </div>
        <div>
          <label htmlFor="intro-message" className={labelClass}>پیام خوش‌آمدگویی{card ? ' *' : ''}</label>
          <textarea
            id="intro-message"
            rows={3}
            maxLength={1000}
            required={card !== undefined}
            placeholder={card ? undefined : 'اختیاری؛ در صورت خالی بودن متن پیش‌فرض استفاده می‌شود'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={inputClass}
          />
        </div>
      </form>
    </Modal>
  );
};
