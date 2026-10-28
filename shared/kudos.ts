// «همکاران آنلاین»: a small list of the colleagues who have the portal open, and a ready-made emoji
// (a flower, a thank-you) that can be sent to one of them. There is deliberately no text, no files and
// no group chat, so it never turns into a replacement for the company messenger.

/** Someone counts as online while a page of the portal is open and they did something in this long. */
export const ONLINE_IDLE_MINUTES = 10;

/** One emoji to the same colleague at most this often. */
export const KUDOS_PAIR_MINUTES = 10;

/** How many emoji one person may send in a day. */
export const KUDOS_DAILY_LIMIT = 30;

/**
 * An emoji received waits in a small banner on the receiver's pages until they close it, for this long,
 * and can be answered with one emoji meanwhile; the exchange ends there. Emoji are not notifications.
 */
export const KUDOS_REPLY_HOURS = 24;

/** The banner lists at most this many emoji. */
export const KUDOS_BANNER_MAX = 20;

/** The administrator's list holds at most this many emoji. */
export const KUDOS_EMOJI_MAX = 12;

/** Sent emoji are kept this long for the monthly totals in the reports, then removed. */
export const KUDOS_KEEP_DAYS = 400;

export interface KudosEmoji {
  id: string;
  emoji: string;
  label: string;
}

/** The six emoji everyone has until an administrator changes the list. */
export const DEFAULT_KUDOS_EMOJIS: KudosEmoji[] = [
  { id: 'flower', emoji: '🌹', label: 'تقدیم با گل' },
  { id: 'thanks', emoji: '🙏', label: 'تشکر' },
  { id: 'bravo', emoji: '👏', label: 'آفرین' },
  { id: 'strength', emoji: '💪', label: 'خسته نباشید' },
  { id: 'tea', emoji: '☕', label: 'چایی به افتخارت' },
  { id: 'smile', emoji: '😊', label: 'لبخند' },
];

/** The list in use: the administrator's, or the built-in one while they have not set any. */
export const kudosEmojis = (saved: readonly KudosEmoji[] | null | undefined): KudosEmoji[] =>
  saved && saved.length > 0 ? [...saved] : DEFAULT_KUDOS_EMOJIS;

/** What the receiver reads, e.g. «مریم احمدی برایتان 🌹 «تقدیم با گل» فرستاد». */
export const kudosMessage = (fromName: string, emoji: Pick<KudosEmoji, 'emoji' | 'label'>, reply = false) =>
  `${fromName} ${reply ? 'در پاسخ ' : ''}برایتان ${emoji.emoji} «${emoji.label}» فرستاد.`;
