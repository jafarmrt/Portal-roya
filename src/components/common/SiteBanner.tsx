import React, { useEffect, useState } from 'react';
import { AlertTriangle, Megaphone, Pencil, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { formatDateTime, toPersianDigits } from '../../lib/jalali';
import type { SiteBanner as Banner } from '../../types';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from './Modal';

// The browser remembers which message it closed (by when the message was last changed), so a new
// or edited message shows again. Storage can be missing (private windows), so every use is guarded.
const DISMISSED_KEY = 'roya-portal:dismissed-banner';

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // Without storage the message simply stays closed until the page is reloaded.
  }
}

/** The current time, refreshed every minute so a message disappears when it expires. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const isLive = (banner: Banner | null | undefined, now: number): banner is Banner =>
  Boolean(banner && new Date(banner.expiresAt).getTime() > now);

/** The short message shown above every page (e.g. "the internet is down until noon"). */
export const SiteBanner: React.FC = () => {
  const { appSettings, can } = usePortal();
  const now = useMinuteClock();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [editing, setEditing] = useState(false);
  const banner = appSettings?.banner;
  const canEdit = can('news.manage');

  const visible = isLive(banner, now) && dismissed !== banner.updatedAt;
  const warning = banner?.level === 'warning';

  return (
    <>
      {visible && (
        <div
          role={warning ? 'alert' : 'status'}
          className={warning ? 'bg-red-700 text-white border-b border-red-800' : 'bg-sky-50 text-sky-950 border-b border-sky-200'}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-start gap-2.5 text-xs sm:text-sm">
            {warning ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <Megaphone className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />}
            <p className="flex-1 font-bold leading-relaxed whitespace-pre-line">{banner.text}</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="ویرایش پیام سراسری"
                title="ویرایش پیام سراسری"
                className={`p-1 rounded-lg shrink-0 ${warning ? 'hover:bg-red-800' : 'hover:bg-sky-100'}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                writeDismissed(banner.updatedAt);
                setDismissed(banner.updatedAt);
              }}
              aria-label="بستن پیام"
              title="بستن پیام"
              className={`p-1 rounded-lg shrink-0 ${warning ? 'hover:bg-red-800' : 'hover:bg-sky-100'}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {editing && <BannerEditorModal onClose={() => setEditing(false)} />}
    </>
  );
};

const HOUR = 60 * 60 * 1000;

const DURATIONS: { key: string; label: string; until: (now: Date) => Date }[] = [
  { key: '2h', label: 'دو ساعت', until: (now) => new Date(now.getTime() + 2 * HOUR) },
  {
    key: 'today',
    label: 'تا پایان امروز',
    until: (now) => {
      const end = new Date(now);
      end.setHours(23, 59, 0, 0);
      return end.getTime() - now.getTime() < HOUR ? new Date(now.getTime() + HOUR) : end;
    },
  },
  {
    key: 'tomorrow',
    label: 'تا پایان فردا',
    until: (now) => {
      const end = new Date(now);
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 0, 0);
      return end;
    },
  },
  { key: '3d', label: 'سه روز', until: (now) => new Date(now.getTime() + 3 * 24 * HOUR) },
  { key: '7d', label: 'یک هفته', until: (now) => new Date(now.getTime() + 7 * 24 * HOUR) },
  { key: '30d', label: 'یک ماه (حداکثر)', until: (now) => new Date(now.getTime() + 30 * 24 * HOUR - 60 * 1000) },
];

const LEVELS: { value: Banner['level']; label: string; hint: string }[] = [
  { value: 'info', label: 'اطلاع‌رسانی', hint: 'مثلاً: جلسهٔ عمومی امروز ساعت ۱۴ در سالن اجتماعات.' },
  { value: 'warning', label: 'هشدار فوری', hint: 'مثلاً: اینترنت تا ساعت ۱۲ قطع است. با رنگ قرمز نمایش داده می‌شود.' },
];

const MAX_LENGTH = 200;

/** Writes, changes or removes the message above every page (for people who publish news). */
export const BannerEditorModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { appSettings, setBanner, clearBanner } = usePortal();
  const now = useMinuteClock();
  const current = isLive(appSettings?.banner, now) ? appSettings?.banner ?? null : null;
  const [text, setText] = useState(current?.text ?? '');
  const [level, setLevel] = useState<Banner['level']>(current?.level ?? 'info');
  const [duration, setDuration] = useState('today');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const until = DURATIONS.find((d) => d.key === duration)!.until(new Date());
    setBusy(true);
    const ok = await setBanner({ text: text.trim(), level, expiresAt: until.toISOString() });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    setBusy(true);
    const ok = await clearBanner();
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="پیام سراسری بالای صفحه‌ها"
      subtitle="برای خبرهای کوتاه و فوری؛ اعلانی فرستاده نمی‌شود."
      icon={<Megaphone className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          {current && (
            <button type="button" onClick={remove} disabled={busy} className={`${secondaryButtonClass} text-red-700 ml-auto`}>
              برداشتن پیام
            </button>
          )}
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="banner-form" disabled={busy || !text.trim()} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : current ? 'ذخیرهٔ تغییرات' : 'نمایش پیام'}
          </button>
        </>
      }
    >
      <form id="banner-form" onSubmit={save} className="space-y-4">
        {current && (
          <p className="p-3 rounded-xl bg-[#F5F2ED] text-[#4B4740] leading-relaxed">
            این پیام تا {formatDateTime(current.expiresAt)} نمایش داده می‌شود. با ذخیره، زمان پایان از نو حساب می‌شود و پیام برای کسانی که آن را بسته بودند دوباره نمایان می‌شود.
          </p>
        )}
        <div>
          <label htmlFor="banner-text" className={labelClass}>متن پیام</label>
          <textarea
            id="banner-text"
            value={text}
            maxLength={MAX_LENGTH}
            rows={3}
            required
            onChange={(e) => setText(e.target.value)}
            className={inputClass}
          />
          <p className="text-[11px] text-[#8C867A] mt-1 text-left">
            {toPersianDigits(text.length)} / {toPersianDigits(MAX_LENGTH)}
          </p>
        </div>
        <fieldset>
          <legend className={labelClass}>نوع پیام</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LEVELS.map((l) => (
              <label
                key={l.value}
                className={`p-3 rounded-xl border cursor-pointer ${level === l.value ? 'border-red-600 bg-red-50' : 'border-[#E6E0D5] bg-white'}`}
              >
                <span className="flex items-center gap-2 font-bold text-[#2D2D2D]">
                  <input type="radio" name="banner-level" value={l.value} checked={level === l.value} onChange={() => setLevel(l.value)} className="accent-red-700" />
                  {l.label}
                </span>
                <span className="block text-[11px] text-[#6E6A60] mt-1 leading-relaxed">{l.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="banner-duration" className={labelClass}>مدت نمایش</label>
          <select id="banner-duration" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass}>
            {DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <p className="text-[11px] text-[#8C867A] mt-1">پس از این زمان پیام خودبه‌خود برداشته می‌شود.</p>
        </div>
      </form>
    </Modal>
  );
};
