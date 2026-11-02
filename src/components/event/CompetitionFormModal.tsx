import React, { useId, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { api, useEventAction } from './eventUi';
import {
  COMPETITION_TITLE_MAX,
  ENTRIES_MAX,
  ENTRY_KINDS,
  EVENT_TEXT_MAX,
  PLACE_MAX,
  SCORINGS,
  STAGE_POLICIES,
  TIE_RULES,
  type EntryKind,
  type Scoring,
  type StagePolicy,
  type TieRule,
} from '../../../shared/specialEvents';
import type { EventCompetition } from './types';

const ICONS = ['🎮', '🎭', '🏓', '♟️', '🎯', '🎲', '🧠', '🎤', '⚽', '🏆'];

/** A chip row for picking one option. */
function Choice<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className={labelClass}>{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={`px-3 py-2 rounded-xl text-xs font-bold border disabled:opacity-60 ${value === o.id ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong text-ink hover:bg-surface'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Builds a competition (or changes one) from a form: no new code for a new game. */
export const CompetitionFormModal: React.FC<{ eventId: string; competition?: EventCompetition; onClose: () => void }> = ({ eventId, competition, onClose }) => {
  const run = useEventAction();
  const formId = useId();
  const drawn = Boolean(competition?.drawnAt);
  const [title, setTitle] = useState(competition?.title ?? '');
  const [icon, setIcon] = useState(competition?.icon ?? ICONS[0]);
  const [rules, setRules] = useState(competition?.rules ?? '');
  const [kind, setKind] = useState<EntryKind>(competition?.kind ?? 'individual');
  const [teamMin, setTeamMin] = useState(competition?.teamMin && competition.kind === 'team' ? competition.teamMin : 4);
  const [teamMax, setTeamMax] = useState(competition?.teamMax && competition.kind === 'team' ? competition.teamMax : 4);
  const [capacity, setCapacity] = useState(competition?.capacity ?? 8);
  const [scoring, setScoring] = useState<Scoring>(competition?.scoring ?? 'goals');
  const [tieRule, setTieRule] = useState<TieRule>(competition?.tieRule ?? 'penalties');
  const [thirdPlace, setThirdPlace] = useState(competition?.thirdPlace ?? false);
  const [stagePolicy, setStagePolicy] = useState<StagePolicy>(competition?.stagePolicy ?? 'final');
  const [dayPlace, setDayPlace] = useState(competition?.dayPlace ?? '');
  const [dayStart, setDayStart] = useState(competition?.dayStart ?? '10:00');
  const [slotMinutes, setSlotMinutes] = useState(competition?.slotMinutes ?? 20);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      icon,
      rules: rules.trim(),
      kind,
      teamMin: kind === 'team' ? teamMin : 1,
      teamMax: kind === 'team' ? Math.max(teamMin, teamMax) : 1,
      capacity,
      scoring,
      tieRule,
      thirdPlace,
      stagePolicy,
      dayPlace: dayPlace.trim(),
      dayStart,
      slotMinutes,
    };
    const ok = competition
      ? await run(() => api.put(`/api/event_competitions/${competition.id}`, body), 'مسابقه به‌روز شد.')
      : await run(() => api.post(`/api/special_events/${eventId}/competitions`, body), 'مسابقه ساخته شد.');
    setSaving(false);
    if (ok) onClose();
  };

  const number = (_value: number, set: (n: number) => void, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(Math.min(max, Math.max(min, Number(e.target.value) || min)));

  return (
    <Modal
      title={competition ? `ویرایش «${competition.title}»` : 'مسابقهٔ تازه'}
      subtitle="جدول حذفی؛ شکل‌های «جدول امتیازی» و «رتبه‌بندی» در نسخهٔ بعد می‌آیند."
      icon={<Trophy className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={formId} disabled={!title.trim() || saving} className={primaryButtonClass}>
            ذخیره
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor={`${formId}-title`} className={labelClass}>
              نام مسابقه
            </label>
            <input id={`${formId}-title`} value={title} maxLength={COMPETITION_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً فیفا ۲۶" className={inputClass} />
          </div>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>نشان</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                aria-pressed={icon === i}
                className={`w-10 h-10 rounded-xl text-xl border-2 ${icon === i ? 'border-red-600 bg-red-50' : 'border-line bg-white'}`}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>
        <Choice label="شرکت‌کننده" value={kind} options={ENTRY_KINDS} onChange={setKind} disabled={drawn} />
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor={`${formId}-cap`} className={labelClass}>
              ظرفیت ({kind === 'team' ? 'تیم' : 'نفر'})
            </label>
            <input id={`${formId}-cap`} type="number" inputMode="numeric" min={2} max={ENTRIES_MAX} value={capacity} disabled={drawn} onChange={number(capacity, setCapacity, 2, ENTRIES_MAX)} className={inputClass} />
          </div>
          {kind === 'team' && (
            <>
              <div>
                <label htmlFor={`${formId}-min`} className={labelClass}>
                  حداقل نفر
                </label>
                <input id={`${formId}-min`} type="number" inputMode="numeric" min={2} max={20} value={teamMin} disabled={drawn} onChange={number(teamMin, setTeamMin, 2, 20)} className={inputClass} />
              </div>
              <div>
                <label htmlFor={`${formId}-max`} className={labelClass}>
                  حداکثر نفر
                </label>
                <input id={`${formId}-max`} type="number" inputMode="numeric" min={teamMin} max={20} value={teamMax} disabled={drawn} onChange={number(teamMax, setTeamMax, 2, 20)} className={inputClass} />
              </div>
            </>
          )}
        </div>
        <Choice label="نتیجه" value={scoring} options={SCORINGS} onChange={setScoring} />
        {scoring !== 'winner' && <Choice label="در صورت تساوی" value={tieRule} options={TIE_RULES} onChange={setTieRule} />}
        <Choice label="کجا بازی می‌شود" value={stagePolicy} options={STAGE_POLICIES} onChange={setStagePolicy} />
        <label className="flex items-center gap-2 text-xs font-bold text-ink-soft self-end">
          <input type="checkbox" checked={thirdPlace} disabled={drawn} onChange={(e) => setThirdPlace(e.target.checked)} className="w-4 h-4 accent-red-700" />
          بازی ردهٔ سوم هم باشد
        </label>
        {stagePolicy !== 'all' && (
          <div className="sm:col-span-2 grid grid-cols-3 gap-2">
            <div>
              <label htmlFor={`${formId}-place`} className={labelClass}>
                محل بازی‌های روزانه
              </label>
              <input id={`${formId}-place`} value={dayPlace} maxLength={PLACE_MAX} onChange={(e) => setDayPlace(e.target.value)} placeholder="اتاق VIP" className={inputClass} />
            </div>
            <div>
              <label htmlFor={`${formId}-start`} className={labelClass}>
                شروع
              </label>
              <input id={`${formId}-start`} type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={inputClass} dir="ltr" />
            </div>
            <div>
              <label htmlFor={`${formId}-slot`} className={labelClass}>
                هر بازی (دقیقه)
              </label>
              <input id={`${formId}-slot`} type="number" inputMode="numeric" min={5} max={180} value={slotMinutes} onChange={number(slotMinutes, setSlotMinutes, 5, 180)} className={inputClass} />
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${formId}-rules`} className={labelClass}>
            قوانین و توضیح
          </label>
          <textarea id={`${formId}-rules`} value={rules} maxLength={EVENT_TEXT_MAX} rows={3} onChange={(e) => setRules(e.target.value)} placeholder="مثلاً هر بازی ۲ نیمهٔ ۴ دقیقه‌ای" className={inputClass} />
        </div>
        {drawn && (
          <p className="sm:col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            قرعه کشیده شده؛ نوع، ظرفیت، اندازهٔ تیم و ردهٔ سوم قفل است. برای عوض کردنشان اول قرعه را پاک کنید.
          </p>
        )}
      </form>
    </Modal>
  );
};
