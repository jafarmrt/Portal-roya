import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, X } from 'lucide-react';
import { KUDOS_EVENT } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { type KudosEmoji, kudosEmojis } from '../../../shared/kudos';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import type { ReceivedKudos } from '../../types';
import { Avatar } from '../common/Avatar';

/** The page tells the server the person is there at most this often. */
const ACTIVE_EVERY_MS = 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

const nameOf = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** One emoji in the banner: who sent it, the emoji, one-click answers and its own ×. */
const KudosRow: React.FC<{
  item: ReceivedKudos;
  emojis: KudosEmoji[];
  onReply: (item: ReceivedKudos, emoji: KudosEmoji) => void;
  onClose: (item: ReceivedKudos) => void;
}> = ({ item, emojis, onReply, onClose }) => (
  <li className="space-y-1.5">
    <div className="flex items-start gap-2.5">
      <div className="relative shrink-0">
        <Avatar src={item.from.avatar} firstName={item.from.firstName} lastName={item.from.lastName} className="w-9 h-9 rounded-full text-xs" />
        <span className="absolute -bottom-1 -left-1 text-lg leading-none" aria-hidden>{item.emoji}</span>
      </div>
      <p className="flex-1 text-xs leading-relaxed">
        {item.message}
        <span className="block text-[10px] text-[#8C867A]">{timeAgo(item.createdAt)}</span>
      </p>
      <button
        type="button"
        onClick={() => onClose(item)}
        aria-label={`بستن ایموجی ${nameOf(item.from)}`}
        title="بستن"
        className="p-1 rounded-lg text-[#8C867A] hover:bg-[#F5F2ED]"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
    {item.canReply && (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-[#8C867A] ms-1">پاسخ:</span>
        {emojis.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onReply(item, e)}
            title={e.label}
            aria-label={`پاسخ با ${e.label} به ${nameOf(item.from)}`}
            className="w-8 h-8 rounded-xl bg-[#F9F7F4] hover:bg-emerald-50 border border-[#E6E0D5] text-base leading-none"
          >
            {e.emoji}
          </button>
        ))}
      </div>
    )}
  </li>
);

/**
 * The emoji colleagues sent this person, in a small banner in the corner of every page. It stays until
 * closed with ×, also after a reload or on the next visit (for a day); several are gathered in one banner.
 */
const KudosBanner: React.FC<{ emojis: KudosEmoji[] }> = ({ emojis }) => {
  const [items, setItems] = useState<ReceivedKudos[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => api.get<ReceivedKudos[]>('/api/kudos/banner').then(setItems).catch(() => undefined), []);
  useEffect(() => {
    void load();
    // Also fired when the live connection comes back, as something may have arrived meanwhile.
    window.addEventListener(KUDOS_EVENT, load);
    return () => window.removeEventListener(KUDOS_EVENT, load);
  }, [load]);

  const dismiss = (ids?: number[]) => {
    setItems((list) => (ids ? list.filter((i) => !ids.includes(i.id)) : []));
    api.post('/api/kudos/banner/dismiss', ids ? { ids } : {}).catch(() => undefined);
  };

  const reply = async (item: ReceivedKudos, emoji: KudosEmoji) => {
    setItems((list) => list.filter((i) => i.id !== item.id));
    try {
      await api.post('/api/kudos', { to: item.from.id, emoji: emoji.id, replyTo: item.id });
      toast.success(`${emoji.emoji} پاسخ شما برای ${item.from.firstName} فرستاده شد.`);
    } catch (err) {
      toast.error(errorMessage(err));
      void load();
    }
  };

  if (items.length === 0) return null;
  const several = items.length > 1;
  const shown = several && !open ? [] : items;

  return (
    <section
      aria-label="ایموجی‌های همکاران"
      className="fixed z-40 left-2 right-2 bottom-[calc(76px+env(safe-area-inset-bottom))] sm:right-auto sm:w-80 lg:left-4 lg:bottom-4 max-h-[60vh] overflow-y-auto bg-white text-[#2D2D2D] border border-[#E6E0D5] rounded-2xl shadow-xl p-3 space-y-2"
      dir="rtl"
    >
      {several && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex-1 min-w-0 flex items-center gap-2 text-right">
            <span className="text-lg leading-none shrink-0" aria-hidden>
              {[...new Set(items.map((i) => i.emoji))].slice(0, 3).join('')}
            </span>
            <span className="text-xs font-bold truncate">
              {toPersianDigits(new Set(items.map((i) => i.from.id)).size)} همکار برایتان ایموجی فرستادند
            </span>
            <ChevronDown className={`w-4 h-4 text-[#8C867A] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={() => dismiss()} aria-label="بستن همه" title="بستن همه" className="p-1 rounded-lg text-[#8C867A] hover:bg-[#F5F2ED]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className={`space-y-3 ${several ? 'pt-2 border-t border-[#E6E0D5]' : ''}`}>
          {shown.map((item) => (
            <KudosRow key={item.id} item={item} emojis={emojis} onReply={(i, e) => void reply(i, e)} onClose={(i) => dismiss([i.id])} />
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * Runs on every page while «همکاران آنلاین» is on for this person: tells the server they are using
 * the portal (a click, a key, a scroll), and shows the emoji colleagues sent in a small banner.
 */
export const KudosListener: React.FC<{ emojis: KudosEmoji[] }> = ({ emojis }) => {
  useEffect(() => {
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible' || now - last < ACTIVE_EVERY_MS) return;
      last = now;
      api.post('/api/presence/active').catch(() => undefined);
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onActivity);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener('visibilitychange', onActivity);
    };
  }, []);

  return <KudosBanner emojis={kudosEmojis(emojis)} />;
};
