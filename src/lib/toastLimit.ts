import { useEffect } from 'react';
import toast, { useToasterStore, type Toast } from 'react-hot-toast';

// Short messages («… ثبت شد.») stack up in a corner. Someone who works quickly (the special-event desk
// shows one for every step) could pile up a column of them over the page, and react-hot-toast keeps
// every message on screen while the mouse is over any of them, so the pile never went away by itself.
// Only the newest few are kept; older ones go as soon as a new one comes.

/** How many messages are on screen at once. */
export const MAX_TOASTS = 3;

/**
 * The messages to take away so that at most `max` stay: the oldest first, but a message with a button
 * of its own («برگردان», «پس گرفتن») only after all the plain ones, since it may still be needed.
 */
export function toastsToDismiss(toasts: Pick<Toast, 'id' | 'type' | 'visible' | 'createdAt'>[], max = MAX_TOASTS): string[] {
  const shown = toasts.filter((t) => t.visible);
  const extra = shown.length - max;
  if (extra <= 0) return [];
  const order = [...shown].sort((a, b) => Number(a.type === 'custom') - Number(b.type === 'custom') || a.createdAt - b.createdAt);
  return order.slice(0, extra).map((t) => t.id);
}

/** Mounted next to <Toaster>: keeps the number of messages on screen at MAX_TOASTS. */
export function useToastLimit(max = MAX_TOASTS) {
  const { toasts } = useToasterStore();
  useEffect(() => {
    for (const id of toastsToDismiss(toasts, max)) toast.dismiss(id);
  }, [toasts, max]);
}
