import React, { useState } from 'react';
import { Info, Printer } from 'lucide-react';
import { isForEveryone } from '../../../shared/audience';
import { usePortal } from '../../context/PortalContext';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import type { NewsItem } from '../../types';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { Letterhead, PrintPortal, QrCode } from '../common/PrintSheet';
import { audienceSummary, NewsContent } from './NewsBody';

/** The link a printed notice's QR code opens. */
export const newsLink = (id: string) => `${window.location.origin}/#news/${id}`;

/** A news item laid out on an A4 page for a notice board, with a QR code back to the portal. */
const NoticeSheet: React.FC<{ item: NewsItem; fullText: boolean }> = ({ item, fullText }) => {
  const { roleName } = usePortal();
  const audience = audienceSummary(item, roleName);
  const url = newsLink(item.id);
  const kind = item.requiresAck ? 'بخشنامه' : 'اطلاعیه';
  return (
    <article className="sheet-page notice-sheet">
      <Letterhead title={kind} date={item.publishAt} />
      <div className="notice-main">
        <p className="notice-kicker">
          {item.category !== kind && item.category}
          {item.isUrgent && <span className="notice-urgent">فوری</span>}
        </p>
        <h1 className="notice-title">{item.title}</h1>
        {item.summary && <p className="notice-summary">{item.summary}</p>}
        {fullText && item.image && <img src={item.image} alt="" className="notice-image" />}
        {fullText && <NewsContent content={item.content} format={item.contentFormat} className="notice-body" />}
        {item.requiresAck && (
          <p className="notice-ack">
            این بخشنامه نیاز به تأیید مطالعه دارد{item.ackDeadline ? ` (مهلت: ${formatDate(item.ackDeadline)})` : ''}. تأیید را در پرتال ثبت کنید.
          </p>
        )}
        {fullText && item.attachments.length > 0 && (
          <p className="notice-attachments">
            {toPersianDigits(item.attachments.length)} پیوست در پرتال: {item.attachments.map((a) => a.name).join('، ')}
          </p>
        )}
      </div>
      <footer className="notice-footer">
        <QrCode value={url} />
        <div className="notice-footer-text">
          <strong>برای خواندن در پرتال، کد را با دوربین گوشی اسکن کنید.</strong>
          <div dir="ltr" className="notice-url">{url}</div>
          <div>
            {item.author}
            {item.authorRole && ` · ${item.authorRole}`}
          </div>
          {audience && <div>مخاطبان: {audience}</div>}
        </div>
      </footer>
    </article>
  );
};

/** "Print for the notice board": a preview of the A4 page and the print button. */
export const NoticePrintModal: React.FC<{ item: NewsItem; onClose: () => void }> = ({ item, onClose }) => {
  const { appSettings } = usePortal();
  const [fullText, setFullText] = useState(true);
  const targeted = !isForEveryone({ departments: item.targetDepartments, locations: item.targetLocations, roles: item.targetRoles, userIds: item.targetUserIds });
  const forGuests = appSettings?.guestAccess && !targeted;

  return (
    <Modal
      title="چاپ برای تابلو اعلانات"
      subtitle={item.title}
      icon={<Printer className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="button" onClick={() => window.print()} className={primaryButtonClass}>
            <Printer className="w-4 h-4" /> چاپ
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="محتوای برگه">
          {[
            { value: true, label: 'متن کامل' },
            { value: false, label: 'فقط عنوان و خلاصه' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={fullText === o.value}
              onClick={() => setFullText(o.value)}
              className={`px-3 py-1.5 rounded-xl font-bold border ${fullText === o.value ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#6E6A60] leading-relaxed flex items-start gap-1.5">
          <Info className="w-4 h-4 shrink-0 text-[#8C867A]" />
          {forGuests
            ? 'کد QR اطلاعیه را در پرتال باز می‌کند؛ همکاران بدون حساب هم اگر به شبکهٔ شرکت وصل باشند آن را می‌بینند.'
            : targeted
              ? 'این اطلاعیه فقط برای مخاطبانش است؛ کد QR فقط برای آن‌ها و پس از ورود به پرتال باز می‌شود.'
              : 'کد QR اطلاعیه را در پرتال باز می‌کند؛ چون دسترسی مهمان خاموش است، باید وارد پرتال شد.'}
        </p>
        <div className="sheet-preview-frame">
          <div className="sheet-preview">
            <NoticeSheet item={item} fullText={fullText} />
          </div>
        </div>
      </div>
      <PrintPortal>
        <NoticeSheet item={item} fullText={fullText} />
      </PrintPortal>
    </Modal>
  );
};
