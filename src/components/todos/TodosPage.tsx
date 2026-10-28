import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  History,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { inputClass, primaryButtonClass } from '../common/Modal';
import { featureInPreview } from '../../lib/features';
import { formatDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import type { PersonalTodo } from '../../types';
import { TODO_GROUPS, TODO_KEEP_DONE_DAYS, TODO_REPEATS, todoGroup, todoSource, type TodoGroup } from '../../../shared/todos';
import { QuickDueDates } from './DueDateField';
import { TodoFormModal } from './TodoFormModal';
import { useTickTodo } from './useTickTodo';
import { byImportanceAndDue, GROUP_STYLE, shortDue } from './todoText';

type Filter = 'open' | 'urgent' | 'week' | 'important' | 'repeat' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'همهٔ کارهای باز' },
  { id: 'urgent', label: 'امروز و عقب‌افتاده' },
  { id: 'week', label: 'این هفته' },
  { id: 'important', label: 'مهم' },
  { id: 'repeat', label: 'تکراری' },
  { id: 'done', label: 'انجام‌شده‌ها' },
];

const CARD_TONE: Record<TodoGroup, string> = {
  overdue: 'border-red-300 bg-red-50/60',
  today: 'border-amber-300 bg-amber-50/60',
  week: 'border-sky-200 bg-white',
  later: 'border-[#E6E0D5] bg-white',
  none: 'border-dashed border-[#D9D4CB] bg-white',
};

const repeatLabel = (todo: PersonalTodo) => TODO_REPEATS.find((r) => r.id === todo.repeat)?.label;

/**
 * «یادداشت‌های من»: every note of this person as cards, for when the dashboard card is not enough:
 * search, filters, steps ticked on the card itself, and the history of what was done. The dashboard
 * card keeps working on its own; this page is for more control and focus.
 */
export const TodosPage: React.FC = () => {
  const { todos, appSettings, clearDoneTodos } = usePortal();
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<PersonalTodo | null>(null);
  const [writing, setWriting] = useState(false);
  const today = todayJalali();

  const open = useMemo(() => todos.filter((t) => !t.doneAt), [todos]);
  const done = useMemo(() => todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)), [todos]);
  const matchesFilter = (t: PersonalTodo, f: Filter) => {
    const group = todoGroup(t.dueDate, today);
    if (f === 'urgent') return group === 'overdue' || group === 'today';
    if (f === 'week') return group === 'overdue' || group === 'today' || group === 'week';
    if (f === 'important') return t.important;
    if (f === 'repeat') return Boolean(t.repeat);
    return true;
  };
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, f.id === 'done' ? done.length : open.filter((t) => matchesFilter(t, f.id)).length])) as Record<Filter, number>;

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesQuery = (t: PersonalTodo) => {
    const text = [t.title, t.note, ...t.steps.map((s) => s.text)].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  };
  const listed = (filter === 'done' ? done : open.filter((t) => matchesFilter(t, filter))).filter(matchesQuery);
  const groups =
    filter === 'done'
      ? []
      : TODO_GROUPS.map((g) => ({ ...g, items: listed.filter((t) => todoGroup(t.dueDate, today) === g.id).sort(byImportanceAndDue) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-3 bg-sky-700 text-white rounded-2xl shadow-lg">
          <NotebookPen className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-[#2D2D2D] flex items-center gap-2">
            یادداشت‌های من
            {featureInPreview(appSettings, 'todos') && <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>}
          </h2>
          <p className="text-sm text-[#6E6A60] flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> فقط خودتان می‌بینید · {toPersianDigits(open.length)} کار باز
          </p>
        </div>
        <button type="button" onClick={() => setWriting(true)} className={primaryButtonClass}>
          <Plus className="w-4 h-4" /> کار تازه
        </button>
      </div>

      <div className="bg-white border border-[#E6E0D5] rounded-3xl p-3 sm:p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C867A] absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="جستجو در یادداشت‌ها"
            placeholder="جستجو در عنوان، توضیح و گام‌ها…"
            className={`${inputClass} pr-9`}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="نمایش">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-full border flex items-center gap-1.5 transition-colors ${
                filter === f.id ? 'bg-sky-700 border-sky-700 text-white' : 'bg-white border-[#E6E0D5] text-[#4B4740] hover:border-sky-600'
              }`}
            >
              {f.id === 'done' && <History className="w-3.5 h-3.5" />}
              {f.label}
              <span className={`text-[10px] ${filter === f.id ? 'text-sky-100' : 'text-[#8C867A]'}`}>{toPersianDigits(counts[f.id])}</span>
            </button>
          ))}
        </div>
      </div>

      {listed.length === 0 ? (
        <p className="py-12 text-center text-sm text-[#6E6A60]">
          {query.trim()
            ? 'یادداشتی با این جستجو پیدا نشد.'
            : filter === 'done'
              ? 'هنوز کاری را تیک نزده‌اید.'
              : filter === 'open'
                ? 'کار بازی ندارید. با «کار تازه» شروع کنید، یا از هر خبر، رویداد، دوره و سند «افزودن به یادداشت کارهای من» را بزنید.'
                : 'در این دسته کاری نیست.'}
        </p>
      ) : filter === 'done' ? (
        <section aria-label="سوابق انجام‌شده‌ها" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#6E6A60]">انجام‌شده‌ها {toPersianDigits(TODO_KEEP_DONE_DAYS)} روز پس از تیک خودبه‌خود پاک می‌شوند.</p>
            <button type="button" onClick={() => clearDoneTodos()} className="tap-area text-xs font-bold text-red-700 hover:underline flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> پاک کردن همهٔ انجام‌شده‌ها
            </button>
          </div>
          <CardGrid items={listed} today={today} onEdit={setEditing} />
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`todo-group-${g.id}`} className="space-y-2">
            <h3 id={`todo-group-${g.id}`} className={`text-sm font-black ${GROUP_STYLE[g.id]}`}>
              {g.label} <span className="font-bold">({toPersianDigits(g.items.length)})</span>
            </h3>
            <CardGrid items={g.items} today={today} onEdit={setEditing} />
          </section>
        ))
      )}

      {editing && <TodoFormModal todo={editing} onClose={() => setEditing(null)} />}
      {writing && <TodoFormModal onClose={() => setWriting(false)} />}
    </div>
  );
};

const CardGrid: React.FC<{ items: PersonalTodo[]; today: string; onEdit: (todo: PersonalTodo) => void }> = ({ items, today, onEdit }) => (
  <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
    {items.map((t) => (
      <TodoCard key={t.id} todo={t} today={today} onEdit={() => onEdit(t)} />
    ))}
  </ul>
);

const iconButton = 'p-1.5 rounded-lg text-[#6E6A60] hover:bg-white hover:text-sky-800';

/** One note as a card: its steps can be ticked right here. */
const TodoCard: React.FC<{ todo: PersonalTodo; today: string; onEdit: () => void }> = ({ todo, today, onEdit }) => {
  const { updateTodo, setActiveTab } = usePortal();
  const tick = useTickTodo();
  const [dating, setDating] = useState(false);
  const isDone = Boolean(todo.doneAt);
  const group = todoGroup(todo.dueDate, today);
  const source = todoSource(todo.sourceType);
  const stepsDone = todo.steps.filter((s) => s.done).length;

  const toggleStep = (id: string) =>
    void updateTodo(todo.id, { steps: todo.steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });

  return (
    <li
      aria-label={todo.title}
      className={`rounded-2xl border p-3 space-y-2 shadow-xs ${isDone ? 'border-[#E6E0D5] bg-[#F9F7F4]' : CARD_TONE[group]}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `برگرداندن «${todo.title}» به کارهای باز` : `انجام شد: ${todo.title}`}
          onClick={() => (isDone ? void updateTodo(todo.id, { done: false }) : void tick(todo))}
          className="p-0.5 rounded-lg hover:bg-white shrink-0"
        >
          {isDone ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-[#A8A295]" />}
        </button>
        <h4 className={`flex-1 min-w-0 text-sm font-black leading-snug break-words ${isDone ? 'line-through text-[#8C867A]' : 'text-[#2D2D2D]'}`}>{todo.title}</h4>
        {!isDone && (
          <button
            type="button"
            aria-pressed={todo.important}
            aria-label={todo.important ? `برداشتن ستارهٔ ${todo.title}` : `مهم: ${todo.title}`}
            onClick={() => void updateTodo(todo.id, { important: !todo.important })}
            className="p-0.5 rounded-lg hover:bg-white shrink-0"
          >
            <Star className={`w-4 h-4 ${todo.important ? 'fill-amber-500 text-amber-500' : 'text-[#C9C3B7]'}`} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {isDone ? (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold">انجام شد {formatDate(todo.doneAt)}</span>
        ) : todo.dueDate ? (
          <span className={`px-2 py-0.5 rounded-full bg-white/80 border border-current/10 font-bold ${GROUP_STYLE[group]}`} title={formatDate(todo.dueDate)}>
            {shortDue(todo.dueDate, today)}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-white border border-dashed border-[#D9D4CB] text-[#6E6A60]">بدون تاریخ</span>
        )}
        {todo.repeat && (
          <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 flex items-center gap-1">
            <Repeat className="w-3 h-3" /> {repeatLabel(todo)}
          </span>
        )}
        {!isDone && todo.dueDate && (
          <span className="text-[#8C867A] flex items-center gap-0.5" title={todo.remind === 'none' ? 'بدون یادآوری' : todo.remind === 'both' ? 'یادآوری روز قبل و همان روز' : 'یادآوری صبح همان روز'}>
            {todo.remind === 'none' ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
            {todo.remind === 'both' && <span>۲</span>}
          </span>
        )}
      </div>

      {todo.note && <p className="text-xs text-[#4B4740] leading-relaxed whitespace-pre-line line-clamp-5">{todo.note}</p>}

      {todo.steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-[#8C867A]">
            {toPersianDigits(stepsDone)} از {toPersianDigits(todo.steps.length)} گام
          </p>
          <ul className="space-y-0.5">
            {todo.steps.map((s) => (
              <li key={s.id}>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={s.done} disabled={isDone} onChange={() => toggleStep(s.id)} className="mt-0.5 w-3.5 h-3.5 accent-sky-700" />
                  <span className={s.done ? 'line-through text-[#8C867A]' : 'text-[#2D2D2D]'}>{s.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-0.5 pt-1 border-t border-black/5">
        <button type="button" onClick={onEdit} aria-label={`ویرایش ${todo.title}`} title="ویرایش" className={iconButton}>
          <Pencil className="w-4 h-4" />
        </button>
        {!isDone && (
          <button
            type="button"
            aria-expanded={dating}
            aria-label={todo.dueDate ? `به تعویق انداختن ${todo.title}` : `تاریخ برای ${todo.title}`}
            title={todo.dueDate ? 'به تعویق انداختن' : 'تاریخ بگذارید'}
            onClick={() => setDating((d) => !d)}
            className={iconButton}
          >
            <CalendarClock className="w-4 h-4" />
          </button>
        )}
        {isDone && (
          <button type="button" onClick={() => void updateTodo(todo.id, { done: false })} aria-label={`برگرداندن ${todo.title}`} title="برگرداندن به کارهای باز" className={iconButton}>
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {source && todo.sourceId && (
          <button
            type="button"
            onClick={() => setActiveTab(source.tab, todo.sourceId!)}
            aria-label={`رفتن به ${source.label}`}
            title={`رفتن به ${source.label}`}
            className={`${iconButton} ms-auto`}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>
      {dating && (
        <QuickDueDates
          value=""
          only={todo.dueDate ? ['tomorrow', 'weekEnd', 'nextWeek'] : undefined}
          onPick={(date) => {
            setDating(false);
            void updateTodo(todo.id, { dueDate: date });
          }}
        />
      )}
    </li>
  );
};
