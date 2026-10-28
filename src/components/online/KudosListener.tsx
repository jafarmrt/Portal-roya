import React, { useEffect } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { KUDOS_EVENT } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { type KudosEmoji, kudosEmojis } from '../../../shared/kudos';
import type { IncomingKudos } from '../../types';
import { Avatar } from '../common/Avatar';

/** The page tells the server the person is there at most this often. */
const ACTIVE_EVERY_MS = 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

const KudosToast: React.FC<{ kudos: IncomingKudos; emojis: KudosEmoji[]; onClose: () => void }> = ({ kudos, emojis, onClose }) => {
  const reply = async (emoji: KudosEmoji) => {
    onClose();
    try {
      await api.post('/api/kudos', { to: kudos.from.id, emoji: emoji.id, replyTo: kudos.id });
      toast.success(`${emoji.emoji} پاسخ شما برای ${kudos.from.firstName} فرستاده شد.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div dir="rtl" role="status" className="w-80 max-w-[calc(100vw-2rem)] bg-white text-[#2D2D2D] border border-[#E6E0D5] rounded-2xl shadow-xl p-3 space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <Avatar src={kudos.from.avatar} firstName={kudos.from.firstName} lastName={kudos.from.lastName} className="w-9 h-9 rounded-full text-xs" />
          <span className="absolute -bottom-1 -left-1 text-lg leading-none" aria-hidden>{kudos.emoji}</span>
        </div>
        <p className="flex-1 text-xs leading-relaxed">{kudos.message}</p>
        <button type="button" onClick={onClose} aria-label="بستن" className="p-0.5 rounded-lg text-[#8C867A] hover:bg-[#F5F2ED]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {kudos.canReply && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-[#8C867A] ms-1">پاسخ:</span>
          {emojis.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => void reply(e)}
              title={e.label}
              aria-label={`پاسخ با ${e.label}`}
              className="w-8 h-8 rounded-xl bg-[#F9F7F4] hover:bg-emerald-50 border border-[#E6E0D5] text-base leading-none"
            >
              {e.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Runs on every page while «همکاران آنلاین» is on for this person: tells the server they are using
 * the portal (a click, a key, a scroll), and shows an emoji a colleague sends in the corner of the page.
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

  useEffect(() => {
    const onKudos = (event: Event) => {
      const kudos = (event as CustomEvent<IncomingKudos>).detail;
      toast.custom(
        (t) => <KudosToast kudos={kudos} emojis={kudosEmojis(emojis)} onClose={() => toast.dismiss(t.id)} />,
        { id: `kudos-${kudos.id}`, duration: kudos.canReply ? 12_000 : 6_000 },
      );
    };
    window.addEventListener(KUDOS_EVENT, onKudos);
    return () => window.removeEventListener(KUDOS_EVENT, onKudos);
  }, [emojis]);

  return null;
};
