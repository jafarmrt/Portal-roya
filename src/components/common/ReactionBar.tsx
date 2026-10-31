import React, { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTION_EMOJIS, type ReactionCount, type ReactionTarget } from '../../../shared/reactions';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';

/**
 * Colleagues' emoji under an introduction, a welcome message or a greeting card: each emoji with how
 * many gave it (who, on hover). A click on an emoji gives or takes back one's own; «+» offers the rest.
 * Without `canReact` (guests, or a welcome message that is not one's own) it only shows the counts.
 */
export const ReactionBar: React.FC<{
  target: ReactionTarget;
  id: string;
  reactions: ReactionCount[];
  canReact: boolean;
  label: string;
  small?: boolean;
}> = ({ target, id, reactions, canReact, label, small }) => {
  const { react } = usePortal();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canReact && reactions.length === 0) return null;
  const mine = reactions.find((r) => r.mine)?.emoji ?? '';

  const choose = async (emoji: string) => {
    if (busy) return;
    setBusy(true);
    setPicking(false);
    await react(target, id, mine === emoji ? '' : emoji);
    setBusy(false);
  };

  const chip = small ? 'h-6 px-1.5 text-xs gap-0.5' : 'h-7 px-2 text-sm gap-1';
  return (
    <div className="flex items-center flex-wrap gap-1" role="group" aria-label={label}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact || busy}
          onClick={() => void choose(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`${r.emoji} ${toPersianDigits(r.count)}${r.mine ? '، شما هم' : ''}`}
          title={r.names.length ? r.names.join('، ') : undefined}
          className={`inline-flex items-center rounded-full border leading-none transition-colors disabled:cursor-default ${chip} ${
            r.mine ? 'bg-red-50 border-red-300 text-red-900' : 'bg-white/80 border-[#E6E0D5] text-[#4B4740] enabled:hover:bg-white'
          }`}
        >
          <span aria-hidden>{r.emoji}</span>
          <span className="text-[10px] font-bold" aria-hidden>{toPersianDigits(r.count)}</span>
        </button>
      ))}
      {canReact && (
        <>
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
            aria-label={`واکنش با ایموجی (${label})`}
            title="واکنش با ایموجی"
            className={`inline-flex items-center justify-center rounded-full border border-dashed border-[#D9D4CB] text-[#8C867A] hover:text-[#991b1b] hover:border-[#991b1b] bg-white/60 ${small ? 'w-6 h-6' : 'w-7 h-7'}`}
          >
            <SmilePlus className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
          {picking && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white border border-[#E6E0D5] shadow-sm px-1 py-0.5">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void choose(e)}
                  aria-label={`واکنش ${e}`}
                  aria-pressed={mine === e}
                  className={`w-7 h-7 rounded-full text-base leading-none hover:bg-[#F5F2ED] ${mine === e ? 'ring-2 ring-red-300' : ''}`}
                >
                  {e}
                </button>
              ))}
            </span>
          )}
        </>
      )}
    </div>
  );
};
