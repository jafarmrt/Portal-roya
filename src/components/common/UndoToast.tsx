import React from 'react';
import toast from 'react-hot-toast';
import { Undo2 } from 'lucide-react';

const UNDO_MS = 5000;

/**
 * Takes a personal item off the screen at once and deletes it for real only after a few seconds,
 * unless the person presses «برگرداندن». Used instead of an "Are you sure?" dialog for one's own
 * notes and messages. If the page is closed within those seconds the item simply stays.
 */
export function deleteWithUndo({
  message,
  hide,
  restore,
  commit,
}: {
  message: string;
  /** Removes the item from the screen. */
  hide: () => void;
  /** Puts it back (pressed «برگرداندن», or the delete failed). */
  restore: () => void;
  /** Deletes it on the server; false when it failed. */
  commit: () => Promise<boolean>;
}) {
  hide();
  let undone = false;
  const timer = window.setTimeout(() => {
    toast.dismiss(id);
    if (undone) return;
    void commit().then((ok) => {
      if (!ok) restore();
    });
  }, UNDO_MS);
  const undo = () => {
    undone = true;
    window.clearTimeout(timer);
    toast.dismiss(id);
    restore();
  };
  const id = toast.custom(
    (t) => (
      <div
        role="status"
        className={`flex items-center gap-3 pl-2 pr-4 py-2 rounded-2xl bg-ink text-white text-sm shadow-lg transition-opacity ${t.visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={undo}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 font-bold text-xs"
        >
          <Undo2 className="w-3.5 h-3.5" /> برگرداندن
        </button>
      </div>
    ),
    { duration: UNDO_MS + 500 },
  );
}
