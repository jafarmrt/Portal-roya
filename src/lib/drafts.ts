import { useCallback, useEffect, useRef } from 'react';

// What a colleague has written in a long form but not sent yet, kept so that refreshing the page (for
// a new version, by mistake, after a lost connection) or closing the form does not lose it. Like the
// answers of a survey (src/lib/pollDraft.ts) a draft stays in this tab only (sessionStorage), belongs
// to the person signed in, never leaves the browser, and is dropped once the form is sent, on «پاک کن»
// and on signing out.

const PREFIX = 'roya.draft.';
const keyOf = (userId: string, name: string) => `${PREFIX}${userId}.${name}`;
/** A draft is text, not attachments: anything larger than this is not kept. */
const MAX_LENGTH = 400_000;

export function readDraft<T>(userId: string | null | undefined, name: string): T | null {
  if (!userId) return null;
  try {
    const raw = window.sessionStorage.getItem(keyOf(userId, name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Keeps the draft, or (null) drops it. */
export function writeDraft(userId: string | null | undefined, name: string, value: unknown) {
  if (!userId) return;
  try {
    const text = value === null ? null : JSON.stringify(value);
    if (text === null || text.length > MAX_LENGTH) window.sessionStorage.removeItem(keyOf(userId, name));
    else window.sessionStorage.setItem(keyOf(userId, name), text);
  } catch {
    // Without storage (private window, full quota) the form still works; it just is not kept.
  }
}

/** On signing out: the next person at this computer must not find these. */
export function clearDrafts() {
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, i) => window.sessionStorage.key(i));
    for (const key of keys) if (key?.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
  } catch {
    // Nothing was kept.
  }
}

/**
 * Keeps `value` as the draft called `name` while the form is open: shortly after every change, when
 * the form closes and when the page is left. `worthKeeping` is false for an empty form, which keeps
 * nothing. The form reads its earlier draft itself (readDraft) for its first state, and calls
 * `discard` once it is sent.
 */
export function useDraft(userId: string | null | undefined, name: string | null, value: unknown, worthKeeping: boolean) {
  const latest = useRef({ value, worthKeeping });
  const sent = useRef(false);

  useEffect(() => {
    latest.current = { value, worthKeeping };
    if (!name) return;
    // A change after sending is a new piece of writing.
    sent.current = false;
    const timer = window.setTimeout(() => {
      if (!sent.current) writeDraft(userId, name, worthKeeping ? value : null);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [userId, name, value, worthKeeping]);

  useEffect(() => {
    if (!name) return;
    const keep = () => {
      if (!sent.current) writeDraft(userId, name, latest.current.worthKeeping ? latest.current.value : null);
    };
    window.addEventListener('pagehide', keep);
    return () => {
      window.removeEventListener('pagehide', keep);
      keep();
    };
  }, [userId, name]);

  const discard = useCallback(() => {
    sent.current = true;
    if (name) writeDraft(userId, name, null);
  }, [userId, name]);
  return { discard };
}
