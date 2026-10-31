import React, { useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTION_EMOJIS, type ReactionCount, type ReactionTarget } from '../../../shared/reactions';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { haptic, pop } from '../../lib/feedback';

/** The counts as they will be once the person's own emoji is `emoji` ('' = none). */
function withMine(list: ReactionCount[], emoji: string): ReactionCount[] {
  const out = list
    .map((r) => (r.mine ? { ...r, mine: false, count: r.count - 1 } : r))
    .filter((r) => r.count > 0);
  if (!emoji) return out;
  const found = out.find((r) => r.emoji === emoji);
  if (found) return out.map((r) => (r === found ? { ...r, mine: true, count: r.count + 1 } : r));
  return [...out, { emoji, count: 1, mine: true, names: [] }];
}

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
  // The person's choice shows at once; the server's answer replaces it when it arrives.
  const [optimistic, setOptimistic] = useState<ReactionCount[] | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => setOptimistic(null), [reactions]);
  const shown = optimistic ?? reactions;
  if (!canReact && shown.length === 0) return null;
  const mine = shown.find((r) => r.mine)?.emoji ?? '';

  const choose = async (emoji: string) => {
    if (busy) return;
    const next = mine === emoji ? '' : emoji;
    setBusy(true);
    setPicking(false);
    setOptimistic(withMine(shown, next));
    haptic();
    if (next) requestAnimationFrame(() => pop(bar.current?.querySelector(`[data-emoji="${next}"]`)));
    await react(target, id, next);
    setBusy(false);
  };

  const chip = small ? 'h-6 px-1.5 text-xs gap-0.5' : 'h-7 px-2 text-sm gap-1';
  return (
    <div ref={bar} className="flex items-center flex-wrap gap-1" role="group" aria-label={label}>
      {shown.map((r) => (
        <button
          key={r.emoji}
          data-emoji={r.emoji}
          type="button"
          disabled={!canReact || busy}
          onClick={() => void choose(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`${r.emoji} ${toPersianDigits(r.count)}${r.mine ? '، شما هم' : ''}`}
          title={r.names.length ? r.names.join('، ') : undefined}
          className={`inline-flex items-center rounded-full border leading-none transition-colors disabled:cursor-default ${chip} ${
            r.mine ? 'bg-red-50 border-red-300 text-red-900' : 'bg-white/80 border-line text-ink-soft enabled:hover:bg-white'
          }`}
        >
          <span aria-hidden>{r.emoji}</span>
          <span className="text-xs font-bold" aria-hidden>{toPersianDigits(r.count)}</span>
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
            className={`inline-flex items-center justify-center rounded-full border border-dashed border-line-strong text-faint hover:text-brand-strong hover:border-brand-strong bg-white/60 ${small ? 'w-6 h-6' : 'w-7 h-7'}`}
          >
            <SmilePlus className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
          {picking && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white border border-line shadow-sm px-1 py-0.5">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void choose(e)}
                  aria-label={`واکنش ${e}`}
                  aria-pressed={mine === e}
                  className={`w-7 h-7 rounded-full text-base leading-none hover:bg-surface ${mine === e ? 'ring-2 ring-red-300' : ''}`}
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
