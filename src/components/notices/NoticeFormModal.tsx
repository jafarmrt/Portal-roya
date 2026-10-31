import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Megaphone } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { isValidJalaliDate, toJalali, toPersianDigits, todayJalali } from '../../lib/jalali';
import type { ManagedNotice } from '../../types';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AudiencePicker } from '../news/AudiencePicker';
import {
  NOTICE_DEFAULT_DAYS,
  NOTICE_LENGTHS,
  NOTICE_MAX_DAYS,
  NOTICE_SENDER_MAX,
  NOTICE_TEXT_MAX,
  noticeDays,
  noticeLastDay,
} from '../../../shared/notices';

const chipClass = (active: boolean) =>
  `px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${active ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-[#D9D4CB] hover:border-emerald-400'}`;

/** Writes a notice for «تابلوی اعلانات», or edits one: the text, who it is from, its days and its audience. */
export const NoticeFormModal: React.FC<{ notice?: ManagedNotice; onClose: () => void; onSaved?: () => void }> = ({ notice, onClose, onSaved }) => {
  const { currentUser, reloadNotices } = usePortal();
  const [text, setText] = useState(notice?.text ?? '');
  const [sender, setSender] = useState(notice?.sender ?? '');
  const [firstDay, setFirstDay] = useState(notice ? toJalali(notice.startsAt) : todayJalali());
  const [lastDay, setLastDay] = useState(notice ? toJalali(notice.endsAt) : noticeLastDay(todayJalali(), NOTICE_DEFAULT_DAYS));
  const [important, setImportant] = useState(notice?.important ?? false);
  const [notify, setNotify] = useState(notice?.notify ?? false);
  const [audience, setAudience] = useState({
    departments: notice?.targetDepartments ?? [],
    locations: notice?.targetLocations ?? [],
    roles: notice?.targetRoles ?? [],
    userIds: notice?.targetUserIds ?? [],
  });
  const [busy, setBusy] = useState(false);

  const datesOk = isValidJalaliDate(firstDay) && isValidJalaliDate(lastDay);
  const days = datesOk ? noticeDays(firstDay, lastDay) : 0;
  const lengthOk = days >= 1 && days <= NOTICE_MAX_DAYS && lastDay >= todayJalali();
  const canSave = text.trim().length > 0 && text.length <= NOTICE_TEXT_MAX && lengthOk && !busy;

  const pickLength = (n: number) => {
    if (isValidJalaliDate(firstDay)) setLastDay(noticeLastDay(firstDay, n));
  };
  // Changing the first day keeps the length that was chosen.
  const changeFirstDay = (value: string) => {
    if (isValidJalaliDate(value) && days >= 1) setLastDay(noticeLastDay(value, days));
    setFirstDay(value);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    const body = {
      text: text.trim(),
      sender: sender.trim(),
      important,
      notify,
      firstDay,
      lastDay,
      targetDepartments: audience.departments,
      targetLocations: audience.locations,
      targetRoles: audience.roles,
      targetUserIds: audience.userIds,
    };
    try {
      if (notice) await api.put(`/api/notices/${notice.id}`, body);
      else await api.post('/api/notices', body);
      toast.success(notice ? 'اطلاعیه ویرایش شد.' : firstDay > todayJalali() ? 'اطلاعیه زمان‌بندی شد.' : 'اطلاعیه روی تابلو رفت.');
      await reloadNotices();
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={notice ? 'ویرایش اطلاعیه' : 'اطلاعیهٔ جدید برای تابلوی اعلانات'}
      subtitle="پیام کوتاهی که خبر نیست؛ با متن کامل روی داشبورد می‌آید و در فهرست اخبار نیست."
      icon={<Megaphone className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="notice-form" disabled={!canSave} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره…' : notice ? 'ذخیرهٔ تغییرات' : 'گذاشتن روی تابلو'}
          </button>
        </>
      }
    >
      <form id="notice-form" onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="notice-text" className={labelClass}>متن اطلاعیه *</label>
          <textarea
            id="notice-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            maxLength={NOTICE_TEXT_MAX}
            placeholder="مثلاً: سلام به همهٔ همکاران عزیز 🌿 با شروع روزهای سرد… ایموجی و خط جدید همان‌طور که می‌نویسید نمایش داده می‌شود."
            className={`${inputClass} leading-7`}
          />
          <p className={`text-[11px] mt-1 ${text.length > NOTICE_TEXT_MAX - 50 ? 'text-amber-700' : 'text-[#6E6A60]'}`}>
            {toPersianDigits(text.length)} از {toPersianDigits(NOTICE_TEXT_MAX)} حرف
          </p>
        </div>

        <div>
          <label htmlFor="notice-sender" className={labelClass}>از طرف (اختیاری)</label>
          <input
            id="notice-sender"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            maxLength={NOTICE_SENDER_MAX}
            placeholder="مثلاً: واحد اداری"
            className={inputClass}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className={labelClass}>چه روزهایی روی تابلو باشد</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="notice-first" className="block text-[11px] text-[#6E6A60] mb-1">از روز</label>
              <JalaliDateInput id="notice-first" required value={firstDay} onChange={changeFirstDay} />
            </div>
            <div>
              <label htmlFor="notice-last" className="block text-[11px] text-[#6E6A60] mb-1">تا پایان روز</label>
              <JalaliDateInput id="notice-last" required value={lastDay} onChange={setLastDay} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="مدت">
            {NOTICE_LENGTHS.map((l) => (
              <button key={l.days} type="button" aria-pressed={days === l.days} onClick={() => pickLength(l.days)} className={chipClass(days === l.days)}>
                {l.label}
              </button>
            ))}
          </div>
          <p className={`text-[11px] ${datesOk && !lengthOk ? 'text-red-700 font-bold' : 'text-[#6E6A60]'}`}>
            {!datesOk
              ? 'روز شروع و پایان را انتخاب کنید.'
              : days < 1
                ? 'روز پایان نباید پیش از روز شروع باشد.'
                : days > NOTICE_MAX_DAYS
                  ? `حداکثر ${toPersianDigits(NOTICE_MAX_DAYS)} روز؛ برای مطلب ماندگار خبر منتشر کنید.`
                  : lastDay < todayJalali()
                    ? 'روز پایان گذشته است.'
                    : `${toPersianDigits(days)} روز روی تابلو می‌ماند و بعد خودش برداشته می‌شود.${firstDay > todayJalali() ? ' تا روز شروع فقط در «مدیریت اطلاعیه‌ها» دیده می‌شود.' : ''}`}
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="mt-0.5 accent-amber-600" />
            <span>
              <strong>مهم</strong>
              <span className="block text-[11px] text-[#6E6A60]">بالاتر از بقیه و با رنگ کهربایی نمایش داده می‌شود.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 accent-emerald-700" />
            <span>
              <strong>اعلان زنگوله هم برود</strong>
              <span className="block text-[11px] text-[#6E6A60]">
                {notice?.notify ? 'اعلان یک بار، در روز شروع، فرستاده شده یا فرستاده می‌شود.' : 'یک بار، در روز شروع، برای مخاطبان. بدون آن اطلاعیه فقط روی داشبورد دیده می‌شود.'}
              </span>
            </span>
          </label>
        </fieldset>

        <AudiencePicker authorId={currentUser?.id ?? ''} value={audience} onChange={setAudience} noun="اطلاعیه" />
      </form>
    </Modal>
  );
};
