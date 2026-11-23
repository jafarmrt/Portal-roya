import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ListOrdered, MessageCircleQuestion, Pencil, Plus, Power, RotateCcw, Save, Sparkles, Sunrise, Trash2, TriangleAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { EmptyState, SkeletonRows } from '../common/Placeholder';
import {
  DAY_QUESTION_OPTION_MAX,
  DAY_QUESTION_OPTIONS_MAX,
  DAY_QUESTION_OPTIONS_MIN,
  DAY_QUESTION_REST_DAYS,
  DAY_QUESTION_TEXT_MAX,
  DAY_QUESTION_THEMES,
  DAY_QUESTIONS_LOW,
  questionProblem,
  themeLabel,
  type DayQuestionRow,
  type DayQuestionTheme,
} from '../../../shared/dayQuestion';
import { DAY_STEP_LABELS, DAY_STEPS, dayStepOrder, type DayStepKind } from '../../../shared/dayStep';

const fa = toPersianDigits;

interface Bank {
  questions: DayQuestionRow[];
  /** Questions left to ask in their turn today. */
  rested: number;
  today: string;
  todayId: string | null;
  /** Sample questions the bank does not have (any more). */
  samplesMissing: number;
}

type Draft = Pick<DayQuestionRow, 'text' | 'options' | 'theme' | 'active' | 'pinnedDate'>;
const NEW_DRAFT: Draft = { text: '', options: ['', ''], theme: 'start', active: true, pinnedDate: '' };

// ---- One question ----------------------------------------------------------------------------------

const QuestionForm: React.FC<{ question: DayQuestionRow | null; onClose: () => void; onSaved: (bank: Bank) => void }> = ({ question, onClose, onSaved }) => {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() =>
    question ? { text: question.text, options: [...question.options], theme: question.theme, active: question.active, pinnedDate: question.pinnedDate } : NEW_DRAFT,
  );
  const [busy, setBusy] = useState(false);
  // The answers of a day point at an option by its place: once asked, the options stay.
  const asked = (question?.timesAsked ?? 0) > 0;
  const problem = questionProblem(draft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setOption = (i: number, value: string) => set('options', draft.options.map((o, j) => (j === i ? value : o)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    try {
      const body = { ...draft, text: draft.text.trim(), options: draft.options.map((o) => o.trim()) };
      const bank = question ? await api.put<Bank>(`/api/moods/questions/${question.id}`, body) : await api.post<Bank>('/api/moods/questions', body);
      toast.success(question ? 'پرسش ذخیره شد.' : 'پرسش به بانک اضافه شد.');
      onSaved(bank);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={question ? 'ویرایش پرسش' : 'پرسش تازه'}
      icon={<MessageCircleQuestion className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={formId} disabled={Boolean(problem) || busy} className={primaryButtonClass}>
            <Save className="w-4 h-4" /> ذخیره
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-text`} className={labelClass}>
            متن پرسش
          </label>
          <input
            id={`${formId}-text`}
            value={draft.text}
            onChange={(e) => set('text', e.target.value)}
            maxLength={DAY_QUESTION_TEXT_MAX}
            placeholder="مثلاً: حجم کارتان این روزها چطور است؟"
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-faint">کوتاه و با «شما». همکار با یک لمس پاسخ می‌دهد.</p>
        </div>

        <fieldset className="space-y-2" disabled={asked}>
          <legend className={labelClass}>گزینه‌ها (۲ تا ۵)</legend>
          {draft.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={option}
                onChange={(e) => setOption(i, e.target.value)}
                maxLength={DAY_QUESTION_OPTION_MAX}
                aria-label={`گزینهٔ ${fa(i + 1)}`}
                placeholder={`گزینهٔ ${fa(i + 1)}`}
                className={inputClass}
              />
              {draft.options.length > DAY_QUESTION_OPTIONS_MIN && !asked && (
                <button type="button" onClick={() => set('options', draft.options.filter((_, j) => j !== i))} aria-label={`حذف گزینهٔ ${fa(i + 1)}`} className="p-2 text-faint hover:text-danger-700 rounded-xl hover:bg-surface shrink-0">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {draft.options.length < DAY_QUESTION_OPTIONS_MAX && !asked && (
            <button type="button" onClick={() => set('options', [...draft.options, ''])} className="text-xs font-bold text-brand-strong hover:underline flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> گزینهٔ دیگر
            </button>
          )}
          {asked && <p className="text-[11px] text-muted leading-relaxed">این پرسش پرسیده شده و پاسخ دارد، پس گزینه‌هایش عوض نمی‌شود. برای گزینه‌های دیگر، آن را خاموش کنید و پرسش تازه‌ای بنویسید.</p>}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${formId}-theme`} className={labelClass}>
              موضوع
            </label>
            <select id={`${formId}-theme`} value={draft.theme} onChange={(e) => set('theme', e.target.value as DayQuestionTheme)} className={inputClass}>
              {DAY_QUESTION_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-date`} className={labelClass}>
              برای یک روز مشخص <span className="font-medium text-faint">(اختیاری)</span>
            </label>
            <JalaliDateInput id={`${formId}-date`} value={draft.pinnedDate} onChange={(value) => set('pinnedDate', value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted leading-relaxed -mt-2">
          پرسشی که روز دارد، همان روز به‌جای پرسش نوبتی می‌آید. پرسش «مناسبتی» فقط در روز خودش پرسیده می‌شود.
        </p>

        <label className="flex items-center gap-2 text-xs font-bold text-ink-soft cursor-pointer">
          <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} className="w-4 h-4 accent-red-700" />
          روشن است و در نوبت پرسیده می‌شود
        </label>

        {problem && draft.text.trim() && (
          <p role="alert" className="text-xs text-danger-700">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
};

const statusOf = (q: DayQuestionRow, bank: Bank): { text: string; tone: string } => {
  if (q.id === bank.todayId) return { text: 'پرسش امروز', tone: 'bg-brand-soft text-brand-strong' };
  if (!q.active) return { text: 'خاموش', tone: 'bg-surface text-muted' };
  if (q.pinnedDate && q.pinnedDate >= bank.today) return { text: `برای ${fa(q.pinnedDate)}`, tone: 'bg-amber-50 text-amber-900' };
  if (q.theme === 'occasion') return { text: 'منتظر انتخاب روز', tone: 'bg-surface text-muted' };
  if (!q.lastAsked) return { text: 'هنوز پرسیده نشده', tone: 'bg-green-50 text-green-800' };
  return { text: `آخرین بار ${fa(q.lastAsked)}${q.timesAsked > 1 ? `، ${fa(q.timesAsked)} بار` : ''}`, tone: 'bg-surface text-ink-soft' };
};

// ---- The bank --------------------------------------------------------------------------------------

const QuestionBank: React.FC = () => {
  const [bank, setBank] = useState<Bank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [theme, setTheme] = useState<DayQuestionTheme | 'all'>('all');
  const [editing, setEditing] = useState<DayQuestionRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Bank>('/api/moods/questions')
      .then(setBank)
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const run = useCallback(async (work: () => Promise<Bank>, done: string) => {
    setBusy(true);
    try {
      setBank(await work());
      toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const shown = useMemo(() => (bank?.questions ?? []).filter((q) => theme === 'all' || q.theme === theme), [bank, theme]);

  if (loadError) return <p role="alert" className="text-xs text-danger-700">{loadError}</p>;
  if (!bank) return <SkeletonRows rows={4} tall />;

  const todayQuestion = bank.questions.find((q) => q.id === bank.todayId);
  const toggle = (q: DayQuestionRow) =>
    run(
      () => api.put<Bank>(`/api/moods/questions/${q.id}`, { text: q.text, options: q.options, theme: q.theme, pinnedDate: q.pinnedDate, active: !q.active }),
      q.active ? 'پرسش خاموش شد.' : 'پرسش روشن شد.',
    );
  const remove = (q: DayQuestionRow) => {
    if (!window.confirm(`پرسش «${q.text}» از بانک حذف شود؟`)) return;
    void run(() => api.delete<Bank>(`/api/moods/questions/${q.id}`), 'پرسش حذف شد.');
  };

  return (
    <section className="space-y-4" aria-label="پرسش‌های روز">
      <div className="bg-white border border-line rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-black text-ink flex items-center gap-2">
              <MessageCircleQuestion className="w-5 h-5 text-brand" /> بانک پرسش
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              هر روز بعد از «حال امروز» یک پرسش از این بانک برای همه می‌آید. شنبه تا چهارشنبه هر روز موضوع خودش را دارد و هر هفته یکی از این روزها نوبتش را به یک
              پرسش «سبک» می‌دهد. هیچ پرسشی زودتر از {fa(DAY_QUESTION_REST_DAYS)} روز تکرار نمی‌شود. پاسخ هیچ همکاری را کسی نمی‌بیند؛ فقط جمع پاسخ‌ها در گزارش‌ها می‌آید.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {bank.samplesMissing > 0 && (
              <button type="button" disabled={busy} onClick={() => void run(() => api.post<Bank>('/api/moods/questions/samples'), 'پرسش‌های نمونه اضافه شد.')} className={secondaryButtonClass}>
                <Sparkles className="w-3.5 h-3.5" /> افزودن پرسش‌های نمونه
              </button>
            )}
            <button type="button" onClick={() => setEditing('new')} className={primaryButtonClass}>
              <Plus className="w-4 h-4" /> پرسش تازه
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-2xl bg-surface p-3">
            <dt className="text-muted">پرسش در بانک</dt>
            <dd className="text-lg font-black text-ink tabular-nums">{fa(bank.questions.length)}</dd>
          </div>
          <div className="rounded-2xl bg-surface p-3">
            <dt className="text-muted">آمادهٔ پرسیدن</dt>
            <dd className="text-lg font-black text-ink tabular-nums" data-testid="questions-rested">{fa(bank.rested)}</dd>
          </div>
          <div className="rounded-2xl bg-surface p-3 col-span-2 sm:col-span-1 min-w-0">
            <dt className="text-muted">پرسش امروز</dt>
            <dd className="text-xs font-bold text-ink leading-relaxed truncate" title={todayQuestion?.text}>{todayQuestion?.text ?? 'هنوز کسی «شروع روز» را باز نکرده است'}</dd>
          </div>
        </dl>

        {bank.rested < DAY_QUESTIONS_LOW && (
          <p role="status" className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs leading-relaxed text-amber-950 flex items-start gap-2" data-testid="questions-low">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              کمتر از {fa(DAY_QUESTIONS_LOW)} پرسشِ آماده مانده است. چند پرسش تازه اضافه کنید یا پرسش‌های خاموش را روشن کنید؛ وگرنه روزهایی بدون پرسش می‌مانند.
            </span>
          </p>
        )}
      </div>

      <div className="inline-flex flex-wrap p-1 bg-surface rounded-2xl" role="group" aria-label="موضوع پرسش‌ها">
        {[{ id: 'all' as const, label: 'همه' }, ...DAY_QUESTION_THEMES].map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={theme === t.id}
            onClick={() => setTheme(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${theme === t.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<MessageCircleQuestion />} title="پرسشی در این موضوع نیست" hint="با «پرسش تازه» یکی اضافه کنید." />
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="question-bank">
          {shown.map((q) => {
            const status = statusOf(q, bank);
            return (
              <li key={q.id} className={`bg-white border border-line rounded-2xl p-4 space-y-2.5 ${q.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-ink leading-relaxed">{q.text}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${status.tone}`}>{status.text}</span>
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">{q.options.join(' · ')}</p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-faint flex items-center gap-1">
                    {q.pinnedDate && <CalendarDays className="w-3 h-3" />}
                    {themeLabel(q.theme)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(q)} aria-label={`ویرایش «${q.text}»`} className="p-2 text-faint hover:text-ink rounded-xl hover:bg-surface">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" disabled={busy} onClick={() => void toggle(q)} aria-label={`${q.active ? 'خاموش' : 'روشن'} کردن «${q.text}»`} aria-pressed={q.active} className={`p-2 rounded-xl hover:bg-surface ${q.active ? 'text-green-700' : 'text-faint hover:text-ink'}`}>
                      <Power className="w-4 h-4" />
                    </button>
                    {q.timesAsked === 0 && (
                      <button type="button" disabled={busy} onClick={() => remove(q)} aria-label={`حذف «${q.text}»`} className="p-2 text-faint hover:text-danger-700 rounded-xl hover:bg-surface">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <QuestionForm question={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={setBank} />}
    </section>
  );
};

// ---- The order of the steps ------------------------------------------------------------------------

/** The quiet step of a hard day is not in the list: on such a day it is the only one. */
const ORDERED: DayStepKind[] = DAY_STEPS.filter((kind) => kind !== 'care');

const StepOrder: React.FC = () => {
  const { appSettings } = usePortal();
  const fromSettings = useMemo(() => dayStepOrder(appSettings?.dayStepOrder).filter((kind) => kind !== 'care'), [appSettings?.dayStepOrder]);
  const [{ saved, draft }, setOrder] = useState<{ saved: DayStepKind[]; draft: DayStepKind[] }>({ saved: fromSettings, draft: fromSettings });
  const [busy, setBusy] = useState(false);
  // The portal's settings arrive a moment after a save, and whenever someone else changes them: the
  // list follows, unless this page has moves of its own that are not saved yet.
  useEffect(() => {
    setOrder((o) => ({ saved: fromSettings, draft: o.draft.join() === o.saved.join() ? fromSettings : o.draft }));
  }, [fromSettings]);
  const setDraft = (next: DayStepKind[]) => setOrder((o) => ({ ...o, draft: next }));
  const changed = draft.join() !== saved.join();
  const isDefault = draft.join() === ORDERED.join();
  const move = (i: number, by: number) => {
    const next = [...draft];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setDraft(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/api/moods/programme', { stepOrder: ['care', ...draft] });
      setOrder({ saved: draft, draft });
      toast.success('ترتیب پیشنهادها ذخیره شد.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-line rounded-3xl p-5 sm:p-6 space-y-4 max-w-2xl" aria-labelledby="step-order-title">
      <div className="space-y-1">
        <h2 id="step-order-title" className="text-base font-black text-ink flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-brand" /> ترتیب «یک قدم برای امروز»
        </h2>
        <p className="text-xs text-muted leading-relaxed">
          بعد از پرسش روز، هر همکار فقط یک پیشنهاد می‌بیند: اولین موردِ این فهرست که شرطش برای او برقرار باشد. در روزی که حال همکار «بد» یا «خیلی بد» است هیچ‌کدام
          از این‌ها نمی‌آید؛ فقط یک خط آرام به صندوق ناشناس.
        </p>
      </div>
      <ol className="space-y-1.5" data-testid="step-order">
        {draft.map((kind, i) => (
          <li key={kind} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2">
            <span className="text-xs font-bold text-ink flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-surface text-[11px] text-muted flex items-center justify-center tabular-nums">{fa(i + 1)}</span>
              {DAY_STEP_LABELS[kind]}
            </span>
            <span className="flex items-center gap-1">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`«${DAY_STEP_LABELS[kind]}» بالاتر`} className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-surface disabled:opacity-30">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button type="button" disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label={`«${DAY_STEP_LABELS[kind]}» پایین‌تر`} className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-surface disabled:opacity-30">
                <ArrowDown className="w-4 h-4" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!changed || busy} onClick={() => void save()} className={primaryButtonClass}>
          <Save className="w-4 h-4" /> ذخیره
        </button>
        <button type="button" disabled={isDefault || busy} onClick={() => setDraft(ORDERED)} className={secondaryButtonClass}>
          <RotateCcw className="w-3.5 h-3.5" /> ترتیب پیش‌فرض
        </button>
      </div>
    </section>
  );
};

// ---- The page --------------------------------------------------------------------------------------

type Section = 'questions' | 'steps';

/**
 * «برنامهٔ شروع روز»: the page of whoever looks after «شروع روز» (permission `mood.manage`): the bank
 * the day's question comes from and the order of «یک قدم برای امروز». It works while «شروع روز» is
 * still in preview, so the questions can be read through before anyone is asked. Nobody's own answer
 * is shown here or anywhere else.
 */
export const DayProgrammePage: React.FC = () => {
  const [section, setSection] = useState<Section>('questions');
  const sections = [
    { id: 'questions' as const, label: 'پرسش‌های روز', icon: <MessageCircleQuestion className="w-4 h-4" /> },
    { id: 'steps' as const, label: 'ترتیب پیشنهادها', icon: <ListOrdered className="w-4 h-4" /> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader icon={<Sunrise />} title="برنامهٔ شروع روز" description="بانک پرسش‌های روز و ترتیب پیشنهادهای «یک قدم برای امروز»." />
      <div className="inline-flex flex-wrap p-1 bg-surface rounded-2xl" role="tablist" aria-label="بخش‌های برنامهٔ شروع روز">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${section === s.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>
      {section === 'questions' ? <QuestionBank /> : <StepOrder />}
    </div>
  );
};
