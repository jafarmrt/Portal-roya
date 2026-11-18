// Whether this page holds something the person has not saved yet: text typed into a form, a dialog
// they are filling in, a settings section with edits. The portal refreshes itself after an update only
// when it does not (src/lib/appUpdate.ts).
//
// Forms do not have to announce themselves: every field the person types in or changes is remembered
// for as long as it is on the page. A part that knows better (a settings section that compares with
// what is saved) can add its own answer with addUnsavedCheck.

const touched = new Set<HTMLElement>();
const checks = new Set<() => boolean>();

/** A search box holds a question, not work: its text may go. */
const isSearch = (el: HTMLElement) =>
  (el instanceof HTMLInputElement && el.type === 'search') || el.getAttribute('role') === 'searchbox' || el.closest('[role="search"]') !== null;

const typedText = (el: HTMLElement): string | null => {
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLInputElement) return ['checkbox', 'radio', 'file', 'range', 'color', 'button', 'submit'].includes(el.type) ? null : el.value;
  if (el.isContentEditable) return el.textContent ?? '';
  return null;
};

function remember(event: Event) {
  const el = event.target;
  // Only what the person did themselves; a field the page fills in is not their work.
  if (event.isTrusted && el instanceof HTMLElement && !isSearch(el)) touched.add(el);
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', remember, true);
  document.addEventListener('change', remember, true);
}

/** Adds a part's own answer to "is anything unsaved?"; returns the way to take it away again. */
export function addUnsavedCheck(check: () => boolean) {
  checks.add(check);
  return () => {
    checks.delete(check);
  };
}

/** True while something on this page would be lost by refreshing it. */
export function hasUnsavedWork(): boolean {
  for (const check of checks) if (check()) return true;
  for (const el of touched) {
    if (!el.isConnected) {
      touched.delete(el);
      continue;
    }
    // Anything changed in a dialog that is still open: a choice, a tick, a date.
    if (el.closest('[role="dialog"]')) return true;
    // Elsewhere only text counts; a ticked note or a filter is already where it belongs.
    const text = typedText(el);
    if (text !== null && text.trim() !== '') return true;
  }
  return false;
}

/** True while a dialog is open: the page is not refreshed under it, even when nothing was typed. */
export const hasOpenDialog = () => typeof document !== 'undefined' && document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
