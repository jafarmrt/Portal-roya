import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Check, Coins, Eye, Flag, HandHeart, History, Lock, Plus, RotateCcw, Save, Scale, Tags, Trash2, Undo2 } from 'lucide-react';
import {
  DEFAULT_RECOGNITION_RULES,
  DEFAULT_RECOGNITION_VALUES,
  RECOGNITION_AMOUNTS_MAX,
  RECOGNITION_TONES,
  RECOGNITION_VALUE_DESCRIPTION_HINT,
  RECOGNITION_VALUE_DESCRIPTION_MAX,
  RECOGNITION_VALUE_LABEL_MAX,
  RECOGNITION_VALUES_MAX,
  amountsText,
  rulesProblem,
  sameRules,
  type RecognitionRules,
  type RecognitionTone,
  type RecognitionValue,
} from '../../../shared/recognition';
import { usePortal } from '../../context/PortalContext';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import { EmptyState, SkeletonRows } from '../common/Placeholder';
import { addUnsavedCheck } from '../../lib/unsavedWork';
import { useEffectsLevel } from './effects';
import { FairnessSection } from './Fairness';
import { OwnerTour, type ProgrammeSection } from './tour/OwnerTour';
import { askOwnerTour, loadTutorialProgress, pauseTour, startTour, tourState, useTour } from './tour/tourStore';
import { PageHeader } from '../common/PageHeader';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { MonthNumbers } from './MonthNumbers';
import { ReverseDialog } from './ReverseDialog';
import { ThanksCardFace, toneClass } from './ThanksCardFace';
import { closeReport, loadHistory, loadProgrammeSettings, saveProgrammeSettings, useProgramme, type RecognitionReport } from './ownerStore';
import './thanks.css';

const fa = toPersianDigits;

/** The names a colour goes by in the values editor. */
const TONE_NAMES: Record<RecognitionTone, string> = {
  sage: 'سبز',
  crimson: 'زرشکی',
  sky: 'آبی',
  terracotta: 'آجری',
  gold: 'طلایی',
  plum: 'آلویی',
  teal: 'فیروزه‌ای',
  slate: 'خاکستری',
};

// ---- Reports ----------------------------------------------------------------------------------------

const ReportCard: React.FC<{ report: RecognitionReport; onReverse: () => void }> = ({ report, onReverse }) => {
  const [busy, setBusy] = useState(false);
  const state = report.reversed ? 'برگردانده شد' : report.closed ? 'بررسی شد؛ ماند' : null;
  return (
    <div className="space-y-2">
      <ThanksCardFace
        value={report.value}
        from={report.from}
        to={report.to}
        message={report.message}
        isPrivate={!report.isPublic}
        note={<span>{timeAgo(report.at)}</span>}
      >
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs leading-relaxed text-amber-950 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5" /> {report.to.name} این قدردانی را {timeAgo(report.reportedAt)} گزارش کرد
          </p>
          <p>{report.note ? `«${report.note}»` : 'توضیحی ننوشته است.'}</p>
        </div>
        {state ? (
          <p className="text-xs font-bold text-muted flex items-center gap-1.5">
            {report.reversed ? <Undo2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {state}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void closeReport(report.id).finally(() => setBusy(false));
              }}
              className={secondaryButtonClass}
            >
              <Eye className="w-3.5 h-3.5" /> دیدم، بماند
            </button>
            <button type="button" onClick={onReverse} disabled={busy} className={secondaryButtonClass}>
              <Undo2 className="w-3.5 h-3.5" /> برگرداندن…
            </button>
          </div>
        )}
      </ThanksCardFace>
    </div>
  );
};

const Reports: React.FC = () => {
  const { reports, history, reportsLoaded } = useProgramme();
  const [reversing, setReversing] = useState<RecognitionReport | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  return (
    <section className="space-y-4" aria-label="گزارش‌ها">
      <p className="text-xs leading-relaxed text-muted max-w-3xl">
        <Lock className="w-3.5 h-3.5 inline -mt-0.5" /> پیام قدردانی‌های «فقط ما دو نفر» را هیچ‌کس جز آن دو نفر نمی‌بیند. وقتی گیرنده‌ای پیامی را گزارش کند، فقط همان یک پیام اینجا
        برای شما باز می‌شود. عدد سکه‌ها را شما هم نمی‌بینید و فرستنده از گزارش باخبر نمی‌شود.
      </p>
      {!reportsLoaded ? (
        <SkeletonRows rows={2} tall />
      ) : reports.length === 0 ? (
        <EmptyState icon={<Flag />} title="گزارشی منتظر بررسی نیست" hint="اگر همکاری قدردانی‌ای را گزارش کند، اینجا می‌آید و اعلانش برای شما فرستاده می‌شود." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} onReverse={() => setReversing(r)} />
          ))}
        </div>
      )}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            setShowHistory((v) => !v);
            if (!history) void loadHistory();
          }}
          className="text-xs font-bold text-muted hover:text-ink flex items-center gap-1.5"
          aria-expanded={showHistory}
        >
          <History className="w-3.5 h-3.5" /> گزارش‌های بررسی‌شده
        </button>
        {showHistory &&
          (history === null ? (
            <SkeletonRows rows={1} />
          ) : history.length === 0 ? (
            <p className="mt-3 text-xs text-faint">هنوز گزارشی بررسی نشده است.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {history.map((r) => (
                <ReportCard key={r.id} report={r} onReverse={() => undefined} />
              ))}
            </div>
          ))}
      </div>
      {reversing && <ReverseDialog id={reversing.id} from={reversing.from.name} to={reversing.to.name} onClose={() => setReversing(null)} />}
    </section>
  );
};

// ---- Rules ------------------------------------------------------------------------------------------

const NumberField: React.FC<{ label: string; hint: string; value: number; onChange: (n: number) => void; max: number }> = ({ label, hint, value, onChange, max }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Math.trunc(Number(e.target.value)))}
      className={`${inputClass} tabular-nums`}
      dir="ltr"
    />
    <span className="mt-1 block text-xs text-faint leading-relaxed">{hint}</span>
  </label>
);

const RulesForm: React.FC<{ rules: RecognitionRules; pending: { rules: RecognitionRules; fromLabel: string } | null; atOnce: boolean }> = ({ rules, pending, atOnce }) => {
  const [draft, setDraft] = useState<RecognitionRules>(() => pending?.rules ?? rules);
  const [newAmount, setNewAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = rulesProblem(draft);
  const target = pending?.rules ?? rules;
  const changed = !sameRules(draft, target);
  const set = (patch: Partial<RecognitionRules>) => setDraft((d) => ({ ...d, ...patch }));

  const addAmount = () => {
    const n = Math.trunc(Number(newAmount));
    if (!Number.isFinite(n) || n < 1 || draft.amounts.includes(n)) return;
    set({ amounts: [...draft.amounts, n].sort((a, b) => a - b) });
    setNewAmount('');
  };
  const removeAmount = (n: number) => {
    const amounts = draft.amounts.filter((a) => a !== n);
    set({ amounts, defaultAmount: draft.defaultAmount === n ? (amounts[Math.floor(amounts.length / 2)] ?? 0) : draft.defaultAmount });
  };
  const save = async (next: RecognitionRules) => {
    setBusy(true);
    await saveProgrammeSettings({ rules: next }, atOnce ? 'قواعد ذخیره شد و از همین حالا اعمال می‌شود.' : 'قواعد ذخیره شد و از اول ماه بعد اعمال می‌شود.');
    setBusy(false);
  };

  return (
    <section className="bg-white border border-line rounded-3xl p-5 sm:p-6 space-y-5" aria-labelledby="rules-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rules-title" className="text-base font-black text-ink flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" /> قواعد سکه
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-1 max-w-2xl">
            {atOnce
              ? '«سپاس» هنوز خاموش یا در پیش‌نمایش است، پس هر تغییری از همین حالا اعمال می‌شود. وقتی برای همه روشن شد، تغییرها از اول ماه بعد اعمال می‌شوند.'
              : 'برای اینکه کسی وسط ماه غافلگیر نشود، تغییر قواعد از اول ماه بعد اعمال می‌شود. تا آن روز قواعد فعلی برقرار است.'}
          </p>
        </div>
        {!sameRules(draft, DEFAULT_RECOGNITION_RULES) && (
          <button type="button" onClick={() => setDraft(DEFAULT_RECOGNITION_RULES)} className="text-xs font-bold text-muted hover:text-ink flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> قواعد پیشنهادی
          </button>
        )}
      </div>

      {pending && (
        <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs leading-relaxed text-sky-950 flex flex-wrap items-center gap-2" role="status">
          <span className="flex-1 min-w-48">
            از {pending.fromLabel}: سهمیهٔ {fa(pending.rules.allowance)} سکه، هر قدردانی {amountsText(pending.rules.amounts)} سکه. تا آن روز: سهمیهٔ {fa(rules.allowance)} سکه، هر قدردانی{' '}
            {amountsText(rules.amounts)} سکه.
          </span>
          <button type="button" disabled={busy} onClick={() => void save(rules).then(() => setDraft(rules))} className="font-bold underline underline-offset-2">
            لغو تغییر
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumberField label="سهمیهٔ ماهانهٔ هر همکار" hint="سکه‌هایی که هر کس در یک ماه می‌تواند ببخشد. مانده‌اش آخر ماه می‌سوزد." value={draft.allowance} max={1000} onChange={(allowance) => set({ allowance })} />
        <NumberField label="سقف به یک نفر در ماه" hint="بیشترین سکه‌ای که یک نفر در یک ماه به یک همکار می‌دهد، «من هم» هم حساب است." value={draft.perPersonMax} max={1000} onChange={(perPersonMax) => set({ perPersonMax })} />
        <NumberField label="سقف قدردانی در روز" hint="چند قدردانی با پیام یک نفر در یک روز می‌تواند بنویسد." value={draft.dailyMax} max={50} onChange={(dailyMax) => set({ dailyMax })} />
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>مقدارهای هر قدردانی</legend>
        <p className="text-xs text-faint">فرم قدردانی همین مقدارها را پیشنهاد می‌کند. با زدن «پیش‌فرض» روی یکی، فرم از آن شروع می‌کند.</p>
        <div className="flex flex-wrap items-center gap-2">
          {draft.amounts.map((n) => (
            <span key={n} className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs ${draft.defaultAmount === n ? 'border-amber-400 bg-amber-50' : 'border-line-strong bg-white'}`}>
              <span className="font-display text-base leading-none pt-0.5 tabular-nums">{fa(n)}</span>
              <button
                type="button"
                onClick={() => set({ defaultAmount: n })}
                aria-pressed={draft.defaultAmount === n}
                className={`px-1.5 rounded-md font-bold ${draft.defaultAmount === n ? 'text-amber-800' : 'text-faint hover:text-ink'}`}
              >
                پیش‌فرض
              </button>
              <button type="button" onClick={() => removeAmount(n)} aria-label={`برداشتن ${fa(n)}`} className="p-0.5 text-faint hover:text-red-700">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {draft.amounts.length < RECOGNITION_AMOUNTS_MAX && (
            <span className="inline-flex items-center gap-1">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAmount();
                  }
                }}
                aria-label="مقدار تازه"
                placeholder="مقدار"
                className="w-20 p-1.5 border border-line-strong rounded-xl text-xs tabular-nums"
                dir="ltr"
              />
              <button type="button" onClick={addAmount} className="p-1.5 rounded-xl border border-line-strong hover:bg-surface" aria-label="افزودن مقدار">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
        <p className={`text-xs ${problem ? 'text-red-700 font-bold' : 'text-muted'}`} role={problem ? 'alert' : undefined}>
          {problem ??
            `هر همکار ${fa(draft.allowance)} سکه در ماه دارد؛ هر قدردانی ${amountsText(draft.amounts)} سکه، به یک نفر حداکثر ${fa(draft.perPersonMax)} سکه در ماه و ${fa(draft.dailyMax)} قدردانی در روز.`}
        </p>
        <button type="button" disabled={!changed || problem !== null || busy} onClick={() => void save(draft)} className={primaryButtonClass}>
          <Save className="w-3.5 h-3.5" /> ذخیرهٔ قواعد
        </button>
      </div>
    </section>
  );
};

// ---- Values -----------------------------------------------------------------------------------------

const newId = () => `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A value's short line under its name; about 80 letters reads well, 120 at most. */
const DescriptionField: React.FC<{ index: number; value: string; onChange: (text: string) => void }> = ({ index, value, onChange }) => {
  const long = value.trim().length > RECOGNITION_VALUE_DESCRIPTION_HINT;
  return (
    <label className="block">
      <span className="sr-only">توضیح ارزش {fa(index + 1)}</span>
      <input
        value={value}
        maxLength={RECOGNITION_VALUE_DESCRIPTION_MAX}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} !text-xs`}
        placeholder="یک جملهٔ کوتاه: این ارزش در کار روزانه یعنی چه؟ (اختیاری)"
      />
      {value.trim() !== '' && (
        <span className={`block mt-1 text-[11px] ${long ? 'text-amber-800' : 'text-faint'}`}>
          {fa(value.trim().length)} حرف{long ? `؛ بهتر است کوتاه‌تر از ${fa(RECOGNITION_VALUE_DESCRIPTION_HINT)} حرف باشد.` : ''}
        </span>
      )}
    </label>
  );
};

const ValuesForm: React.FC<{ values: RecognitionValue[] }> = ({ values }) => {
  const [draft, setDraft] = useState<RecognitionValue[]>(values);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(values);
  const labels = draft.map((v) => v.label.trim());
  const problem = draft.length === 0
    ? 'دست‌کم یک ارزش لازم است.'
    : labels.some((l) => !l)
      ? 'نام هر ارزش را بنویسید.'
      : new Set(labels).size !== labels.length
        ? 'دو ارزش نمی‌توانند یک نام داشته باشند.'
        : null;
  const update = (i: number, patch: Partial<RecognitionValue>) => setDraft((d) => d.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const next = [...d];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const unusedTone = RECOGNITION_TONES.find((t) => !draft.some((v) => v.tone === t)) ?? 'slate';
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_RECOGNITION_VALUES);

  return (
    <section className="bg-white border border-line rounded-3xl p-5 sm:p-6 space-y-5" aria-labelledby="values-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="values-title" className="text-base font-black text-ink flex items-center gap-2">
            <Tags className="w-5 h-5 text-brand" /> ارزش‌ها
          </h2>
          <p className="text-xs text-muted leading-relaxed mt-1 max-w-2xl">
            هر قدردانی برای یکی از این ارزش‌هاست و کارتش رنگ و نقش همان ارزش را دارد. توضیح کوتاه هر ارزش را همکاران موقع قدردانی زیر نام آن می‌بینند. تغییر ارزش‌ها همین حالا اعمال می‌شود؛ قدردانی‌های گذشته نام و رنگ زمانِ خودشان را نگه می‌دارند.
            بهتر است ارزش‌ها کم و آشنا باشند (حداکثر {fa(RECOGNITION_VALUES_MAX)}).
          </p>
        </div>
        {!isDefault && (
          <button type="button" onClick={() => setDraft(DEFAULT_RECOGNITION_VALUES)} className="text-xs font-bold text-muted hover:text-ink flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> پنج ارزش نمونه
          </button>
        )}
      </div>

      <ol className="space-y-3">
        {draft.map((v, i) => (
          <li key={v.id} className="p-3 rounded-2xl border border-line bg-surface/60 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className={`sp-value sp-value-sample ${toneClass(v.tone)} self-start sm:self-auto shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold min-w-24 text-center`} aria-hidden="true">
                {v.label.trim() || '…'}
              </span>
              <label className="flex-1 min-w-0">
                <span className="sr-only">نام ارزش {fa(i + 1)}</span>
                <input value={v.label} maxLength={RECOGNITION_VALUE_LABEL_MAX} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} placeholder="مثلاً همکاری" />
              </label>
              <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`رنگ ${v.label || `ارزش ${fa(i + 1)}`}`}>
                {RECOGNITION_TONES.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    role="radio"
                    aria-checked={v.tone === tone}
                    aria-label={TONE_NAMES[tone]}
                    title={TONE_NAMES[tone]}
                    onClick={() => update(i, { tone })}
                    className={`sp-swatch ${toneClass(tone)} w-6 h-6 rounded-full border-2 ${v.tone === tone ? 'border-ink scale-110' : 'border-white'}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30" aria-label="بالاتر">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button type="button" disabled={i === draft.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30" aria-label="پایین‌تر">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-faint hover:text-red-700 hover:bg-white" aria-label={`حذف ${v.label}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <DescriptionField index={i} value={v.description ?? ''} onChange={(description) => update(i, { description })} />
          </li>
        ))}
      </ol>
      {draft.length < RECOGNITION_VALUES_MAX && (
        <button type="button" onClick={() => setDraft((d) => [...d, { id: newId(), label: '', tone: unusedTone, description: '' }])} className={secondaryButtonClass}>
          <Plus className="w-3.5 h-3.5" /> ارزش تازه
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
        <p className={`text-xs ${problem ? 'text-red-700 font-bold' : 'text-muted'}`} role={problem ? 'alert' : undefined}>
          {problem ?? (changed ? 'تغییرها هنوز ذخیره نشده است.' : `${fa(draft.length)} ارزش در فرم قدردانی و فیلترهای دیوار دیده می‌شود.`)}
        </p>
        <button
          type="button"
          disabled={!changed || problem !== null || busy}
          onClick={() => {
            setBusy(true);
            void saveProgrammeSettings({ values: draft.map((v) => ({ ...v, label: v.label.trim(), description: (v.description ?? '').trim() })) }, 'ارزش‌ها ذخیره شد.').finally(() => setBusy(false));
          }}
          className={primaryButtonClass}
        >
          <Save className="w-3.5 h-3.5" /> ذخیرهٔ ارزش‌ها
        </button>
      </div>
    </section>
  );
};

// ---- The page ---------------------------------------------------------------------------------------

type Section = ProgrammeSection;

/**
 * The owner's short tour (tour/OwnerTour.tsx): the first time they open the page, or when asked from the
 * «؟» of «سپاس». Leaving the page pauses it; it counts as unsaved work while it is on screen.
 */
function useOwnerTour() {
  const tour = useTour();
  useEffect(() => {
    void loadTutorialProgress();
    const unsaved = addUnsavedCheck(() => tourState().active !== null);
    return () => {
      unsaved();
      pauseTour();
    };
  }, []);
  useEffect(() => {
    if (!tour.loaded || tour.active) return;
    if (tour.ownerAsked || !tour.progress.owner) {
      askOwnerTour(false);
      startTour('owner', 0);
    }
  }, [tour.loaded, tour.active, tour.ownerAsked, tour.progress.owner]);
}

/**
 * «برنامهٔ سپاس»: the page of whoever looks after «سپاس» (permission `recognition.manage`). The reports
 * colleagues sent, the rules of the coins and the values. It works while «سپاس» is still switched off,
 * so the programme can be set up before anyone sees it.
 */
export const ProgrammePage: React.FC = () => {
  const { reports, reportsLoaded, settings } = useProgramme();
  const { appSettings } = usePortal();
  const [section, setSection] = useState<Section | null>(null);
  const fx = useEffectsLevel();
  useOwnerTour();

  // The reports are kept fresh for the menu's badge already (useOpenReports); the settings are loaded
  // here, and again when somebody else saved them (the portal's settings change with them).
  useEffect(() => {
    void loadProgrammeSettings();
  }, [appSettings]);

  // Opens on the reports when some wait, else on the rules; decided once, so dealing with the last
  // report does not move the page away under the owner's hands.
  const opening = useRef<Section | null>(null);
  if (reportsLoaded && !opening.current) opening.current = reports.length > 0 ? 'reports' : 'numbers';
  const shown: Section = section ?? opening.current ?? 'reports';
  const sections = useMemo(
    () => [
      { id: 'reports' as const, label: 'گزارش‌ها', icon: <Flag className="w-4 h-4" />, badge: reports.length },
      { id: 'numbers' as const, label: 'گزارش ماه', icon: <BarChart3 className="w-4 h-4" />, badge: 0 },
      { id: 'fairness' as const, label: 'انصاف', icon: <Scale className="w-4 h-4" />, badge: 0 },
      { id: 'rules' as const, label: 'قواعد سکه', icon: <Coins className="w-4 h-4" />, badge: 0 },
      { id: 'values' as const, label: 'ارزش‌ها', icon: <Tags className="w-4 h-4" />, badge: 0 },
    ],
    [reports.length],
  );

  return (
    <div className="sp space-y-6" data-fx="none">
      <PageHeader icon={<HandHeart />} title="برنامهٔ سپاس" description="گزارش‌های همکاران، آمار هر ماه، انصاف، قواعد سکه و ارزش‌های قدردانی." />

      <div className="inline-flex flex-wrap p-1 bg-surface rounded-2xl" role="tablist" aria-label="بخش‌های برنامهٔ سپاس">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            data-tour={`prog-${s.id}`}
            aria-selected={shown === s.id}
            onClick={() => setSection(s.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${shown === s.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {s.icon}
            {s.label}
            {s.badge > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-brand text-white text-[11px] leading-5 text-center tabular-nums">{fa(s.badge)}</span>}
          </button>
        ))}
      </div>

      {shown === 'reports' && <Reports />}
      {shown === 'numbers' && <MonthNumbers />}
      {shown === 'fairness' && <FairnessSection />}
      {shown === 'rules' &&
        (settings ? (
          <RulesForm key={JSON.stringify([settings.rules, settings.pending?.rules])} rules={settings.rules} pending={settings.pending} atOnce={settings.rulesApplyAtOnce} />
        ) : (
          <SkeletonRows rows={2} tall />
        ))}
      {shown === 'values' && (settings ? <ValuesForm key={JSON.stringify(settings.values)} values={settings.values} /> : <SkeletonRows rows={2} tall />)}

      <OwnerTour fx={fx} onSection={setSection} />
    </div>
  );
};
