import React, { useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { ArrowDown, ArrowUp, CheckCircle2, Lock, Pencil, Plus, Trash2, Vote, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import type { Poll, PollInput, PollQuestionInput, PollQuestionType, PollResultsVisibility } from '../../types';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AudiencePicker } from '../news/AudiencePicker';
import { anonymityNote, QUESTION_TYPES, typeLabel, VISIBILITY } from './pollText';

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 15;

interface Draft extends PollQuestionInput {
  /** Stable React key; new questions have no id yet. */
  key: string;
}

const isChoice = (type: PollQuestionType) => type === 'single' || type === 'multiple';
let nextKey = 0;
const newQuestion = (type: PollQuestionType): Draft => ({
  key: `new-${nextKey++}`,
  type,
  text: '',
  // A written answer is usually a chance to add something, not a must.
  required: type !== 'text',
  options: isChoice(type) ? [{ text: '' }, { text: '' }] : [],
});

const radioCard = (checked: boolean) =>
  `flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-red-600 bg-red-50' : 'border-[#E6E0D5] bg-white hover:border-red-300'}`;

/** One question in the form builder. Questions that already have answers keep their type and options. */
const QuestionEditor: React.FC<{
  draft: Draft;
  index: number;
  count: number;
  locked: boolean;
  onChange: (next: Draft) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}> = ({ draft, index, count, locked, onChange, onMove, onRemove }) => {
  const n = toPersianDigits(index + 1);
  const setOption = (i: number, text: string) => onChange({ ...draft, options: draft.options.map((o, j) => (j === i ? { ...o, text } : o)) });

  return (
    <li className="p-4 rounded-2xl border border-[#E6E0D5] bg-[#F9F7F4] space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-white border border-[#E6E0D5] text-[11px] font-black text-[#991b1b]">سؤال {n}</span>
        {locked ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-[#6E6A60]" title="این سؤال پاسخ گرفته است و نوعش تغییر نمی‌کند">
            <Lock className="w-3.5 h-3.5" /> {typeLabel(draft.type)}
          </span>
        ) : (
          <SearchableSelect
            aria-label={`نوع سؤال ${n}`}
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as PollQuestionType;
              const keep = isChoice(type) && isChoice(draft.type);
              onChange({ ...draft, type, options: keep ? draft.options : isChoice(type) ? [{ text: '' }, { text: '' }] : [] });
            }}
            className="p-1.5 border border-[#D9D4CB] rounded-lg bg-white text-xs font-bold"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </SearchableSelect>
        )}
        <label className="flex items-center gap-1.5 text-xs font-bold text-[#4B4740] cursor-pointer">
          <input type="checkbox" checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} className="accent-red-700" />
          اجباری
        </label>
        <div className="flex items-center gap-0.5 mr-auto">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`بالا بردن سؤال ${n}`} className="p-1.5 rounded-lg text-[#6E6A60] hover:bg-white disabled:opacity-30">
            <ArrowUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`پایین بردن سؤال ${n}`} className="p-1.5 rounded-lg text-[#6E6A60] hover:bg-white disabled:opacity-30">
            <ArrowDown className="w-4 h-4" />
          </button>
          {!locked && count > 1 && (
            <button type="button" onClick={onRemove} aria-label={`حذف سؤال ${n}`} className="p-1.5 rounded-lg text-[#8C867A] hover:text-red-700 hover:bg-white">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <input
        aria-label={`متن سؤال ${n}`}
        value={draft.text}
        maxLength={500}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
        placeholder="متن سؤال را بنویسید"
        className={inputClass}
      />

      {isChoice(draft.type) && (
        <div className="space-y-2">
          {draft.options.map((o, i) => {
            const fixed = locked && Boolean(o.id);
            return (
              <div key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                <span className={`w-4 h-4 shrink-0 border-2 border-[#C9C2B5] ${draft.type === 'single' ? 'rounded-full' : 'rounded'}`} aria-hidden="true" />
                <input
                  aria-label={`گزینهٔ ${toPersianDigits(i + 1)} سؤال ${n}`}
                  value={o.text}
                  maxLength={200}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`گزینهٔ ${toPersianDigits(i + 1)}`}
                  className={`${inputClass} py-1.5`}
                />
                {!fixed && draft.options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => onChange({ ...draft, options: draft.options.filter((_, j) => j !== i) })}
                    aria-label={`حذف گزینهٔ ${toPersianDigits(i + 1)} سؤال ${n}`}
                    className="p-1.5 text-[#8C867A] hover:text-red-700 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="w-7 shrink-0" />
                )}
              </div>
            );
          })}
          {draft.options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => onChange({ ...draft, options: [...draft.options, { text: '' }] })}
              className="flex items-center gap-1 text-xs font-bold text-red-700 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> افزودن گزینه
            </button>
          )}
        </div>
      )}
      {draft.type === 'rating' && (
        <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((v) => (
            <span key={v} className="py-1.5 rounded-lg border border-dashed border-[#D9D4CB] text-center text-xs font-bold text-[#8C867A]">{toPersianDigits(v)}</span>
          ))}
        </div>
      )}
      {draft.type === 'text' && <p className="text-[11px] text-[#8C867A] p-2.5 rounded-lg border border-dashed border-[#D9D4CB]">پاسخ‌دهنده متن می‌نویسد (تا ۲۰۰۰ نویسه).</p>}
    </li>
  );
};

/**
 * Builds a poll from several questions (single or multiple choice, a 1-5 rating, written), and
 * sets who answers, whether answers carry names and who sees the results. Once someone answered,
 * questions and options can be reworded or added but not removed, and an anonymous poll stays so.
 */
export const PollFormModal: React.FC<{ poll?: Poll; onClose: () => void }> = ({ poll, onClose }) => {
  const { addPoll, updatePoll, currentUser } = usePortal();
  const answered = Boolean(poll && poll.responseCount > 0);

  const [title, setTitle] = useState(poll?.title ?? '');
  const [description, setDescription] = useState(poll?.description ?? '');
  const [expiryDate, setExpiryDate] = useState(poll?.expiryDate ?? '');
  const [anonymous, setAnonymous] = useState(poll?.anonymous ?? true);
  const [visibility, setVisibility] = useState<PollResultsVisibility>(poll?.resultsVisibility ?? 'after_answer');
  const [showTextAnswers, setShowTextAnswers] = useState(poll?.showTextAnswers ?? false);
  const [audience, setAudience] = useState({
    departments: poll?.targetDepartments ?? [],
    locations: poll?.targetLocations ?? [],
    roles: poll?.targetRoles ?? [],
    userIds: poll?.targetUserIds ?? [],
  });
  const [questions, setQuestions] = useState<Draft[]>(() =>
    poll
      ? poll.questions.map((q) => ({ key: q.id, id: q.id, type: q.type, text: q.text, required: q.required, options: q.options.map((o) => ({ id: o.id, text: o.text })) }))
      : [newQuestion('single')],
  );
  const [busy, setBusy] = useState(false);

  const hasText = questions.some((q) => q.type === 'text');
  const update = (key: string, next: Draft) => setQuestions((qs) => qs.map((q) => (q.key === key ? next : q)));
  const move = (index: number, step: -1 | 1) =>
    setQuestions((qs) => {
      const next = [...qs];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text.trim(),
      required: q.required,
      // Empty new options are dropped; existing ones must keep some text.
      options: q.options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.id || o.text),
    }));
    const problem = cleaned.findIndex((q) => !q.text || (isChoice(q.type) && (q.options.length < 2 || q.options.some((o) => !o.text))));
    if (!title.trim()) {
      toast.error('عنوان نظرسنجی را بنویسید.');
      return;
    }
    if (problem >= 0) {
      const q = cleaned[problem];
      toast.error(`سؤال ${toPersianDigits(problem + 1)}: ${!q.text ? 'متن سؤال را بنویسید.' : 'دست‌کم دو گزینه بنویسید.'}`);
      return;
    }
    const input: PollInput = {
      title: title.trim(),
      description: description.trim(),
      expiryDate,
      anonymous,
      resultsVisibility: visibility,
      showTextAnswers: hasText && visibility !== 'managers' && showTextAnswers,
      targetDepartments: audience.departments,
      targetLocations: audience.locations,
      targetRoles: audience.roles,
      targetUserIds: audience.userIds,
      questions: cleaned,
    };
    setBusy(true);
    const ok = poll ? await updatePoll(poll.id, input) : await addPoll(input);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={poll ? 'ویرایش نظرسنجی' : 'نظرسنجی جدید'}
      subtitle={answered ? 'پاسخ‌های ثبت‌شده حفظ می‌شوند: سؤال و گزینهٔ تازه اضافه می‌شود، ولی موارد پاسخ‌گرفته حذف نمی‌شوند' : 'سؤال‌های تک‌گزینه‌ای، چندگزینه‌ای، امتیازی و تشریحی در یک فرم'}
      icon={poll ? <Pencil className="w-5 h-5" /> : <Vote className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="poll-form" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" />
            <span>{busy ? 'در حال ذخیره...' : poll ? 'ذخیرهٔ تغییرات' : 'انتشار نظرسنجی'}</span>
          </button>
        </>
      }
    >
      <form id="poll-form" onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="poll-title" className={labelClass}>عنوان <span className="text-red-600">*</span></label>
          <input id="poll-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: نظرسنجی رضایت از سرویس ایاب و ذهاب" className={inputClass} />
        </div>
        <div>
          <label htmlFor="poll-description" className={labelClass}>توضیح برای همکاران</label>
          <textarea id="poll-description" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="هدف نظرسنجی و هر نکته‌ای که پاسخ‌دهنده باید بداند" className={inputClass} />
        </div>

        <section aria-labelledby="poll-questions-title" className="space-y-3">
          <h4 id="poll-questions-title" className="text-xs font-black text-[#2D2D2D]">سؤال‌ها ({toPersianDigits(questions.length)})</h4>
          <ol className="space-y-3">
            {questions.map((q, i) => (
              <QuestionEditor
                key={q.key}
                draft={q}
                index={i}
                count={questions.length}
                locked={answered && Boolean(q.id)}
                onChange={(next) => update(q.key, next)}
                onMove={(step) => move(i, step)}
                onRemove={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
              />
            ))}
          </ol>
          {questions.length < MAX_QUESTIONS && (
            <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-2xl border border-dashed border-[#D9D4CB]">
              <span className="text-[11px] font-bold text-[#6E6A60] ml-1">افزودن سؤال:</span>
              {QUESTION_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setQuestions((qs) => [...qs, newQuestion(t.type)])}
                  title={t.hint}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-[#D9D4CB] text-xs font-bold hover:border-red-400"
                >
                  <Plus className="w-3.5 h-3.5 text-red-700" /> {t.label}
                </button>
              ))}
            </div>
          )}
        </section>

        <div>
          <label htmlFor="poll-expiry" className={labelClass}>مهلت پاسخ‌گویی (اختیاری)</label>
          <JalaliDateInput id="poll-expiry" value={expiryDate} onChange={setExpiryDate} />
          <p className="text-[11px] text-[#6E6A60] mt-1">نظرسنجی آخر این روز بسته می‌شود و یک روز مانده به آن، به کسانی که پاسخ نداده‌اند یادآوری می‌شود.</p>
        </div>

        <fieldset className="space-y-2">
          <legend className={labelClass}>پاسخ‌ها چطور ثبت شوند؟</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[true, false].map((value) => {
              const disabled = answered && poll!.anonymous && !value;
              return (
                <label key={String(value)} className={`${radioCard(anonymous === value)} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="radio" name="poll-anonymous" checked={anonymous === value} disabled={disabled} onChange={() => setAnonymous(value)} className="accent-red-700 mt-0.5" />
                  <span>
                    <span className="block text-xs font-bold">{value ? 'ناشناس' : 'با نام'}</span>
                    <span className="block text-[11px] text-[#6E6A60] leading-relaxed">{anonymityNote(value)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {answered && poll!.anonymous && <p className="text-[11px] text-[#6E6A60]">پاسخ‌ها با وعدهٔ ناشناس بودن ثبت شده‌اند، پس این نظرسنجی ناشناس می‌ماند.</p>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelClass}>نتایج را چه کسانی ببینند؟</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {VISIBILITY.map((v) => (
              <label key={v.value} className={radioCard(visibility === v.value)}>
                <input type="radio" name="poll-visibility" checked={visibility === v.value} onChange={() => setVisibility(v.value)} className="accent-red-700 mt-0.5" />
                <span>
                  <span className="block text-xs font-bold">{v.label}</span>
                  <span className="block text-[11px] text-[#6E6A60] leading-relaxed">{v.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {hasText && visibility !== 'managers' && (
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input type="checkbox" checked={showTextAnswers} onChange={(e) => setShowTextAnswers(e.target.checked)} className="accent-red-700 mt-0.5" />
              <span>
                <span className="block text-xs font-bold">متن پاسخ‌های تشریحی هم به همکاران نشان داده شود</span>
                <span className="block text-[11px] text-[#6E6A60]">اگر انتخاب نشود، متن پاسخ‌ها فقط برای شما و مدیران نظرسنجی است و همکاران فقط تعداد پاسخ‌ها را می‌بینند.</span>
              </span>
            </label>
          )}
        </fieldset>

        <AudiencePicker value={audience} onChange={setAudience} authorId={currentUser?.id ?? ''} noun="نظرسنجی" />
      </form>
    </Modal>
  );
};
