import { useEffect } from 'react';

// Settings sections with edits that are not saved yet. Switching to another settings tab closes the
// open one, so the page asks first instead of losing the edits.

const dirtySections = new Set<string>();

/** Marks a settings section as holding unsaved edits while `dirty` is true. */
export function useUnsavedChanges(id: string, dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    dirtySections.add(id);
    return () => {
      dirtySections.delete(id);
    };
  }, [id, dirty]);
}

export const hasUnsavedChanges = () => dirtySections.size > 0;

/** True when there is nothing unsaved, or the person agrees to leave it. */
export const confirmDiscard = () =>
  !hasUnsavedChanges() || window.confirm('تغییراتی که ذخیره نکرده‌اید از دست می‌رود. بدون ذخیره ادامه می‌دهید؟');
