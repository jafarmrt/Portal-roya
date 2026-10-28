import React, { useId, useState } from 'react';
import { ListPlus, Trash2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { isValidJalaliDate, toPersianDigits } from '../../lib/jalali';
import type { PersonalTodo, TodoInput } from '../../types';
import { TODO_NOTE_MAX, TODO_REMIND_HOUR, TODO_TITLE_MAX, todoSource } from '../../../shared/todos';

interface TodoFormModalProps {
  /** The note being edited; without it a new note is written. */
  todo?: PersonalTodo;
  /** A new note's starting values, e.g. the title and date of the event it is added from. */
  initial?: TodoInput;
  onClose: () => void;
}

/** Writes or edits a note in «یادداشت کارهای من». */
export const TodoFormModal: React.FC<TodoFormModalProps> = ({ todo, initial, onClose }) => {
  const { addTodo, updateTodo, deleteTodo } = usePortal();
  const formId = useId();
  const [title, setTitle] = useState(todo?.title ?? initial?.title ?? '');
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? initial?.dueDate ?? '');
  const [note, setNote] = useState(todo?.note ?? initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const source = todoSource(todo?.sourceType ?? initial?.source?.type);
  const dateInvalid = dueDate !== '' && !isValidJalaliDate(dueDate);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || dateInvalid) return;
    setSaving(true);
    const values = { title: title.trim(), note: note.trim(), dueDate: dueDate || null };
    const ok = todo ? await updateTodo(todo.id, values) : Boolean(await addTodo({ ...values, source: initial?.source }));
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={todo ? 'ویرایش کار' : 'افزودن به یادداشت کارهای من'}
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
            <button type="submit" form={formId} disabled={saving || !title.trim() || dateInvalid} className={primaryButtonClass}>
              {todo ? 'ذخیره' : 'افزودن'}
            </button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-title`} className={labelClass}>چه کاری؟</label>
          <input
            id={`${formId}-title`}
            value={title}
            maxLength={TODO_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
            placeholder="مثلاً فرم مرخصی را پر کنم"
          />
          {source && <p className="mt-1 text-[11px] text-[#6E6A60]">از {source.label}؛ از روی کارت می‌توانید دوباره به آن بروید.</p>}
        </div>
        <div>
          <label htmlFor={`${formId}-due`} className={labelClass}>تاریخ سررسید (اختیاری)</label>
          <JalaliDateInput id={`${formId}-due`} value={dueDate} onChange={setDueDate} />
          <p className="mt-1 text-[11px] text-[#6E6A60]">
            صبح روز سررسید (از ساعت {toPersianDigits(TODO_REMIND_HOUR)}) در اعلان‌های پرتال یادآوری می‌شود.
          </p>
        </div>
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
