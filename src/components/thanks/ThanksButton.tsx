import React from 'react';
import { HandHeart } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { openGive, useCanThank } from './thanksStore';

/**
 * «قدردانی کن» beside the work itself (phase 2, 2.2): a referral task marked done, a course that was held,
 * an online colleague. It opens the form with the colleague chosen and, where it fits, a value suggested;
 * the message is the sender's own. Shown only when «سپاس» is on for both and this month's coins are not
 * all given.
 */
export const ThanksButton: React.FC<{
  to: string;
  name: string;
  /** A value to suggest (its id); left out when the company's list has no such value. */
  valueId?: string;
  label?: string;
  /** Called before the form opens (to close a dialog it was opened from). */
  onOpen?: () => void;
  className?: string;
}> = ({ to, name, valueId, label, onOpen, className }) => {
  const { currentUser } = usePortal();
  const can = useCanThank(to, currentUser?.id);
  if (!can) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openGive(to, { valueId });
      }}
      aria-label={`قدردانی از ${name}`}
      className={
        className ??
        'tap-area inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gold-soft hover:bg-gold/30 border border-gold/60 text-xs font-bold text-ink transition-colors'
      }
    >
      <HandHeart className="w-3.5 h-3.5" />
      {label ?? 'قدردانی کن'}
    </button>
  );
};
