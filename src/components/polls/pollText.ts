import { toPersianDigits } from '../../lib/jalali';
import type { Poll, PollQuestionType, PollResultsVisibility } from '../../types';

export const QUESTION_TYPES: { type: PollQuestionType; label: string; hint: string }[] = [
  { type: 'single', label: 'تک‌گزینه‌ای', hint: 'یکی از گزینه‌ها انتخاب می‌شود' },
  { type: 'multiple', label: 'چندگزینه‌ای', hint: 'چند گزینه با هم انتخاب می‌شود' },
  { type: 'rating', label: 'امتیاز ۱ تا ۵', hint: 'از ۱ (خیلی کم) تا ۵ (خیلی زیاد)' },
  { type: 'text', label: 'تشریحی', hint: 'پاسخ به صورت متن نوشته می‌شود' },
];

export const typeLabel = (type: PollQuestionType) => QUESTION_TYPES.find((t) => t.type === type)!.label;

export const VISIBILITY: { value: PollResultsVisibility; label: string; hint: string }[] = [
  { value: 'managers', label: 'فقط من و مدیران نظرسنجی', hint: 'همکاران نتیجه را نمی‌بینند.' },
  { value: 'after_answer', label: 'همکاران، بعد از پاسخ دادن', hint: 'هر کس پاسخ داد، نتیجهٔ کلی تا آن لحظه را می‌بیند.' },
  { value: 'after_close', label: 'همکاران، بعد از پایان نظرسنجی', hint: 'تا وقتی نظرسنجی باز است نتیجه پنهان می‌ماند.' },
];

/** What colleagues are told about the results on the poll card. */
export const visibilityNote: Record<PollResultsVisibility, string> = {
  managers: 'نتایج فقط برای طراح و مدیران',
  after_answer: 'نتایج بعد از پاسخ دادن',
  after_close: 'نتایج بعد از پایان نظرسنجی',
};

/** Why this viewer cannot see the results yet. */
export function hiddenResultsReason(poll: Poll) {
  if (poll.resultsVisibility === 'managers') return 'نتایج این نظرسنجی فقط برای طراح آن و مدیران نمایش داده می‌شود.';
  if (poll.resultsVisibility === 'after_close') return 'نتایج پس از پایان نظرسنجی نمایش داده می‌شود.';
  return 'نتایج پس از ثبت پاسخ شما نمایش داده می‌شود.';
}

export const anonymityNote = (anonymous: boolean) =>
  anonymous ? 'نام پاسخ‌دهنده به هیچ‌کس، حتی طراح نظرسنجی، نشان داده نمی‌شود.' : 'طراح نظرسنجی و مدیران می‌بینند هر کس چه پاسخی داده است.';

/** "همهٔ سازمان", or the chosen departments and locations, and how many people were added by name (polls, calendar events). */
export function audienceLabel(poll: Pick<Poll, 'targetDepartments' | 'targetLocations' | 'targetRoles' | 'targetUserCount'>) {
  const groups = [...poll.targetDepartments, ...poll.targetLocations];
  const parts = groups.length > 0 ? [groups.join('، ')] : poll.targetRoles.length > 0 ? ['سطح‌های دسترسی مشخص'] : [];
  if (poll.targetUserCount > 0) parts.push(`${toPersianDigits(poll.targetUserCount)} همکار`);
  return parts.length > 0 ? parts.join(' + ') : 'همهٔ سازمان';
}
