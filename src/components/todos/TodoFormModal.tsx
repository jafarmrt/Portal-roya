import React, { useId, useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { ListPlus, Plus, Star, Trash2, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { DueDateField } from './DueDateField';
import { isValidJalaliDate, toPersianDigits } from '../../lib/jalali';
import type { PersonalTodo, TodoInput } from '../../types';
import {
  TODO_NOTE_MAX,
  TODO_REMIND_HOUR,
  TODO_REMINDERS,
  TODO_REPEATS,
  TODO_STEP_MAX,
  TODO_STEPS_MAX,
  TODO_TITLE_MAX,
  todoSource,
  type TodoRemind,
  type TodoRepeat,
} from '../../../shared/todos';

interface TodoFormModalProps {
  /** The note being edited; without it a new note is written. */
  todo?: PersonalTodo;
  /** A new note's starting values, e.g. the title and date of the event it is added from. */
  initial?: Partial<TodoInput>;
  onClose: () => void;
}

/** Writes or edits a note in «یادداشت‌های من». */
export const TodoFormModal: React.FC<TodoFormModalProps> = ({ todo, initial, onClose }) => {
  const { addTodo, updateTodo, deleteTodo } = usePortal();
  const formId = useId();
  const [title, setTitle] = useState(todo?.title ?? initial?.title ?? '');
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? initial?.dueDate ?? '');
  const [note, setNote] = useState(todo?.note ?? initial?.note ?? '');
  const [important, setImportant] = useState(todo?.important ?? initial?.important ?? false);
  const [repeat, setRepeat] = useState<TodoRepeat | ''>(todo?.repeat ?? initial?.repeat ?? '');
  const [remind, setRemind] = useState<TodoRemind>(todo?.remind ?? initial?.remind ?? 'day');
  const [steps, setSteps] = useState(() => (todo?.steps ?? initial?.steps ?? []).map((s) => ({ text: s.text, done: s.done })));
  const [newStep, setNewStep] = useState('');
  const [saving, setSaving] = useState(false);
  const source = todoSource(todo?.sourceType ?? initial?.source?.type);
  const dateMissing = !isValidJalaliDate(dueDate);

  const addStep = () => {
    if (!newStep.trim() || steps.length >= TODO_STEPS_MAX) return;
    setSteps([...steps, { text: newStep.trim(), done: false }]);
    setNewStep('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || dateMissing) return;
    setSaving(true);
    const values = {
      title: title.trim(),
      note: note.trim(),
      dueDate,
      important,
      repeat: repeat || null,
      remind,
      steps: steps.filter((s) => s.text.trim()),
    };
    const ok = todo ? await updateTodo(todo.id, values) : Boolean(await addTodo({ ...values, source: initial?.source }));
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={todo ? 'ویرایش یادداشت' : 'افزودن به یادداشت‌های من'}
      subtitle="فقط خودتان این یادداشت را می‌بینید."
      icon={<ListPlus className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          {todo ? (
            <button
              type="button"
              onClick={async () => {
                if (await deleteTodo(todo.id)) onClose();
              }}
              className={`${secondaryButtonClass} text-red-700`}
            >
              <Trash2 className="w-4 h-4" /> حذف
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
            <button type="submit" form={formId} disabled={saving || !title.trim() || dateMissing} className={primaryButtonClass}>
              {todo ? 'ذخیره' : 'افزودن'}
            </button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${formId}-title`} className={labelClass}>چه کاری؟</label>
            <button
              type="button"
              aria-pressed={important}
              onClick={() => setImportant(!important)}
              className={`mb-1 px-2 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1 ${
                important ? 'bg-amber-100 border-amber-400 text-amber-900' : 'border-line text-muted hover:border-amber-400'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${important ? 'fill-amber-500 text-amber-500' : ''}`} /> مهم
            </button>
          </div>
          <input
            id={`${formId}-title`}
            value={title}
            maxLength={TODO_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
            placeholder="مثلاً فرم مرخصی را پر کنم"
          />
          {source && <p className="mt-1 text-xs text-muted">از {source.label}؛ از روی کارت می‌توانید دوباره به آن بروید.</p>}
        </div>
        <div>
          <label htmlFor={`${formId}-due`} className={labelClass}>تاریخ سررسید</label>
          <DueDateField id={`${formId}-due`} value={dueDate} onChange={setDueDate} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-remind`} className={labelClass}>یادآوری (از ساعت {toPersianDigits(TODO_REMIND_HOUR)} صبح)</label>
            <SearchableSelect id={`${formId}-remind`} value={remind} onChange={(e) => setRemind(e.target.value as TodoRemind)} className={inputClass}>
              {TODO_REMINDERS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </SearchableSelect>
          </div>
          <div>
            <label htmlFor={`${formId}-repeat`} className={labelClass}>تکرار</label>
            <SearchableSelect id={`${formId}-repeat`} value={repeat} onChange={(e) => setRepeat(e.target.value as TodoRepeat | '')} className={inputClass}>
              <option value="">تکرار نمی‌شود</option>
              {TODO_REPEATS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </SearchableSelect>
          </div>
        </div>
        {repeat && <p className="-mt-2 text-xs text-muted">با تیک زدن این کار، نوبت بعدی‌اش خودش در فهرست نوشته می‌شود.</p>}
        <fieldset>
          <legend className={labelClass}>گام‌ها (اختیاری، تا {toPersianDigits(TODO_STEPS_MAX)} مورد)</legend>
          {steps.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {steps.map((step, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, done: e.target.checked } : s)))}
                    aria-label={`انجام شد: ${step.text}`}
                    className="w-4 h-4 accent-sky-700"
                  />
                  <input
                    value={step.text}
                    maxLength={TODO_STEP_MAX}
                    onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)))}
                    aria-label={`گام ${toPersianDigits(i + 1)}`}
                    className={`${inputClass} !py-1.5 ${step.done ? 'line-through text-faint' : ''}`}
                  />
                  <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={`حذف گام ${step.text}`} className="p-1.5 rounded-lg text-faint hover:text-red-700 hover:bg-red-50">
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {steps.length < TODO_STEPS_MAX && (
            <div className="flex gap-2">
              <input
                value={newStep}
                maxLength={TODO_STEP_MAX}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addStep();
                  }
                }}
                aria-label="گام تازه"
                placeholder="گام تازه…"
                className={`${inputClass} !py-1.5`}
              />
              <button type="button" onClick={addStep} disabled={!newStep.trim()} className={secondaryButtonClass} aria-label="افزودن گام">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </fieldset>
        <div>
          <label htmlFor={`${formId}-note`} className={labelClass}>توضیح (اختیاری)</label>
          <textarea
            id={`${formId}-note`}
            value={note}
            maxLength={TODO_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
      </form>
    </Modal>
  );
};
