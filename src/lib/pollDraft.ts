import type { Poll, PollAnswer } from '../types';

// Answers of a poll that is being filled in, kept until they are sent. A long form must not start
// from nothing because the dialog was closed by a stray click, the page was reloaded (a new release,
// a lost connection) or the list of polls changed under it. They stay in this tab only
// (sessionStorage) and are dropped on signing out, so nothing is left behind on a shared computer.

const PREFIX = 'roya.pollDraft.';
const keyOf = (userId: string, pollId: string) => `${PREFIX}${userId}.${pollId}`;

const isBlank = (a: PollAnswer) => a.optionIds.length === 0 && a.rating === null && a.text === '';

/** The kept answers that still fit the poll as it is now; null when there are none. */
export function readPollDraft(userId: string, poll: Poll): Record<string, PollAnswer> | null {
  try {
    const raw = window.sessionStorage.getItem(keyOf(userId, poll.id));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Record<string, Partial<PollAnswer> | undefined>;
    const draft: Record<string, PollAnswer> = {};
    // The poll may have been edited since: only questions and options it still has are brought back.
    for (const q of poll.questions) {
      const a = saved?.[q.id];
      if (!a || typeof a !== 'object') continue;
      const optionIds = Array.isArray(a.optionIds) ? q.options.map((o) => o.id).filter((id) => a.optionIds!.includes(id)) : [];
      const answer: PollAnswer = {
        optionIds: q.type === 'single' ? optionIds.slice(0, 1) : q.type === 'multiple' ? optionIds : [],
        rating: q.type === 'rating' && Number.isInteger(a.rating) && a.rating! >= 1 && a.rating! <= 5 ? a.rating! : null,
        text: q.type === 'text' && typeof a.text === 'string' ? a.text.slice(0, 2000) : '',
      };
      if (!isBlank(answer)) draft[q.id] = answer;
    }
    return Object.keys(draft).length > 0 ? draft : null;
  } catch {
    return null;
  }
}

/** Keeps the answers given so far; an empty form keeps nothing. */
export function writePollDraft(userId: string, pollId: string, answers: Record<string, PollAnswer>) {
  try {
    const filled = Object.fromEntries(Object.entries(answers).filter(([, a]) => !isBlank(a)));
    if (Object.keys(filled).length === 0) window.sessionStorage.removeItem(keyOf(userId, pollId));
    else window.sessionStorage.setItem(keyOf(userId, pollId), JSON.stringify(filled));
  } catch {
    // Without storage (private window, full quota) the form still works; it just is not kept.
  }
}

export function clearPollDraft(userId: string, pollId: string) {
  try {
    window.sessionStorage.removeItem(keyOf(userId, pollId));
  } catch {
    // Nothing was kept.
  }
}

/** On signing out: the next person at this computer must not find these answers. */
export function clearPollDrafts() {
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, i) => window.sessionStorage.key(i));
    for (const key of keys) if (key?.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
  } catch {
    // Nothing was kept.
  }
}
