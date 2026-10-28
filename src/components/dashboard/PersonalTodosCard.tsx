import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, ExternalLink, Lock, NotebookPen, Plus } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { inputClass } from '../common/Modal';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { TodoFormModal } from '../todos/TodoFormModal';
import { featureInPreview } from '../../lib/features';
import { dayLabel, isValidJalaliDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import type { ActiveTab, PersonalTodo } from '../../types';
import { TODO_TITLE_MAX, todoSource } from '../../../shared/todos';

/** Open notes shown before «نمایش همه». */
const SHOWN = 8;

/** Overdue first, then by due date; notes without a date last, oldest first. */
const byDue = (a: PersonalTodo, b: PersonalTodo) =>
  (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') || a.createdAt.localeCompare(b.createdAt);

/**
 * «یادداشت کارهای من»: the person's own to-do list with due dates. Only they see it; the morning of
 * the due date the portal reminds them. Notes added from a news item, event, course or document link back.
 */
export const PersonalTodosCard: React.FC = () => {
  const { todos, addTodo, updateTodo, clearDoneTodos, setActiveTab, appSettings } = usePortal();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PersonalTodo | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const today = todayJalali();
  const open = todos.filter((t) => !t.doneAt).sort(byDue);
  const done = todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));
  const shown = showAll ? open : open.slice(0, SHOWN);
  const dateInvalid = dueDate !== '' && !isValidJalaliDate(dueDate);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || dateInvalid) return;
    setAdding(true);
    const created = await addTodo({ title: title.trim(), dueDate: dueDate || null });
    setAdding(false);
    if (created) {
      setTitle('');
      setDueDate('');
    }
  };

  return (
    <section className="bg-white border border-[#E6E0D5] rounded-3xl p-4 sm:p-5 space-y-3" aria-labelledby="personal-todos-title">
      <div className="flex flex-wrap items-center gap-2">
        <span className="p-1.5 bg-sky-100 text-sky-800 rounded-xl"><NotebookPen className="w-4 h-4" /></span>
        <h2 id="personal-todos-title" className="text-sm font-black text-[#2D2D2D]">یادداشت کارهای من</h2>
        {open.length > 0 && (
          <span className="px-2 py-0.5 text-[11px] font-bold bg-sky-100 text-sky-900 rounded-full">{toPersianDigits(open.length)} کار</span>
        )}
        {featureInPreview(appSettings, 'todos') && (
          <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>
        )}
        <span className="ms-auto text-[11px] text-[#8C867A] flex items-center gap-1">
          <Lock className="w-3 h-3" /> فقط خودتان می‌بینید
        </span>
      </div>

      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_auto] gap-2">
        <input
          value={title}
          maxLength={TODO_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="کار تازه"
          placeholder="کار تازه‌ای بنویسید…"
          className={inputClass}
        />
        <JalaliDateInput value={dueDate} onChange={setDueDate} placeholder="سررسید (اختیاری)" />
        <button
          type="submit"
          disabled={adding || !title.trim() || dateInvalid}
          className="px-4 py-2.5 text-xs font-bold text-white bg-sky-700 hover:bg-sky-800 rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> افزودن
        </button>
      </form>

      {open.length === 0 ? (
        <p className="text-xs text-[#6E6A60] py-2">
          کار بازی ندارید. کارهایتان را این‌جا بنویسید، یا از هر خبر، رویداد، دوره و سند «افزودن به یادداشت کارهای من» را بزنید.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((t) => (
            <TodoRow key={t.id} todo={t} today={today} onToggle={() => updateTodo(t.id, { done: true })} onEdit={() => setEditing(t)} onOpenSource={setActiveTab} />
          ))}
        </ul>
      )}
      {open.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="tap-area text-xs font-bold text-sky-800 hover:underline">
          {showAll ? 'نمایش کمتر' : `نمایش همه (${toPersianDigits(open.length)})`}
        </button>
      )}

      {done.length > 0 && (
        <div className="pt-2 border-t border-[#EFEAE1] space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((s) => !s)}
              className="tap-area text-xs font-bold text-[#6E6A60] flex items-center gap-1"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showDone ? 'rotate-180' : ''}`} />
              انجام‌شده‌ها ({toPersianDigits(done.length)})
            </button>
            {showDone && (
              <button type="button" onClick={() => clearDoneTodos()} className="tap-area text-[11px] text-red-700 hover:underline">
                پاک کردن انجام‌شده‌ها
              </button>
            )}
          </div>
          {showDone && (
            <ul className="space-y-1.5">
              {done.map((t) => (
                <TodoRow key={t.id} todo={t} today={today} onToggle={() => updateTodo(t.id, { done: false })} onEdit={() => setEditing(t)} onOpenSource={setActiveTab} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <TodoFormModal todo={editing} onClose={() => setEditing(null)} />}
    </section>
  );
};

interface TodoRowProps {
  todo: PersonalTodo;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
  onOpenSource: (tab: ActiveTab, id: string) => void;
}

const TodoRow: React.FC<TodoRowProps> = ({ todo, today, onToggle, onEdit, onOpenSource }) => {
  const isDone = Boolean(todo.doneAt);
  const overdue = !isDone && todo.dueDate !== null && todo.dueDate < today;
  const dueToday = !isDone && todo.dueDate === today;
  const source = todoSource(todo.sourceType);
  return (
    <li className={`flex items-center gap-2 p-2 rounded-2xl border ${overdue ? 'bg-red-50 border-red-200' : dueToday ? 'bg-amber-50 border-amber-200' : 'bg-[#F9F7F4] border-[#E6E0D5]'}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? `برگرداندن «${todo.title}» به کارهای باز` : `انجام شد: ${todo.title}`}
        onClick={onToggle}
        className="p-1 rounded-lg hover:bg-white shrink-0"
      >
        {isDone ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-[#A8A295]" />}
      </button>
      <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-right" aria-label={`ویرایش ${todo.title}`}>
        <span className={`block text-xs font-bold truncate ${isDone ? 'line-through text-[#8C867A]' : 'text-[#2D2D2D]'}`}>{todo.title}</span>
        {todo.note && <span className="block text-[11px] text-[#6E6A60] truncate">{todo.note}</span>}
      </button>
      {todo.dueDate && (
        <span className={`text-[11px] whitespace-nowrap ${overdue ? 'text-red-700 font-bold' : dueToday ? 'text-amber-800 font-bold' : 'text-[#6E6A60]'}`}>
          {overdue ? `گذشته (${dayLabel(todo.dueDate)})` : dayLabel(todo.dueDate)}
        </span>
      )}
      {source && todo.sourceId && (
        <button
          type="button"
          onClick={() => onOpenSource(source.tab, todo.sourceId!)}
          title={`رفتن به ${source.label}`}
          aria-label={`رفتن به ${source.label}`}
          className="p-1.5 rounded-lg text-[#6E6A60] hover:text-sky-800 hover:bg-white shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      )}
    </li>
  );
};
