import React, { useEffect, useState } from 'react';
import moment from 'moment-jalaali';
import { CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, FileCheck2, FileText, GraduationCap, LifeBuoy, ListTodo, MessageCircleQuestion, MessageSquareHeart, MessageSquareText, Vote } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api } from '../../lib/api';
import { dayLabel, formatDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import type { PendingNewsQuestion } from '../../types';
import { deadlineState } from '../news/NewsBody';
import { useSuggestionSummary } from '../../lib/suggestionSummary';
import { suggestionBox } from '../../../shared/suggestions';

interface Task {
  key: string;
  icon: React.ReactNode;
  kind: string;
  title: string;
  when: string;
  urgent?: boolean;
  /** Sort order: overdue and soon first, then by date. */
  rank: string;
  open: () => void;
}

const WEEK_EVENT_TYPES = new Set(['meeting', 'event', 'holiday']);

/** Tasks shown before «نمایش همه»; the card sits in the narrow side column. */
const SHOWN = 5;

/**
 * What this person still has to do or attend: circulars and mandatory documents to acknowledge,
 * documents of theirs due for review, polls to answer, events asking whether they will attend, recent
 * courses to give feedback on, questions about their news items, and their trainings and events in the
 * coming seven days. Opens the side column of the dashboard, one line per task.
 */
export const MyTasksCard: React.FC = () => {
  const { currentUser, news, polls, trainings, calendarEvents, documents, guides, can, setActiveTab } = usePortal();
  const [questions, setQuestions] = useState<PendingNewsQuestion[]>([]);
  const [showAll, setShowAll] = useState(false);
  const suggestionSummary = useSuggestionSummary();
  const userId = currentUser?.id;
  // Asked and answered questions reload the news list, so this follows it.
  useEffect(() => {
    if (!userId) return;
    api.get<PendingNewsQuestion[]>('/api/news-questions/pending').then(setQuestions).catch(() => setQuestions([]));
  }, [userId, news]);
  if (!currentUser) return null;

  const today = todayJalali();
  const weekEnd = moment().add(7, 'days').format('jYYYY/jMM/jDD');
  const inWeek = (date: string) => date >= today && date <= weekEnd;

  const tasks: Task[] = [];
  for (const n of news) {
    if (n.status !== 'published' || !n.requiresAck || n.acknowledgedAt) continue;
    const state = deadlineState(n);
    tasks.push({
      key: `news-${n.id}`,
      icon: <FileCheck2 className="w-4 h-4 text-amber-700" />,
      kind: 'بخشنامهٔ منتظر تأیید',
      title: n.title,
      when: n.ackDeadline ? (state === 'overdue' ? `مهلت گذشته (${formatDate(n.ackDeadline)})` : `مهلت ${dayLabel(n.ackDeadline)}`) : formatDate(n.publishAt),
      urgent: state === 'overdue' || state === 'soon',
      rank: `0-${n.ackDeadline ?? '9'}`,
      open: () => setActiveTab('news', n.id),
    });
  }
  // Colleagues' questions about this person's news, one task per item.
  const asked = new Map<string, PendingNewsQuestion[]>();
  for (const q of questions) asked.set(q.newsId, [...(asked.get(q.newsId) ?? []), q]);
  for (const [newsId, open] of asked) {
    tasks.push({
      key: `question-${newsId}`,
      icon: <MessageCircleQuestion className="w-4 h-4 text-amber-700" />,
      kind: open.length > 1 ? `${toPersianDigits(open.length)} پرسش بی‌پاسخ` : 'پرسش بی‌پاسخ',
      title: open[0].newsTitle,
      when: formatDate(open[0].createdAt),
      rank: `1-${open[0].createdAt}`,
      open: () => setActiveTab('news', newsId),
    });
  }
  // Unread messages in the suggestion boxes this person reads, one task per box.
  for (const [box, count] of Object.entries(suggestionSummary?.unread ?? {})) {
    if (!count) continue;
    tasks.push({
      key: `suggestions-${box}`,
      icon: <MessageSquareText className="w-4 h-4 text-indigo-700" />,
      kind: `${toPersianDigits(count)} پیام نخوانده`,
      title: suggestionBox(box)?.label ?? box,
      when: 'انتقادات و پیشنهادات',
      rank: '1-0',
      open: () => setActiveTab('suggestions', box),
    });
  }
  for (const d of documents) {
    if (!d.requiresAck || !d.forMe || d.acknowledgedAt) continue;
    tasks.push({
      key: `doc-${d.id}`,
      icon: <FileText className="w-4 h-4 text-amber-700" />,
      kind: d.acknowledgedEarlier ? 'نسخهٔ جدید سند لازم‌الاجرا' : 'سند لازم‌الاجرا',
      title: d.title,
      when: formatDate(d.updatedAt),
      rank: `0-${d.updatedAt}`,
      open: () => setActiveTab('documents', d.id),
    });
  }
  // Managers see every overdue review in the documents page; here only the ones they look after.
  for (const d of documents) {
    if (!d.needsReview || !(d.ownerId === currentUser.id || (!d.ownerId && can('documents.manage')))) continue;
    tasks.push({
      key: `review-${d.id}`,
      icon: <CalendarClock className="w-4 h-4 text-red-700" />,
      kind: 'بازبینی سند',
      title: d.title,
      when: formatDate(d.reviewAt),
      rank: `1-${d.reviewAt}`,
      open: () => setActiveTab('documents', d.id),
    });
  }
  for (const g of guides) {
    if (!g.needsReview || !(g.ownerId === currentUser.id || (!g.ownerId && can('documents.manage')))) continue;
    tasks.push({
      key: `guide-review-${g.id}`,
      icon: <LifeBuoy className="w-4 h-4 text-red-700" />,
      kind: 'بازبینی راهنما',
      title: g.title,
      when: formatDate(g.reviewAt),
      rank: `1-${g.reviewAt}`,
      open: () => setActiveTab('guides', g.id),
    });
  }
  for (const p of polls) {
    if (!p.isActive || !p.forMe || p.hasVoted) continue;
    tasks.push({
      key: `poll-${p.id}`,
      icon: <Vote className="w-4 h-4 text-red-700" />,
      kind: 'نظرسنجی باز',
      title: p.title,
      when: p.expiryDate ? `تا ${dayLabel(p.expiryDate)}` : 'بدون مهلت',
      rank: `1-${p.expiresAt ?? '9'}`,
      open: () => setActiveTab('polls', p.id),
    });
  }
  const twoWeeksAgo = moment().subtract(14, 'days').format('jYYYY/jMM/jDD');
  for (const t of trainings) {
    // Took part in a course of the last two weeks and has not said how it was.
    if (t.myStatus === 'enrolled' && t.myAttended !== false && !t.myFeedback && t.date < today && t.date >= twoWeeksAgo) {
      tasks.push({
        key: `training-${t.id}`,
        icon: <MessageSquareHeart className="w-4 h-4 text-[#991b1b]" />,
        kind: 'نظر دربارهٔ دوره',
        title: t.title,
        when: formatDate(t.date),
        rank: `1-${t.date}`,
        open: () => setActiveTab('training', t.id),
      });
      continue;
    }
    if (!t.myStatus || !inWeek(t.date)) continue;
    tasks.push({
      key: `training-${t.id}`,
      icon: <GraduationCap className="w-4 h-4 text-[#991b1b]" />,
      kind: t.myStatus === 'waitlist' ? `لیست انتظار دوره (نفر ${toPersianDigits(t.myWaitlistPosition ?? 1)})` : 'دورهٔ من',
      title: t.title,
      when: `${dayLabel(t.date)}${t.time ? `، ساعت ${toPersianDigits(t.time)}` : ''}`,
      rank: `2-${t.date}-${t.time}`,
      open: () => setActiveTab('training', t.id),
    });
  }
  for (const e of calendarEvents) {
    if (!e.forMe || e.trainingId || e.date < today) continue;
    // Asked whether they attend and not answered yet: a task until the day itself.
    if (e.rsvp && e.myRsvp === null) {
      tasks.push({
        key: `event-${e.id}`,
        icon: <CalendarCheck className="w-4 h-4 text-sky-700" />,
        kind: 'شرکت می‌کنید؟',
        title: e.title,
        when: `${dayLabel(e.date)}${e.time ? `، ساعت ${toPersianDigits(e.time)}` : ''}`,
        urgent: e.date === today,
        rank: `1-${e.date}`,
        open: () => setActiveTab('calendar', e.id),
      });
      continue;
    }
    if (!WEEK_EVENT_TYPES.has(e.type) || !inWeek(e.date) || e.myRsvp === false) continue;
    tasks.push({
      key: `event-${e.id}`,
      icon: <CalendarDays className="w-4 h-4 text-sky-700" />,
      kind: e.type === 'holiday' ? 'تعطیلی' : e.type === 'meeting' ? 'جلسه' : 'رویداد',
      title: e.title,
      when: `${dayLabel(e.date)}${e.time ? `، ساعت ${toPersianDigits(e.time)}` : ''}`,
      rank: `2-${e.date}-${e.time ?? ''}`,
      open: () => setActiveTab('calendar', e.id),
    });
  }
  tasks.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || a.rank.localeCompare(b.rank));

  if (tasks.length === 0) {
    return (
      <section className="bg-white border border-[#E6E0D5] rounded-2xl px-4 py-3 flex items-center gap-2 text-xs text-[#4B4740] leading-relaxed" aria-label="کارهای من">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span><strong>کارهای من:</strong> بخشنامه، سند یا نظرسنجی منتظر و برنامه‌ای برای این هفته ندارید.</span>
      </section>
    );
  }

  const shown = showAll ? tasks : tasks.slice(0, SHOWN);
  return (
    <section className="bg-white border border-amber-300 rounded-3xl p-4 space-y-2.5" aria-labelledby="my-tasks-title">
      <div className="flex items-center gap-2">
        <span className="p-1.5 bg-amber-100 text-amber-800 rounded-xl"><ListTodo className="w-4 h-4" /></span>
        <h2 id="my-tasks-title" className="text-sm font-black text-[#2D2D2D]">کارهای من</h2>
        <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900 rounded-full">{toPersianDigits(tasks.length)} مورد</span>
      </div>
      <ul className="space-y-1">
        {shown.map((t) => (
          <li key={t.key}>
            <button
              onClick={t.open}
              title={`${t.kind}: ${t.title} (${t.when})`}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-right transition-colors ${
                t.urgent ? 'bg-red-50 border-red-200 hover:border-red-500' : 'bg-[#F9F7F4] border-[#E6E0D5] hover:border-[#dc2626]'
              }`}
            >
              <span className="shrink-0" aria-hidden="true">{t.icon}</span>
              <span className="flex-1 min-w-0 truncate text-xs font-bold text-[#2D2D2D]">
                <span className="sr-only">{t.kind}: </span>
                {t.title}
              </span>
              <span className={`text-[10px] whitespace-nowrap ${t.urgent ? 'text-red-700 font-bold' : 'text-[#6E6A60]'}`}>{t.when}</span>
              <ChevronLeft className="w-3.5 h-3.5 text-[#A8A295] shrink-0" />
            </button>
          </li>
        ))}
      </ul>
      {tasks.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="tap-area text-xs font-bold text-amber-800 hover:underline">
          {showAll ? 'نمایش کمتر' : `نمایش همه (${toPersianDigits(tasks.length)})`}
        </button>
      )}
    </section>
  );
};
