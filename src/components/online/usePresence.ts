import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PRESENCE_EVENT } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import type { PresenceInfo } from '../../types';

/**
 * The list of online colleagues and this person's own choices, fetched again whenever the server
 * says someone came or went.
 */
export function usePresence(enabled: boolean) {
  const [data, setData] = useState<PresenceInfo | null>(null);

  const load = useCallback(() => api.get<PresenceInfo>('/api/presence').then(setData).catch(() => undefined), []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      // Every open page hears of a change at once; a random wait spreads their requests out.
      timer = setTimeout(() => void load(), 300 + Math.random() * 800);
    };
    window.addEventListener(PRESENCE_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(PRESENCE_EVENT, onChange);
    };
  }, [enabled, load]);

  /** Sends a ready-made emoji; true when it went. */
  const send = useCallback(async (to: string, emoji: string, replyTo?: number) => {
    try {
      const { waitUntil } = await api.post<{ id: number; waitUntil: string }>('/api/kudos', { to, emoji, replyTo });
      setData((d) => (d ? { ...d, waits: { ...d.waits, [to]: waitUntil }, sentToday: d.sentToday + 1 } : d));
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  }, []);

  /** Changes «show me online» or «let colleagues send me emoji». */
  const setChoice = useCallback(
    async (choice: Partial<PresenceInfo['me']>) => {
      try {
        const me = await api.put<PresenceInfo['me']>('/api/presence/me', choice);
        setData((d) => (d ? { ...d, me } : d));
        if (choice.showOnline !== undefined) void load();
        toast.success('ذخیره شد.');
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [load],
  );

  return { data, send, setChoice };
}
