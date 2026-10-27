import React from 'react';
import moment from 'moment-jalaali';
import { CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, FileCheck2, FileText, GraduationCap, LifeBuoy, ListTodo, Vote } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { dayLabel, formatDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import { deadlineState } from '../news/NewsBody';

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

/**
 * What this person still has to do or attend: circulars and mandatory documents to acknowledge,
 * documents of theirs due for review, polls to answer, and their trainings and the organisation's
 * events in the coming seven days. Sits at the top of the dashboard.
 */
export const MyTasksCard: React.FC = () => {
  const { currentUser, news, polls, trainings, calendarEvents, documents, guides, can, setActiveTab } = usePortal();
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
  for (const t of trainings) {
    if (!t.enrolledUserIds.includes(currentUser.id) || !inWeek(t.date)) continue;
    tasks.push({
      key: `training-${t.id}`,
      icon: <GraduationCap className="w-4 h-4 text-[#991b1b]" />,
      kind: 'دورهٔ من',
      title: t.title,
      when: `${dayLabel(t.date)}${t.time ? `، ساعت ${toPersianDigits(t.time)}` : ''}`,
      rank: `2-${t.date}-${t.time}`,
      open: () => setActiveTab('training', t.id),
    });
  }
  for (const e of calendarEvents) {
    if (!WEEK_EVENT_TYPES.has(e.type) || e.trainingId || !inWeek(e.date)) continue;
    tasks.push({
      key: `event-${e.id}`,
      icon: <CalendarDays className="w-4 h-4 text-sky-700" />,
      kind: e.type === 'holiday' ? 'تعطیلی' : e.type === 'meeting' ? 'جلسه' : 'رویداد',
      title: e.title,
      when: `${dayLabel(e.date)}${e.time ? `، ساعت ${toPersianDigits(e.time)}` : ''}`,
      rank: `2-${e.date}-${e.time ?? ''}`,
      open: () => setActiveTab('calendar'),
    });
  }
  tasks.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || a.rank.localeCompare(b.rank));

  if (tasks.length === 0) {
    return (
      <section className="bg-white border border-[#E6E0D5] rounded-2xl px-4 py-3 flex items-center gap-2 text-xs text-[#4B4740]" aria-label="کارهای من">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span><strong>کارهای من:</strong> بخشنامه، سند یا نظرسنجی منتظر و برنامه‌ای برای این هفته ندارید.</span>
      </section>
    );
  }

  return (
    <section className="bg-white border border-amber-300 rounded-3xl p-4 sm:p-5 space-y-3" aria-labelledby="my-tasks-title">
      <div className="flex items-center gap-2">
        <span className="p-1.5 bg-amber-100 text-amber-800 rounded-xl"><ListTodo className="w-4 h-4" /></span>
        <h2 id="my-tasks-title" className="text-sm font-black text-[#2D2D2D]">کارهای من</h2>
        <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900 rounded-full">{toPersianDigits(tasks.length)} مورد</span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {tasks.map((t) => (
          <li key={t.key}>
            <button
              onClick={t.open}
              className={`w-full h-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-colors ${
                t.urgent ? 'bg-red-50 border-red-200 hover:border-red-500' : 'bg-[#F9F7F4] border-[#E6E0D5] hover:border-[#dc2626]'
              }`}
            >
              <span className="shrink-0">{t.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold text-[#6E6A60]">{t.kind}</span>
                <span className="block text-xs font-bold text-[#2D2D2D] truncate">{t.title}</span>
              </span>
              <span className={`text-[11px] whitespace-nowrap ${t.urgent ? 'text-red-700 font-bold' : 'text-[#6E6A60]'}`}>{t.when}</span>
              <ChevronLeft className="w-4 h-4 text-[#A8A295] shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
