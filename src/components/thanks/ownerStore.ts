import { useEffect, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import type { RecognitionRules, RecognitionValue } from '../../../shared/recognition';
import { THANKS_EVENT } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import type { ThanksPerson, ThanksValue } from './thanksStore';

// «برنامهٔ سپاس» for its owner (permission `recognition.manage`): the reports colleagues sent, the rules
// of the coins and the values. Kept apart from thanksStore, since the owner looks after the programme
// even while «سپاس» itself is switched off or hidden from them (still in preview with a pilot group).

export interface RecognitionReport {
  id: string;
  from: ThanksPerson;
  to: ThanksPerson;
  value: ThanksValue;
  message: string;
  isPublic: boolean;
  at: string;
  reportedAt: string;
  note: string;
  closed: boolean;
  reversed: boolean;
}

export interface ProgrammeSettings {
  rules: RecognitionRules;
  /** A change of the rules that waits for the first day of a month. */
  pending: { rules: RecognitionRules; from: string; fromLabel: string } | null;
  values: RecognitionValue[];
  /** While «سپاس» is switched off a change of the rules applies at once. */
  rulesApplyAtOnce: boolean;
}

interface State {
  reports: RecognitionReport[];
  /** Reports already dealt with, loaded when asked for. */
  history: RecognitionReport[] | null;
  reportsLoaded: boolean;
  settings: ProgrammeSettings | null;
}

let state: State = { reports: [], history: null, reportsLoaded: false, settings: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useProgramme = () => useSyncExternalStore(subscribe, () => state);

export async function loadReports() {
  try {
    const reports = await api.get<RecognitionReport[]>('/api/recognitions/reports');
    set({ reports, reportsLoaded: true });
    if (state.history) void loadHistory();
  } catch {
    set({ reportsLoaded: true });
  }
}

export async function loadHistory() {
  try {
    const all = await api.get<RecognitionReport[]>('/api/recognitions/reports?all=1');
    set({ history: all.filter((r) => r.closed) });
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export async function loadProgrammeSettings() {
  try {
    set({ settings: await api.get<ProgrammeSettings>('/api/settings/recognition') });
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

/** Saves the rules, the values or both; true when it worked. */
export async function saveProgrammeSettings(change: { rules?: RecognitionRules; values?: RecognitionValue[] }, done: string) {
  try {
    set({ settings: await api.put<ProgrammeSettings>('/api/settings/recognition', change) });
    toast.success(done);
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    return false;
  }
}

/** «دیدم، بماند»: the report is closed and the recognition stays. */
export async function closeReport(id: string) {
  try {
    await api.post(`/api/recognitions/${id}/report/close`);
    toast.success('گزارش بسته شد و به گزارش‌دهنده خبر داده شد.');
    void loadReports();
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    return false;
  }
}

/** Takes a recognition back, with the reason both people are told; true when it is done. */
export async function reverseRecognition(id: string, reason: string) {
  try {
    await api.post(`/api/recognitions/${id}/reverse`, { reason });
    toast.success('قدردانی برگردانده شد؛ سکه‌ها به فرستنده برگشت و به هر دو نفر خبر داده شد.');
    void loadReports();
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    return false;
  }
}

export function resetProgramme() {
  set({ reports: [], history: null, reportsLoaded: false, settings: null });
}

/**
 * How many reports wait for the owner, for the badge of «برنامهٔ سپاس» in the menu: loaded once the
 * owner is signed in and again whenever «سپاس» changed for them (a new report is signalled to them).
 */
export function useOpenReports(owner: boolean) {
  const { reports } = useProgramme();
  useEffect(() => {
    if (!owner) return;
    void loadReports();
    const again = () => {
      void loadReports();
    };
    window.addEventListener(THANKS_EVENT, again);
    return () => window.removeEventListener(THANKS_EVENT, again);
  }, [owner]);
  return owner ? reports.length : 0;
}
