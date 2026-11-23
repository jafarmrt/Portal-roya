import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { haptic } from '../../lib/feedback';
import { MOOD_REASONS_MAX, reasonsFor, type Mood, type MoodReason } from '../../../shared/mood';

/**
 * «چه چیزی بیشتر اثر داشت؟»: up to three reasons added to the day's mood with one tap each. Never
 * required; like the mood, managers only see how often each was chosen.
 */
export const MoodReasons: React.FC<{ mood: Mood; chosen: readonly MoodReason[] }> = ({ mood, chosen }) => {
  const { setMoodReasons } = usePortal();
  const [busy, setBusy] = useState(false);
  const toggle = async (id: MoodReason) => {
    if (busy) return;
    const next = chosen.includes(id) ? chosen.filter((r) => r !== id) : [...chosen, id];
    if (next.length > MOOD_REASONS_MAX) return;
    haptic();
    setBusy(true);
    await setMoodReasons(next);
    setBusy(false);
  };
  const full = chosen.length >= MOOD_REASONS_MAX;
  return (
    <div className="space-y-1.5" data-testid="mood-reasons">
      <p className="text-[11px] font-bold text-muted">چه چیزی بیشتر اثر داشت؟ <span className="font-medium text-faint">(اختیاری)</span></p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="چه چیزی بیشتر اثر داشت؟">
        {reasonsFor(mood).map((reason) => {
          const on = chosen.includes(reason.id);
          return (
            <button
              key={reason.id}
              type="button"
              onClick={() => void toggle(reason.id)}
              disabled={busy || (full && !on)}
              aria-pressed={on}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors disabled:opacity-50 ${on ? 'bg-brand-soft border-red-300/60 text-brand-strong' : 'bg-white border-line text-ink-soft hover:bg-surface'}`}
            >
              {reason.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
