import React, { useEffect, useState } from 'react';
import { CheckCircle2, History, Send, ShieldCheck, UserCheck } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { clearPollDraft, readPollDraft, writePollDraft } from '../../lib/pollDraft';
import type { Poll, PollAnswer, PollQuestion } from '../../types';
import { inputClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

const RATING_LABELS = ['خیلی کم', 'کم', 'متوسط', 'زیاد', 'خیلی زیاد'];

const emptyAnswer = (): PollAnswer => ({ optionIds: [], rating: null, text: '' });

const isAnswered = (q: PollQuestion, a: PollAnswer) =>
  q.type === 'rating' ? a.rating !== null : q.type === 'text' ? a.text.trim() !== '' : a.optionIds.length > 0;

const choiceClass = (checked: boolean, disabled: boolean) =>
  `flex items-center gap-3 p-3 rounded-xl border text-xs transition-colors ${
    checked ? 'border-red-600 bg-red-50 font-bold text-ink' : 'border-line bg-white text-ink'
  } ${disabled ? 'cursor-default' : 'cursor-pointer hover:border-red-300'}`;

/** One question of the form; `disabled` shows an answer already sent. */
const QuestionField: React.FC<{
  question: PollQuestion;
  index: number;
  answer: PollAnswer;
  onChange: (next: PollAnswer) => void;
  disabled: boolean;
  missing: boolean;
}> = ({ question: q, index, answer, onChange, disabled, missing }) => {
  const name = `q-${q.id}`;
  return (
    <fieldset
      className={`p-4 rounded-2xl border space-y-3 ${missing ? 'border-red-400 bg-red-50/40' : 'border-line bg-surface-soft'}`}
      aria-describedby={missing ? `${name}-missing` : undefined}
    >
      <legend className="sr-only">{q.text}</legend>
      <p className="text-sm font-bold text-ink leading-relaxed" aria-hidden="true">
        {toPersianDigits(index + 1)}. {q.text}
        {q.required ? <span className="text-red-600"> *</span> : <span className="text-xs font-normal text-faint"> (اختیاری)</span>}
      </p>
      {q.type === 'multiple' && <p className="text-xs text-muted">چند گزینه را می‌توانید با هم انتخاب کنید.</p>}

      {(q.type === 'single' || q.type === 'multiple') && (
        <div className="space-y-2">
          {q.options.map((o) => {
            const checked = answer.optionIds.includes(o.id);
            return (
              <label key={o.id} className={choiceClass(checked, disabled)}>
                <input
                  type={q.type === 'single' ? 'radio' : 'checkbox'}
                  name={name}
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    onChange({
                      ...answer,
                      optionIds: q.type === 'single' ? [o.id] : checked ? answer.optionIds.filter((id) => id !== o.id) : [...answer.optionIds, o.id],
                    })
                  }
                  className="accent-red-700 w-4 h-4 shrink-0"
                />
                <span>{o.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'rating' && (
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={q.text}>
          {RATING_LABELS.map((label, i) => {
            const value = i + 1;
            const checked = answer.rating === value;
            return (
              <label
                key={value}
                className={`relative flex flex-col items-center gap-0.5 py-2 rounded-xl border text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-400 ${checked ? 'border-red-600 bg-red-700 text-white' : 'border-line bg-white text-ink'} ${disabled ? '' : 'cursor-pointer hover:border-red-300'}`}
              >
                <input type="radio" name={name} checked={checked} disabled={disabled} onChange={() => onChange({ ...answer, rating: value })} className="sr-only" />
                <span className="text-base font-black">{toPersianDigits(value)}</span>
                <span className={`text-xs ${checked ? 'text-white' : 'text-muted'}`}>{label}</span>
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'text' && (
        <textarea
          rows={3}
          maxLength={2000}
          value={answer.text}
          disabled={disabled}
          onChange={(e) => onChange({ ...answer, text: e.target.value })}
          aria-label={q.text}
          placeholder={disabled ? 'پاسخی ننوشته‌اید.' : 'پاسخ خود را بنویسید...'}
          className={inputClass}
        />
      )}
      {missing && (
        <p id={`${name}-missing`} className="text-xs font-bold text-red-700">
          پاسخ به این سؤال لازم است.
        </p>
      )}
    </fieldset>
  );
};

/** Fills in a poll, or (once answered) shows the answers that were sent. */
export const PollAnswerModal: React.FC<{ poll: Poll; onClose: () => void }> = ({ poll, onClose }) => {
  const { votePoll, currentUser } = usePortal();
  const sent = poll.hasVoted;
  const userId = currentUser?.id ?? null;
  // Answers that were given before but never sent (the form was closed or the page reloaded) come back.
  const [restored, setRestored] = useState(() => (sent || !userId ? null : readPollDraft(userId, poll)));
  const [answers, setAnswers] = useState<Record<string, PollAnswer>>(() =>
    Object.fromEntries(poll.questions.map((q) => [q.id, poll.myAnswers?.[q.id] ?? restored?.[q.id] ?? emptyAnswer()])),
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // A question added to the poll while the form is open has no answer yet.
  const answerOf = (id: string) => answers[id] ?? emptyAnswer();

  useEffect(() => {
    if (!sent && userId) writePollDraft(userId, poll.id, answers);
  }, [answers, sent, userId, poll.id]);

  const startOver = () => {
    setAnswers(Object.fromEntries(poll.questions.map((q) => [q.id, emptyAnswer()])));
    setMissing([]);
    setRestored(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const empty = poll.questions.filter((q) => q.required && !isAnswered(q, answerOf(q.id))).map((q) => q.id);
    setMissing(empty);
    if (empty.length > 0) {
      document.querySelector(`[name="q-${empty[0]}"]`)?.closest('fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    const ok = await votePoll(
      poll.id,
      poll.questions
        .filter((q) => isAnswered(q, answerOf(q.id)))
        .map((q) => ({ questionId: q.id, optionIds: answerOf(q.id).optionIds, rating: answerOf(q.id).rating, text: answerOf(q.id).text.trim() })),
    );
    setBusy(false);
    if (ok) {
      if (userId) clearPollDraft(userId, poll.id);
      onClose();
    }
  };

  return (
    <Modal
      title={poll.title}
      subtitle={sent ? 'پاسخ‌هایی که فرستاده‌اید' : `${toPersianDigits(poll.questions.length)} سؤال`}
      icon={sent ? <CheckCircle2 className="w-5 h-5" /> : poll.anonymous ? <ShieldCheck className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        sent ? (
          <button type="button" onClick={onClose} className={secondaryButtonClass}>بستن</button>
        ) : (
          <>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
            <button type="submit" form="poll-answer" disabled={busy} className={primaryButtonClass}>
              <Send className="w-4 h-4" />
              <span>{busy ? 'در حال ثبت...' : 'ثبت پاسخ'}</span>
            </button>
          </>
        )
      }
    >
      <form id="poll-answer" onSubmit={submit} className="space-y-4" noValidate>
        {poll.description && <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-line">{poll.description}</p>}
        <p className={`flex items-start gap-2 p-3 rounded-xl text-xs leading-relaxed ${poll.anonymous ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
          {poll.anonymous ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <UserCheck className="w-4 h-4 shrink-0" />}
          <span>
            {poll.anonymous
              ? 'این نظرسنجی ناشناس است: پاسخ شما بدون نام ثبت می‌شود و هیچ‌کس، حتی طراح نظرسنجی، نمی‌بیند چه کسی چه پاسخی داده است.'
              : `این نظرسنجی با نام است: ${poll.createdBy} و مدیران نظرسنجی می‌بینند شما چه پاسخی داده‌اید.`}
            {!sent && ' پاسخ ثبت‌شده را بعداً نمی‌توان تغییر داد.'}
          </span>
        </p>
        {restored && !sent && (
          <p className="flex flex-wrap items-center gap-2 p-3 rounded-xl text-xs leading-relaxed bg-sky-50 text-sky-900 border border-sky-200" role="status">
            <History className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-40">پاسخ‌هایی که قبلاً داده بودید و ثبت نشده بود، برگردانده شد. تا «ثبت پاسخ» را نزنید فرستاده نمی‌شود.</span>
            <button type="button" onClick={startOver} className="font-bold underline underline-offset-2 hover:text-sky-700">
              از اول شروع می‌کنم
            </button>
          </p>
        )}
        {poll.questions.map((q, i) => (
          <QuestionField
            key={q.id}
            question={q}
            index={i}
            answer={answerOf(q.id)}
            disabled={sent}
            missing={missing.includes(q.id)}
            onChange={(next) => {
              setAnswers((prev) => ({ ...prev, [q.id]: next }));
              if (missing.includes(q.id)) setMissing((m) => m.filter((id) => id !== q.id));
            }}
          />
        ))}
        {missing.length > 0 && (
          <p role="alert" className="text-xs font-bold text-danger-700">
            {toPersianDigits(missing.length)} سؤال اجباری بی‌پاسخ مانده است.
          </p>
        )}
      </form>
    </Modal>
  );
};
