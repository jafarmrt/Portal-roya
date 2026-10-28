import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, Circle, ExternalLink, ListChecks, Lock, Maximize2, NotebookPen, Plus, Repeat, Star, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { inputClass } from '../common/Modal';
import { TodoFormModal } from '../todos/TodoFormModal';
import { DueDateField, QuickDueDates } from '../todos/DueDateField';
import { useTickTodo } from '../todos/useTickTodo';
import { featureInPreview } from '../../lib/features';
import { isValidJalaliDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import { byImportanceAndDue, GROUP_STYLE, shortDue } from '../todos/todoText';
import type { ActiveTab, PersonalTodo } from '../../types';
import { TODO_GROUPS, TODO_TITLE_MAX, todoGroup, todoSource, type TodoGroup } from '../../../shared/todos';

/** Open notes shown before «نمایش همه»; the card sits in the narrow side column. */
const SHOWN = 5;

/**
 * «یادداشت کارهای من»: the person's own notes, grouped into overdue, today, this week and later.
 * Only they see it; they are reminded on the morning of the due date (and the morning before if they
 * ask). Notes added from a news item, event, course or document link back to it.
 */
export const PersonalTodosCard: React.FC = () => {
  const { todos, addTodo, updateTodo, clearDoneTodos, setActiveTab, appSettings } = usePortal();
  const tick = useTickTodo();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PersonalTodo | null>(null);
  const [detailed, setDetailed] = useState<{ title: string; dueDate: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const today = todayJalali();
  const open = todos.filter((t) => !t.doneAt);
  const done = todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));
  const groups = TODO_GROUPS.map((g) => ({ ...g, items: open.filter((t) => todoGroup(t.dueDate, today) === g.id).sort(byImportanceAndDue) })).filter(
    (g) => g.items.length > 0,
  );
  // The first five across the groups, unless everything is shown.
  let budget = showAll ? Infinity : SHOWN;
  const shownGroups = groups
    .map((g) => {
      const items = g.items.slice(0, Math.max(0, budget));
      budget -= items.length;
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
  const urgent = open.filter((t) => t.dueDate !== null && t.dueDate <= today).length;
  const canAdd = Boolean(title.trim()) && isValidJalaliDate(dueDate);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    setAdding(true);
    const created = await addTodo({ title: title.trim(), dueDate });
    setAdding(false);
    if (created) {
      setTitle('');
      setDueDate('');
      setFormOpen(false);
    }
  };

  return (
    <section className="bg-white border border-[#E6E0D5] rounded-3xl p-4 space-y-3" aria-labelledby="personal-todos-title">
      <div className="flex items-center gap-2">
        <span className="p-1.5 bg-sky-100 text-sky-800 rounded-xl"><NotebookPen className="w-4 h-4" /></span>
        <h2 id="personal-todos-title" className="text-sm font-black text-[#2D2D2D]">یادداشت کارهای من</h2>
        {urgent > 0 && (
          <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900 rounded-full" title="سررسید امروز یا گذشته">
            {toPersianDigits(urgent)} امروز
          </span>
        )}
        {featureInPreview(appSettings, 'todos') && (
          <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('todos')}
          aria-label="صفحهٔ یادداشت‌های من"
          title="صفحهٔ یادداشت‌های من: همهٔ یادداشت‌ها، جستجو و سوابق"
          className="ms-auto p-1.5 rounded-xl text-sky-800 hover:bg-sky-50"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-expanded={formOpen}
          aria-label={formOpen ? 'بستن فرم کار تازه' : 'کار تازه'}
          title={formOpen ? 'بستن' : 'کار تازه'}
          onClick={() => setFormOpen((o) => !o)}
          className="p-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white"
        >
          {formOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[11px] text-[#8C867A] flex items-center gap-1 -mt-1">
        <Lock className="w-3 h-3" /> فقط خودتان می‌بینید
      </p>

      {formOpen && (
        <form onSubmit={add} className="p-3 bg-sky-50/60 border border-sky-100 rounded-2xl space-y-2">
          <input
            value={title}
            maxLength={TODO_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="عنوان کار تازه"
            placeholder="کار تازه‌ای بنویسید…"
            autoFocus
            className={inputClass}
          />
          <DueDateField value={dueDate} onChange={setDueDate} />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setDetailed({ title, dueDate })} className="tap-area text-[11px] font-bold text-sky-800 hover:underline">
              مهم، تکرار، گام‌ها…
            </button>
            <button
              type="submit"
              disabled={adding || !canAdd}
              title={!isValidJalaliDate(dueDate) ? 'تاریخ سررسید را انتخاب کنید' : undefined}
              className="px-4 py-2 text-xs font-bold text-white bg-sky-700 hover:bg-sky-800 rounded-xl disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> افزودن
            </button>
          </div>
        </form>
      )}

      {open.length === 0 ? (
        <p className="text-xs text-[#6E6A60] py-1 leading-relaxed">
          کار بازی ندارید. با «+» کاری بنویسید، یا از هر خبر، رویداد، دوره و سند «افزودن به یادداشت کارهای من» را بزنید.
        </p>
      ) : (
        <div className="space-y-2">
          {shownGroups.map((g) => (
            <div key={g.id} role="group" aria-label={g.label}>
              <h3 className={`text-[11px] font-black mb-1 ${GROUP_STYLE[g.id]}`}>
                {g.label} <span className="font-bold">({toPersianDigits(groups.find((x) => x.id === g.id)!.items.length)})</span>
              </h3>
              <ul className="space-y-1">
                {g.items.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    today={today}
                    group={g.id}
                    onToggle={() => void tick(t)}
                    onEdit={() => setEditing(t)}
                    onStar={() => void updateTodo(t.id, { important: !t.important })}
                    onDate={(date) => void updateTodo(t.id, { dueDate: date })}
                    onOpenSource={setActiveTab}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
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
            <>
              <ul className="space-y-1">
                {done.map((t) => (
                  <TodoRow key={t.id} todo={t} today={today} onToggle={() => void updateTodo(t.id, { done: false })} onEdit={() => setEditing(t)} onOpenSource={setActiveTab} />
                ))}
              </ul>
              <p className="text-[10px] text-[#8C867A]">انجام‌شده‌ها پس از ۳۰ روز خودبه‌خود پاک می‌شوند.</p>
            </>
          )}
        </div>
      )}

      {editing && <TodoFormModal todo={editing} onClose={() => setEditing(null)} />}
      {detailed && (
        <TodoFormModal
          initial={{ title: detailed.title, dueDate: detailed.dueDate || undefined }}
          onClose={() => {
            setDetailed(null);
            setTitle('');
            setDueDate('');
            setFormOpen(false);
          }}
        />
      )}
    </section>
  );
};

interface TodoRowProps {
  todo: PersonalTodo;
  today: string;
  /** Open notes only: which group it is listed in. */
  group?: TodoGroup;
  onToggle: () => void;
  onEdit: () => void;
  onStar?: () => void;
  /** Postpones the note, or gives an old note without a date one. */
  onDate?: (date: string) => void;
  onOpenSource: (tab: ActiveTab, id: string) => void;
}

const iconButton = 'p-1 rounded-lg shrink-0 text-[#8C867A] hover:bg-white';

const TodoRow: React.FC<TodoRowProps> = ({ todo, today, group, onToggle, onEdit, onStar, onDate, onOpenSource }) => {
  const [dating, setDating] = useState(false);
  const isDone = Boolean(todo.doneAt);
  const source = todoSource(todo.sourceType);
  const stepsDone = todo.steps.filter((s) => s.done).length;
  const late = group === 'overdue';
  const canPostpone = onDate && (group === 'overdue' || group === 'today' || group === 'none');
  return (
    <li className={`rounded-xl border ${late ? 'bg-red-50 border-red-200' : group === 'today' ? 'bg-amber-50 border-amber-200' : 'bg-[#F9F7F4] border-[#E6E0D5]'}`}>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `برگرداندن «${todo.title}» به کارهای باز` : `انجام شد: ${todo.title}`}
          onClick={onToggle}
          className="p-1 rounded-lg hover:bg-white shrink-0"
        >
          {isDone ? <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600" /> : <Circle className="w-[18px] h-[18px] text-[#A8A295]" />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-0 text-right flex items-center gap-1"
          aria-label={`ویرایش ${todo.title}`}
          title={todo.note ? `${todo.title}\n${todo.note}` : todo.title}
        >
          <span className={`truncate text-xs font-bold ${isDone ? 'line-through text-[#8C867A]' : 'text-[#2D2D2D]'}`}>{todo.title}</span>
          {todo.repeat && <Repeat className="w-3 h-3 text-sky-700 shrink-0" aria-label="تکراری" />}
          {todo.steps.length > 0 && (
            <span className="text-[10px] text-[#6E6A60] flex items-center gap-0.5 shrink-0" aria-label={`${toPersianDigits(stepsDone)} از ${toPersianDigits(todo.steps.length)} گام`}>
              <ListChecks className="w-3 h-3" />
              {toPersianDigits(`${stepsDone} از ${todo.steps.length}`)}
            </span>
          )}
        </button>
        {onStar && (
          <button
            type="button"
            aria-pressed={todo.important}
            aria-label={todo.important ? `برداشتن ستارهٔ ${todo.title}` : `مهم: ${todo.title}`}
            title={todo.important ? 'مهم' : 'علامت مهم'}
            onClick={onStar}
            className={iconButton}
          >
            <Star className={`w-3.5 h-3.5 ${todo.important ? 'fill-amber-500 text-amber-500' : 'text-[#C9C3B7]'}`} />
          </button>
        )}
        {todo.dueDate && !isDone && (
          <span className={`text-[10px] whitespace-nowrap ${late ? 'text-red-700 font-bold' : group === 'today' ? 'text-amber-800 font-bold' : 'text-[#6E6A60]'}`}>
            {shortDue(todo.dueDate, today)}
          </span>
        )}
        {canPostpone && (
          <button
            type="button"
            aria-expanded={dating}
            aria-label={todo.dueDate ? `به تعویق انداختن ${todo.title}` : `تاریخ برای ${todo.title}`}
            title={todo.dueDate ? 'به تعویق انداختن' : 'تاریخ بگذارید'}
            onClick={() => setDating((d) => !d)}
            className={`${iconButton} ${todo.dueDate ? '' : 'text-sky-800'}`}
          >
            <CalendarClock className="w-4 h-4" />
          </button>
        )}
        {source && todo.sourceId && (
          <button
            type="button"
            onClick={() => onOpenSource(source.tab, todo.sourceId!)}
            title={`رفتن به ${source.label}`}
            aria-label={`رفتن به ${source.label}`}
            className={`${iconButton} hover:text-sky-800`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {dating && onDate && (
        <div className="px-2 pb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#6E6A60]">{todo.dueDate ? 'انتقال به:' : 'سررسید:'}</span>
          <QuickDueDates
            value=""
            only={todo.dueDate ? ['tomorrow', 'nextWeek'] : undefined}
            onPick={(date) => {
              setDating(false);
              onDate(date);
            }}
          />
        </div>
      )}
    </li>
  );
};
