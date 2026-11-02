import React, { useId, useMemo, useState } from 'react';
import { Search, Send, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { DueDateField } from '../todos/DueDateField';
import { isValidJalaliDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import { normalizeForSearch } from '../../../shared/search';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_TITLE_MAX } from '../../../shared/tasks';
import type { AssignedTask } from '../../types';

interface TaskFormModalProps {
  /** A copy of the task being changed; without it a new task is handed out. */
  task?: AssignedTask;
  /** A declined copy being passed on to another colleague: same title and note, one new person. */
  reassign?: AssignedTask;
  /** Who the task is for when it is opened from a colleague (e.g. their profile). */
  initialAssigneeIds?: string[];
  onClose: () => void;
}

/** Hands a task to one or more colleagues, changes one handed out earlier, or passes a declined one on. */
export const TaskFormModal: React.FC<TaskFormModalProps> = ({ task, reassign, initialAssigneeIds = [], onClose }) => {
  const { employees, currentUser, tasks, assignTask, editTask, reassignTask } = usePortal();
  const formId = useId();
  const [title, setTitle] = useState(task?.title ?? reassign?.title ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  // A declined task keeps its date unless that day has gone; then a new one is chosen.
  const [dueDate, setDueDate] = useState(task?.dueDate ?? (reassign && reassign.dueDate >= todayJalali() ? reassign.dueDate : ''));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Only colleagues who can receive work (while the part is in preview, the pilot group); a task passed on
  // skips those it already went to.
  const taken = useMemo(
    () => new Set(reassign ? tasks.given.filter((t) => t.groupId === reassign.groupId).map((t) => t.to.id) : []),
    [reassign, tasks.given],
  );
  const people = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.isActive &&
          e.hasAccount &&
          e.id !== currentUser?.id &&
          (tasks.recipients === null || tasks.recipients.includes(e.id)) &&
          !taken.has(e.id),
      ),
    [employees, currentUser?.id, tasks.recipients, taken],
  );
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  const matches =
    words.length === 0
      ? []
      : people
          .filter((p) => !assigneeIds.includes(p.id))
          .filter((p) => {
            const text = normalizeForSearch(`${p.firstName} ${p.lastName} ${p.position} ${p.department}`);
            return words.every((w) => text.includes(w));
          })
          .slice(0, 8);
  const full = assigneeIds.length >= (reassign ? 1 : TASK_ASSIGNEES_MAX);
  // A day already gone is refused (the server says so too); an old task keeps its date until it changes.
  const past = isValidJalaliDate(dueDate) && dueDate < todayJalali() && dueDate !== task?.dueDate;
  const ready = Boolean(title.trim()) && isValidJalaliDate(dueDate) && !past && (task || assigneeIds.length > 0);

  const pick = (id: string) => {
    setAssigneeIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setQuery('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    const values = { title: title.trim(), note: note.trim(), dueDate };
    const ok = task
      ? await editTask(task.groupId, values)
      : reassign
        ? await reassignTask(reassign, assigneeIds[0], dueDate)
        : await assignTask({ ...values, assigneeIds });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={task ? 'ویرایش کار سپرده‌شده' : reassign ? 'سپردن به همکار دیگر' : 'سپردن کار به همکار'}
      subtitle={
        reassign
          ? `${reassign.to.name} این کار را رد کرد${reassign.reply ? `: «${reassign.reply}»` : '.'}`
          : 'فقط شما و همکاری که کار را می‌گیرد آن را می‌بینید.'
      }
      icon={<Send className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <div className="w-full flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form={formId} disabled={saving || !ready} className={primaryButtonClass}>
            {task ? 'ذخیره' : reassign ? 'سپردن' : 'سپردن کار'}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {!task && (
          <div className="space-y-2">
            <label htmlFor={`${formId}-person`} className={labelClass}>
              به چه کسی؟{' '}
              <span className="font-normal text-faint">{reassign ? '(یک همکار)' : '(یک یا چند همکار؛ هر کدام جدا پاسخ می‌دهد)'}</span>
            </label>
            {assigneeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {assigneeIds.map((id) => {
                  const p = byId.get(id);
                  const name = p ? `${p.firstName} ${p.lastName}` : 'همکار';
                  return (
                    <span key={id} className="flex items-center gap-1 pr-2 pl-1 py-1 rounded-xl bg-white border border-line-strong text-sm font-bold">
                      {name}
                      <button type="button" aria-label={`حذف ${name}`} onClick={() => setAssigneeIds(assigneeIds.filter((a) => a !== id))} className="p-0.5 text-faint hover:text-red-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {!full && (
              <div className="relative">
                <Search className="w-4 h-4 text-faint absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id={`${formId}-person`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter in the search picks the first match; it never sends the half-filled form.
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (matches[0]) pick(matches[0].id);
                  }}
                  placeholder="نام همکار را بنویسید"
                  autoComplete="off"
                  className={`${inputClass} pr-9`}
                />
              </div>
            )}
            {full && !reassign && <p className="text-xs text-muted">حداکثر {toPersianDigits(TASK_ASSIGNEES_MAX)} همکار در یک بار.</p>}
            {matches.length > 0 && (
              <ul className="bg-white border border-line rounded-xl divide-y divide-surface overflow-hidden" aria-label="همکاران پیدا‌شده">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(p.id)}
                      className="w-full text-right px-3 py-2 hover:bg-surface-soft flex items-center gap-2"
                    >
                      <Avatar src={p.avatar} firstName={p.firstName} lastName={p.lastName} className="w-7 h-7 rounded-full text-xs" />
                      <span className="min-w-0">
                        <span className="font-bold text-sm">{p.firstName} {p.lastName}</span>
                        <span className="text-xs text-muted"> · {[p.position, p.department].filter(Boolean).join('، ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {words.length > 0 && matches.length === 0 && <p className="text-xs text-muted">همکاری با این نام پیدا نشد.</p>}
          </div>
        )}
        {task && (
          <p className="text-xs text-muted">
            تغییرها روی همهٔ نسخه‌های تمام‌نشدهٔ این کار می‌نشیند و به همکاران خبر داده می‌شود.
          </p>
        )}
        {reassign ? (
          <div>
            <p className={labelClass}>چه کاری؟</p>
            <p className="text-sm font-bold text-ink break-words">{reassign.title}</p>
            {reassign.note && <p className="mt-1 text-xs text-muted whitespace-pre-line">{reassign.note}</p>}
          </div>
        ) : (
          <div>
            <label htmlFor={`${formId}-title`} className={labelClass}>چه کاری؟</label>
            <input
              id={`${formId}-title`}
              value={title}
              maxLength={TASK_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputClass}
              placeholder="مثلاً گزارش فروش آبان را آماده کنید"
            />
          </div>
        )}
        <div>
          <label htmlFor={`${formId}-due`} className={labelClass}>موعد</label>
          <DueDateField id={`${formId}-due`} value={dueDate} onChange={setDueDate} />
          {past && <p role="alert" className="mt-1 text-xs font-bold text-red-700">این روز گذشته است؛ امروز یا روزی بعد را انتخاب کنید.</p>}
        </div>
        {!reassign && (
          <div>
            <label htmlFor={`${formId}-note`} className={labelClass}>توضیح (اختیاری)</label>
            <textarea
              id={`${formId}-note`}
              value={note}
              maxLength={TASK_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="هر چیزی که همکارتان برای انجام کار لازم دارد"
            />
          </div>
        )}
      </form>
    </Modal>
  );
};
