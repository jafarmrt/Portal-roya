import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Megaphone, Plus, Settings2, Star } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { featureInPreview } from '../../lib/features';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import type { Notice } from '../../types';
import { NoticeFormModal } from './NoticeFormModal';
import { NoticeManageModal } from './NoticeManageModal';

/** Unseen notices shown before «نمایش بقیه»; the board sits at the top of the dashboard. */
const SHOWN = 3;

/** The current time, refreshed every minute so a notice leaves the board at the end of its last day. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * «تابلوی اعلانات»: short notices that are not news, in full, at the top of the dashboard. Each
 * colleague folds a notice away with «دیدم»; the people who publish news add and manage them here.
 */
export const NoticeBoard: React.FC = () => {
  const { notices, setNoticeSeen, currentUser, can, appSettings } = usePortal();
  const now = useMinuteClock();
  const [showAll, setShowAll] = useState(false);
  const [showSeen, setShowSeen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);

  const canPublish = Boolean(currentUser) && can('news.manage');
  // The server sends only notices that have started; the clock takes them off at the end of their last day.
  const live = notices.filter((n) => new Date(n.endsAt).getTime() > now);
  // Guests cannot press «دیدم», so they always see every notice open.
  const open = currentUser ? live.filter((n) => !n.seen) : live;
  const seen = currentUser ? live.filter((n) => n.seen) : [];
  const shown = showAll ? open : open.slice(0, SHOWN);

  if (live.length === 0 && !canPublish) return null;

  return (
    <section className="bg-white border border-[#E6E0D5] rounded-3xl p-4 sm:p-5 space-y-3" aria-labelledby="notice-board-title">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-xl"><Megaphone className="w-4 h-4" /></span>
        <h2 id="notice-board-title" className="text-sm font-black text-[#2D2D2D]">تابلوی اعلانات</h2>
        {open.length > 0 && currentUser && (
          <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-900 rounded-full">{toPersianDigits(open.length)} تازه</span>
        )}
        {featureInPreview(appSettings, 'noticeBoard') && (
          <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>
        )}
        {canPublish && (
          <div className="ms-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="tap-area px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 rounded-xl flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> اطلاعیهٔ جدید
            </button>
            <button
              type="button"
              onClick={() => setManaging(true)}
              aria-label="مدیریت اطلاعیه‌ها"
              title="مدیریت اطلاعیه‌ها (زمان‌بندی‌شده، پایان‌یافته و آمار دیده‌شدن)"
              className="tap-area p-1.5 text-[#6E6A60] hover:bg-[#F5F2ED] rounded-xl"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {live.length === 0 && <p className="text-xs text-[#6E6A60]">اطلاعیه‌ای روی تابلو نیست. پیام‌های کوتاهی که خبر نیستند را این‌جا بگذارید.</p>}

      {shown.length > 0 && (
        <ul className="space-y-2.5">
          {shown.map((n) => (
            <li key={n.id}>
              <NoticeItem notice={n} onSeen={currentUser ? () => void setNoticeSeen(n.id, true) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {open.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="tap-area text-[11px] font-bold text-emerald-800 hover:underline">
          {showAll ? 'نمایش کمتر' : `${toPersianDigits(open.length - SHOWN)} اطلاعیهٔ دیگر`}
        </button>
      )}

      {seen.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSeen((v) => !v)}
            aria-expanded={showSeen}
            className="tap-area text-[11px] font-bold text-[#6E6A60] hover:text-[#2D2D2D] flex items-center gap-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSeen ? 'rotate-180' : ''}`} />
            {open.length === 0 ? `همه را دیده‌اید (${toPersianDigits(seen.length)} اطلاعیه)` : `${toPersianDigits(seen.length)} اطلاعیهٔ دیده‌شده`}
          </button>
          {showSeen && (
            <ul className="space-y-2">
              {seen.map((n) => (
                <li key={n.id}>
                  <NoticeItem notice={n} muted onReopen={() => void setNoticeSeen(n.id, false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && <NoticeFormModal onClose={() => setAdding(false)} />}
      {managing && <NoticeManageModal onClose={() => setManaging(false)} />}
    </section>
  );
};

const NoticeItem: React.FC<{ notice: Notice; muted?: boolean; onSeen?: () => void; onReopen?: () => void }> = ({ notice, muted, onSeen, onReopen }) => {
  const tone = muted
    ? 'bg-[#F5F2ED]/60 border-[#E6E0D5] text-[#4B4740]'
    : notice.important
      ? 'bg-amber-50 border-amber-300 text-[#2D2D2D]'
      : 'bg-emerald-50/60 border-emerald-200 text-[#2D2D2D]';
  return (
    <article className={`rounded-2xl border p-3 sm:p-4 space-y-2 ${tone}`}>
      {notice.important && !muted && (
        <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800">
          <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> مهم
        </span>
      )}
      {muted ? (
        <p className="text-xs sm:text-sm leading-7 whitespace-pre-line break-words line-clamp-2" dir="auto">
          {notice.text}
        </p>
      ) : (
        // A blank line starts a new paragraph, with a smaller gap than a whole empty line.
        <div className="space-y-2 text-xs sm:text-sm leading-7 break-words" dir="auto">
          {notice.text.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="whitespace-pre-line">{para}</p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#6E6A60]">
        {notice.sender && <span className="font-bold text-[#4B4740]">{notice.sender}</span>}
        {notice.sender && <span aria-hidden>·</span>}
        <span>تا {formatDate(notice.endsAt)}</span>
        {onSeen && (
          <button
            type="button"
            onClick={onSeen}
            className="tap-area ms-auto px-3 py-1 text-[11px] font-bold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-xl flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> دیدم
          </button>
        )}
        {onReopen && (
          <button type="button" onClick={onReopen} className="tap-area ms-auto text-[11px] font-bold text-emerald-800 hover:underline">
            باز کردن دوباره
          </button>
        )}
      </div>
    </article>
  );
};
