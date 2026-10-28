import { useEffect, useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { api } from './api';
import { SUGGESTION_BOXES, type SuggestionBox } from '../../shared/suggestions';

export interface SuggestionSummary {
  boxes: SuggestionBox[];
  unread: Partial<Record<SuggestionBox, number>>;
}

const CHANGED = 'portal:suggestions-changed';

/** Tells the menu badge and «کارهای من» that a reader opened, answered or archived a message. */
export const suggestionsChanged = () => window.dispatchEvent(new Event(CHANGED));

/**
 * Unread messages in the boxes this person reads. Only readers fetch it; a new message reaches them
 * as a notification, so the count follows the notifications list.
 */
export function useSuggestionSummary(): SuggestionSummary | null {
  const { currentUser, can, notifications, featureOn } = usePortal();
  const [summary, setSummary] = useState<SuggestionSummary | null>(null);
  const reader = Boolean(currentUser) && featureOn('suggestions') && SUGGESTION_BOXES.some((b) => can(b.permission));
  const latest = notifications.find((n) => n.type === 'suggestion')?.id;
  useEffect(() => {
    if (!reader) {
      setSummary(null);
      return;
    }
    const load = () => api.get<SuggestionSummary>('/api/suggestions/summary').then(setSummary).catch(() => setSummary(null));
    void load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [reader, latest]);
  return summary;
}

export const unreadTotal = (summary: SuggestionSummary | null) =>
  summary ? Object.values(summary.unread).reduce((a, b) => a + (b ?? 0), 0) : 0;
