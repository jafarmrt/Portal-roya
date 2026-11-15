import { useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api';

// «سپاس» on the client: the month's wallet and the colleague's own recognitions, kept in one place for
// the dashboard card, the page and the two dialogs (giving one, opening a sealed one). The server
// tells every page when something changed (THANKS_EVENT); <ThanksHost> then loads this again.

export interface ThanksPerson {
  id: string;
  name: string;
  avatar: string;
  position: string;
  department: string;
}

export interface ThanksValue {
  id: string;
  label: string;
  tone: string;
}

export interface Wallet {
  month: string;
  allowance: number;
  given: number;
  left: number;
  day: number;
  daysInMonth: number;
  daysLeft: number;
  rules: { perPersonMax: number; dailyMax: number };
  amounts: number[];
  defaultAmount: number;
  joinAmount: number;
  writtenToday: number;
  values: ThanksValue[];
  undoMs: number;
  messageMin: number;
  messageMax: number;
  /** Coins of the recognitions already opened, and how many still wait sealed. */
  received: { coins: number; sealed: number };
}

/** Not opened yet: who it is from, and nothing else. */
export interface SealedCard {
  id: string;
  from: ThanksPerson;
  at: string;
  sealed: true;
}

export interface OpenedCard {
  id: string;
  from: ThanksPerson;
  at: string;
  sealed: false;
  value: ThanksValue;
  message: string;
  amount: number;
  /** Colleagues who added their own coins («من هم»), and what it comes to with them. */
  joiners: { name: string; amount: number }[];
  total: number;
  isPublic: boolean;
  hidden: boolean;
  openedAt: string;
  reaction: string;
  reported: boolean;
}

export type ReceivedCard = SealedCard | OpenedCard;

export interface GivenCard {
  id: string;
  to: ThanksPerson;
  amount: number;
  value: ThanksValue;
  message: string;
  isPublic: boolean;
  /** The card on the wall this «من هم» was added to. */
  joinOf: string | null;
  at: string;
  delivered: boolean;
  /** Until then it can still be taken back. */
  withdrawUntil: string | null;
  opened: boolean;
  reaction: string;
  reversed: boolean;
  reverseReason: string;
}

export interface Colleague extends ThanksPerson {
  givenThisMonth: number;
}

interface Mine {
  received: ReceivedCard[];
  receivedNext: string | null;
  given: GivenCard[];
  givenNext: string | null;
}

interface State extends Mine {
  wallet: Wallet | null;
  loaded: boolean;
  /** The give dialog is open, perhaps for one colleague already. */
  giving: { to?: string } | null;
  /** The recognition whose envelope is on screen. */
  revealing: string | null;
}

let state: State = {
  wallet: null,
  received: [],
  receivedNext: null,
  given: [],
  givenNext: null,
  loaded: false,
  giving: null,
  revealing: null,
};

const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useThanks = () => useSyncExternalStore(subscribe, () => state);

/**
 * The first page as it is now, followed by the older cards already loaded with «بیشتر». A card that is
 * gone from the first page (taken back, reversed) is gone here too.
 */
function merge<T extends { id: string; at: string }>(fresh: T[], freshNext: string | null, old: T[], oldNext: string | null) {
  const last = fresh.at(-1);
  if (!last || !freshNext) return { items: fresh, next: freshNext };
  const older = old.filter((o) => o.at < last.at && !fresh.some((f) => f.id === o.id));
  return older.length > 0 ? { items: [...fresh, ...older], next: oldNext } : { items: fresh, next: freshNext };
}

/** Loads the wallet and both lists; quiet on failure (the card simply stays as it was). */
export async function loadThanks() {
  try {
    const [wallet, mine] = await Promise.all([api.get<Wallet>('/api/recognitions/wallet'), api.get<Mine>('/api/recognitions/mine')]);
    const received = merge(mine.received, mine.receivedNext, state.received, state.receivedNext);
    const given = merge(mine.given, mine.givenNext, state.given, state.givenNext);
    set({ wallet, received: received.items, receivedNext: received.next, given: given.items, givenNext: given.next, loaded: true });
  } catch {
    // The part may have been switched off meanwhile; the settings signal hides it.
  }
}

/** Forgets everything (signing out, or the part was switched off). */
export function resetThanks() {
  set({ wallet: null, received: [], receivedNext: null, given: [], givenNext: null, loaded: false, giving: null, revealing: null });
}

export async function loadMoreThanks(list: 'received' | 'given') {
  const cursor = list === 'received' ? state.receivedNext : state.givenNext;
  if (!cursor) return;
  try {
    const page = await api.get<Mine>(`/api/recognitions/mine?${list}Before=${encodeURIComponent(cursor)}`);
    if (list === 'received') set({ received: [...state.received, ...page.received.filter((c) => !state.received.some((o) => o.id === c.id))], receivedNext: page.receivedNext });
    else set({ given: [...state.given, ...page.given.filter((c) => !state.given.some((o) => o.id === c.id))], givenNext: page.givenNext });
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export const openGive = (to?: string) => set({ giving: { to } });
export const closeGive = () => set({ giving: null });
export const openReveal = (id: string) => set({ revealing: id });
export const closeReveal = () => set({ revealing: null });

export const loadColleagues = () => api.get<Colleague[]>('/api/recognitions/colleagues');

export interface GiveInput {
  to: string;
  amount: number;
  valueId: string;
  message: string;
  isPublic: boolean;
}

/** Sends a recognition; the new one's id, or null (with the reason shown) when it did not go. */
export async function giveThanks(input: GiveInput) {
  try {
    const sent = await api.post<{ id: string; withdrawUntil: string; wallet: Wallet }>('/api/recognitions', input);
    set({ wallet: sent.wallet });
    void loadThanks();
    return sent;
  } catch (err) {
    toast.error(errorMessage(err));
    return null;
  }
}

/** «پس گرفتن» within the first minutes; true when the coins are back. */
export async function withdrawThanks(id: string) {
  try {
    const { wallet } = await api.post<{ wallet: Wallet }>(`/api/recognitions/${id}/withdraw`);
    set({ wallet, given: state.given.filter((g) => g.id !== id) });
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    void loadThanks();
    return false;
  }
}

const replaceReceived = (card: OpenedCard) =>
  set({ received: state.received.some((c) => c.id === card.id) ? state.received.map((c) => (c.id === card.id ? card : c)) : [card, ...state.received] });

/** Breaks the seal; the opened card, or null when it could not be opened. */
export async function openThanks(id: string) {
  try {
    const card = await api.post<OpenedCard>(`/api/recognitions/${id}/open`);
    replaceReceived(card);
    void loadThanks();
    return card;
  } catch (err) {
    toast.error(errorMessage(err));
    return null;
  }
}

/** The receiver's own emoji on a recognition ('' takes it back). */
export async function answerThanks(id: string, reaction: string) {
  try {
    replaceReceived(await api.put<OpenedCard>(`/api/recognitions/${id}/reaction`, { reaction }));
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

/** «گزارش»: shows this one recognition to the programme's owner; true when it went. */
export async function reportThanks(id: string, note: string) {
  try {
    replaceReceived(await api.post<OpenedCard>(`/api/recognitions/${id}/report`, { note }));
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    return false;
  }
}
