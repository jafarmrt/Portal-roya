import React, { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Clock, Eye, EyeOff, ListChecks, Pencil, Plus, Send, ShieldCheck, Trash2, UserCheck, Users, Vote } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { dayLabel, toPersianDigits } from '../../lib/jalali';
import type { Poll } from '../../types';
import { PollAnswerModal } from './PollAnswerModal';
import { PollFormModal } from './PollFormModal';
import { PollResultsModal } from './PollResultsModal';
import { audienceLabel, hiddenResultsReason, visibilityNote } from './pollText';
import { PageHeader } from '../common/PageHeader';
import { primaryButtonClass } from '../common/Modal';

type Filter = 'all' | 'active' | 'closed';
type Dialog = { kind: 'answer' | 'results' | 'edit'; id: string } | { kind: 'create' } | null;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'active', label: 'باز' },
  { value: 'closed', label: 'بسته‌شده' },
];

const PollCard: React.FC<{ poll: Poll; focused: boolean; open: (kind: 'answer' | 'results' | 'edit') => void }> = ({ poll, focused, open }) => {
  const { can, isGuest, requestLogin, togglePollActiveStatus, deletePoll } = usePortal();
  const waiting = poll.isActive && poll.forMe && !poll.hasVoted;

  return (
    <article
      id={`poll-${poll.id}`}
      aria-labelledby={`poll-title-${poll.id}`}
      className={`bg-white rounded-2xl border p-5 sm:p-6 flex flex-col gap-4 shadow-xs ${waiting ? 'border-red-200' : 'border-line'} ${poll.isActive ? '' : 'bg-page'} ${focused ? 'ring-2 ring-red-600' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${poll.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-strong text-muted'}`}>
          {poll.isActive ? 'باز' : 'بسته‌شده'}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Users className="w-3.5 h-3.5" /> {audienceLabel(poll)}
        </span>
      </div>

      <div className="space-y-1.5">
        <h3 id={`poll-title-${poll.id}`} className="text-base font-bold text-ink leading-snug">{poll.title}</h3>
        {poll.description && <p className="text-xs text-ink-soft leading-relaxed line-clamp-3 whitespace-pre-line">{poll.description}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${poll.anonymous ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          {poll.anonymous ? <ShieldCheck className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          {poll.anonymous ? 'ناشناس' : 'با نام'}
        </span>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface text-ink-soft font-bold">
          {poll.resultsVisibility === 'managers' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {visibilityNote[poll.resultsVisibility]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted pt-3 border-t border-surface-strong">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {poll.expiryDate ? `مهلت: ${dayLabel(poll.expiryDate)}` : 'بدون مهلت'}
        </span>
        <span className="flex items-center gap-1">
          <ListChecks className="w-3.5 h-3.5" /> {toPersianDigits(poll.questions.length)} سؤال
        </span>
        <span className="flex items-center gap-1">
          <Vote className="w-3.5 h-3.5" />
          {poll.audienceCount !== undefined
            ? `${toPersianDigits(poll.responseCount)} از ${toPersianDigits(poll.audienceCount)} نفر پاسخ داده‌اند`
            : `${toPersianDigits(poll.responseCount)} پاسخ`}
        </span>
        <span>طراح: {poll.createdBy}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-auto">
        {waiting && (
          <button onClick={() => open('answer')} className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" /> پاسخ دادن
          </button>
        )}
        {poll.hasVoted && (
          <>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="w-4 h-4" /> پاسخ شما ثبت شده است
            </span>
            <button onClick={() => open('answer')} className="text-xs font-bold text-red-700 hover:underline">دیدن پاسخ من</button>
          </>
        )}
        {isGuest && poll.isActive && (
          <button onClick={() => requestLogin('برای شرکت در نظرسنجی وارد پرتال شوید.')} className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl">
            ورود و شرکت در نظرسنجی
          </button>
        )}
        {poll.resultsVisible ? (
          <button onClick={() => open('results')} className="px-4 py-2 text-xs font-bold text-ink bg-surface hover:bg-line rounded-xl flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-red-700" /> نتایج
          </button>
        ) : (
          <span className="text-xs text-faint basis-full">{hiddenResultsReason(poll)}</span>
        )}

        {poll.canManage && (
          <div className="flex items-center gap-1 mr-auto">
            <button
              onClick={() => togglePollActiveStatus(poll.id)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg text-ink-soft bg-surface hover:bg-line"
            >
              {poll.isActive ? 'بستن نظرسنجی' : 'باز کردن دوباره'}
            </button>
            <button onClick={() => open('edit')} className="p-1.5 text-muted hover:text-red-700 hover:bg-surface rounded-lg" aria-label={`ویرایش ${poll.title}`} title="ویرایش">
              <Pencil className="w-4 h-4" />
            </button>
            {can('polls.manage') && (
              <button
                onClick={() => {
                  if (confirm(`نظرسنجی «${poll.title}» و همهٔ پاسخ‌هایش حذف شود؟`)) deletePoll(poll.id);
                }}
                className="p-1.5 text-faint hover:text-red-700 hover:bg-red-50 rounded-lg"
                aria-label={`حذف ${poll.title}`}
                title="حذف"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export const PollsModule: React.FC = () => {
  const { polls, can, focusId } = usePortal();
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<Dialog>(null);

  // A poll linked from a notification or "my tasks" (#polls/<id>): scroll to it, and open the form
  // when it is waiting for this person's answer.
  const loaded = polls.length > 0;
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`poll-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const poll = polls.find((p) => p.id === focusId);
    if (poll && poll.isActive && poll.forMe && !poll.hasVoted) setDialog({ kind: 'answer', id: poll.id });
    // Only when the link changes, not on every refresh of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loaded]);

  const shown = polls.filter((p) => (filter === 'active' ? p.isActive : filter === 'closed' ? !p.isActive : true));
  const waiting = polls.filter((p) => p.isActive && p.forMe && !p.hasVoted).length;
  const current = dialog && dialog.kind !== 'create' ? polls.find((p) => p.id === dialog.id) : undefined;
  const close = () => setDialog(null);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Vote />}
        title="نظرسنجی‌ها"
        descriptionOnPhone={waiting > 0}
        description={waiting > 0
          ? <strong className="text-brand-strong">{toPersianDigits(waiting)} نظرسنجی منتظر پاسخ شماست.</strong>
          : 'روی هر نظرسنجی نوشته شده که پاسخ‌ها ناشناس است یا با نام، و نتایج را چه کسانی می‌بینند.'}
      >
        {can('polls.manage') && (
          <button onClick={() => setDialog({ kind: 'create' })} className={primaryButtonClass}>
            <Plus className="w-4 h-4" /> نظرسنجی جدید
          </button>
        )}
      </PageHeader>

      <div className="flex items-center gap-1.5 bg-white p-2 rounded-2xl border border-line w-fit" role="group" aria-label="نمایش نظرسنجی‌ها">
        {FILTERS.map((f) => {
          const count = polls.filter((p) => (f.value === 'active' ? p.isActive : f.value === 'closed' ? !p.isActive : true)).length;
          return (
            <button
              key={f.value}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${filter === f.value ? 'bg-brand-strong text-white' : 'text-muted hover:bg-surface'}`}
            >
              {f.label} ({toPersianDigits(count)})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {shown.length === 0 ? (
          <div className="lg:col-span-2 py-12 text-center bg-white rounded-2xl border border-dashed border-line-strong">
            <Vote className="w-10 h-10 text-line-strong mx-auto mb-2" />
            <p className="text-sm font-bold text-muted">نظرسنجی‌ای در این بخش نیست.</p>
          </div>
        ) : (
          shown.map((poll) => (
            <PollCard key={poll.id} poll={poll} focused={focusId === poll.id} open={(kind) => setDialog({ kind, id: poll.id })} />
          ))
        )}
      </div>

      {dialog?.kind === 'create' && <PollFormModal onClose={close} />}
      {dialog?.kind === 'edit' && current && <PollFormModal key={current.id} poll={current} onClose={close} />}
      {dialog?.kind === 'answer' && current && <PollAnswerModal key={current.id} poll={current} onClose={close} />}
      {dialog?.kind === 'results' && current && <PollResultsModal poll={current} onClose={close} />}
    </div>
  );
};
