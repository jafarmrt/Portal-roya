import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Repeat,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { inputClass, primaryButtonClass } from '../common/Modal';
import { featureInPreview } from '../../lib/features';
import { formatDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import type { PersonalTodo } from '../../types';
import { TODO_REPEATS, todoGroup, todoSource, type TodoGroup } from '../../../shared/todos';
import { QuickDueDates } from './DueDateField';
import { TodoFormModal } from './TodoFormModal';
import { useTickTodo } from './useTickTodo';
import { byDay, dayTitle, GROUP_STYLE, type TodoDay } from './todoText';
import { haptic, pop } from '../../lib/feedback';

type Filter = 'all' | 'open' | 'urgent' | 'week' | 'important' | 'repeat' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'open', label: 'باز' },
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
  later: 'border-line bg-white',
  none: 'border-dashed border-line-strong bg-white',
};
/** A day that is over and has nothing left to do. */
const FINISHED_TONE = 'border-line bg-surface-soft';

const repeatLabel = (todo: PersonalTodo) => TODO_REPEATS.find((r) => r.id === todo.repeat)?.label;

const useSearch = () => {
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (t: PersonalTodo) => {
    const text = [t.title, t.note, ...t.steps.map((s) => s.text)].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  };
  return { query, setQuery, matches, searching: words.length > 0 };
};

const SearchBox: React.FC<{ value: string; onChange: (value: string) => void; label: string }> = ({ value, onChange, label }) => (
  <div className="relative">
    <Search className="w-4 h-4 text-faint absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      placeholder="جستجو در عنوان، توضیح و گام‌ها…"
      className={`${inputClass} pr-9`}
    />
  </div>
);

/**
 * «یادداشت‌های من»: one card for each day, with every note due that day in it, open and done. Done
 * notes stay on their day until the person archives them; «آرشیو» keeps them after that.
 */
export const TodosPage: React.FC = () => {
  const [view, setView] = useState<'page' | 'archive'>('page');
  return view === 'archive' ? <ArchiveView onBack={() => setView('page')} /> : <DaysView onArchive={() => setView('archive')} />;
};

const DaysView: React.FC<{ onArchive: () => void }> = ({ onArchive }) => {
  const { todos, appSettings, archiveDoneTodos } = usePortal();
  const [filter, setFilter] = useState<Filter>('all');
  const { query, setQuery, matches, searching } = useSearch();
  const [editing, setEditing] = useState<PersonalTodo | null>(null);
  const [writing, setWriting] = useState(false);
  const today = todayJalali();

  const open = useMemo(() => todos.filter((t) => !t.doneAt), [todos]);
  const matchesFilter = (t: PersonalTodo, f: Filter) => {
    const group = todoGroup(t.dueDate, today);
    if (f === 'open') return !t.doneAt;
    if (f === 'done') return Boolean(t.doneAt);
    if (f === 'urgent') return group === 'overdue' || group === 'today';
    if (f === 'week') return group === 'overdue' || group === 'today' || group === 'week';
    if (f === 'important') return t.important;
    if (f === 'repeat') return Boolean(t.repeat);
    return true;
  };
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, todos.filter((t) => matchesFilter(t, f.id)).length])) as Record<Filter, number>;

  const listed = todos.filter((t) => matchesFilter(t, filter) && matches(t));
  const days = byDay(listed);
  // Days still to do (or with something left), oldest first and undated at the end; then the days that
  // are over and done, the latest first.
  const finished = (d: TodoDay) => d.date !== null && d.date < today && d.items.every((t) => t.doneAt);
  const current = days.filter((d) => !finished(d)).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'));
  const past = days.filter(finished).sort((a, b) => b.date!.localeCompare(a.date!));
  const listedDone = listed.filter((t) => t.doneAt).map((t) => t.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-3 bg-sky-700 text-white rounded-2xl shadow-lg">
          <NotebookPen className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-ink flex items-center gap-2">
            یادداشت‌های من
            {featureInPreview(appSettings, 'todos') && <span className="px-2 py-0.5 text-xs font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>}
          </h2>
          <p className="text-sm text-muted flex flex-wrap items-center gap-x-1">
            <span className="flex items-center gap-1 whitespace-nowrap"><Lock className="w-3.5 h-3.5" /> فقط خودتان می‌بینید</span>
            <span className="whitespace-nowrap">· {toPersianDigits(open.length)} یادداشت باز</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onArchive}
          className="px-3 py-2 text-sm font-bold rounded-xl border border-line bg-white text-ink-soft hover:border-sky-600 flex items-center gap-1.5"
        >
          <Archive className="w-4 h-4" /> آرشیو
        </button>
        <button type="button" onClick={() => setWriting(true)} className={primaryButtonClass}>
          <Plus className="w-4 h-4" /> یادداشت تازه
        </button>
      </div>

      <div className="bg-white border border-line/70 shadow-card rounded-3xl p-3 sm:p-4 space-y-3">
        <SearchBox value={query} onChange={setQuery} label="جستجو در یادداشت‌ها" />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="نمایش">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-full border flex items-center gap-1.5 transition-colors ${
                filter === f.id ? 'bg-sky-700 border-sky-700 text-white' : 'bg-white border-line text-ink-soft hover:border-sky-600'
              }`}
            >
              {f.label}
              <span className={`text-xs ${filter === f.id ? 'text-white/80' : 'text-faint'}`}>{toPersianDigits(counts[f.id])}</span>
            </button>
          ))}
          {listedDone.length > 0 && (
            <button
              type="button"
              onClick={() => void archiveDoneTodos(filter === 'all' && !searching ? undefined : listedDone)}
              className="tap-area ms-auto text-xs font-bold text-sky-800 hover:underline flex items-center gap-1"
            >
              <Archive className="w-3.5 h-3.5" />
              {filter === 'all' && !searching ? 'بایگانی همهٔ انجام‌شده‌ها' : 'بایگانی انجام‌شده‌های این فهرست'} ({toPersianDigits(listedDone.length)})
            </button>
          )}
        </div>
      </div>

      {listed.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {searching
            ? 'یادداشتی با این جستجو پیدا نشد.'
            : filter === 'done'
              ? 'یادداشت انجام‌شده‌ای در این صفحه نیست. انجام‌شده‌هایی که بایگانی کرده‌اید در «آرشیو» هستند.'
              : todos.length === 0
                ? 'یادداشتی ندارید. با «یادداشت تازه» شروع کنید، یا از هر خبر، رویداد، دوره و سند «افزودن به یادداشت‌های من» را بزنید.'
                : 'در این دسته یادداشتی نیست.'}
        </p>
      ) : (
        <>
          {current.length > 0 && <DayGrid days={current} today={today} onEdit={setEditing} />}
          {past.length > 0 && (
            <section aria-labelledby="todo-past-days" className="space-y-2">
              <h3 id="todo-past-days" className="text-sm font-black text-muted">
                روزهای گذشته، همه انجام شده <span className="font-bold">({toPersianDigits(past.length)} روز)</span>
              </h3>
              <p className="text-xs text-faint">این روزها تا وقتی بایگانی‌شان نکنید همین‌جا می‌مانند و خودبه‌خود پاک نمی‌شوند.</p>
              <DayGrid days={past} today={today} onEdit={setEditing} />
            </section>
          )}
        </>
      )}

      {editing && <TodoFormModal todo={editing} onClose={() => setEditing(null)} />}
      {writing && <TodoFormModal onClose={() => setWriting(false)} />}
    </div>
  );
};

/** «آرشیو»: the done notes the person put away, by day, latest first; each can come back or be deleted. */
const ArchiveView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { todos } = usePortal();
  const [items, setItems] = useState<PersonalTodo[] | null>(null);
  const { query, setQuery, matches, searching } = useSearch();
  const today = todayJalali();

  const load = useCallback(async () => {
    try {
      setItems(await api.get<PersonalTodo[]>('/api/todos/archive'));
    } catch (err) {
      toast.error(errorMessage(err));
      setItems((prev) => prev ?? []);
    }
  }, []);
  // Read again whenever the notes change (here or in another open page).
  useEffect(() => {
    void load();
  }, [load, todos]);

  const emptyArchive = async () => {
    if (!window.confirm('همهٔ یادداشت‌های آرشیو برای همیشه پاک شوند؟')) return;
    try {
      await api.delete('/api/todos/archive');
      setItems([]);
      toast.success('آرشیو خالی شد.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const listed = (items ?? []).filter(matches);
  const days = byDay(listed).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} aria-label="بازگشت به یادداشت‌های من" title="بازگشت به یادداشت‌های من" className="p-2 rounded-xl text-sky-800 hover:bg-sky-50">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="p-3 bg-muted text-white rounded-2xl shadow-lg">
          <Archive className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-ink">آرشیو یادداشت‌ها</h2>
          <p className="text-sm text-muted flex flex-wrap items-center gap-x-1">
            <span className="flex items-center gap-1 whitespace-nowrap"><Lock className="w-3.5 h-3.5" /> فقط خودتان می‌بینید</span>
            {items && <span className="whitespace-nowrap">· {toPersianDigits(items.length)} یادداشت</span>}
          </p>
        </div>
        {items && items.length > 0 && (
          <button type="button" onClick={() => void emptyArchive()} className="tap-area text-xs font-bold text-red-700 hover:underline flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> خالی کردن آرشیو
          </button>
        )}
      </div>

      <div className="bg-white border border-line/70 shadow-card rounded-3xl p-3 sm:p-4">
        <SearchBox value={query} onChange={setQuery} label="جستجو در آرشیو" />
      </div>

      {items === null ? (
        <p className="py-12 flex justify-center text-faint"><Loader2 className="w-5 h-5 animate-spin" aria-label="در حال بارگذاری" /></p>
      ) : listed.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {searching ? 'یادداشتی با این جستجو در آرشیو نیست.' : 'آرشیو خالی است. یادداشت‌های انجام‌شده را در صفحهٔ یادداشت‌ها با «بایگانی» به این‌جا بفرستید.'}
        </p>
      ) : (
        <DayGrid days={days} today={today} archived onChanged={() => void load()} />
      )}
    </div>
  );
};

interface DayGridProps {
  days: TodoDay[];
  today: string;
  onEdit?: (todo: PersonalTodo) => void;
  /** The cards of «آرشیو»: notes can only come back or be deleted. */
  archived?: boolean;
  onChanged?: () => void;
}

const DayGrid: React.FC<DayGridProps> = ({ days, ...rest }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
    {days.map((d) => (
      <DayCard key={d.date ?? 'none'} day={d} {...rest} />
    ))}
  </div>
);

/** One day: every note due that day, open ones first, with what is done struck through. */
const DayCard: React.FC<{ day: TodoDay } & Omit<DayGridProps, 'days'>> = ({ day, today, onEdit, archived = false, onChanged }) => {
  const { archiveDoneTodos } = usePortal();
  const done = day.items.filter((t) => t.doneAt);
  const left = day.items.length - done.length;
  const group = todoGroup(day.date, today);
  const title = day.date ? dayTitle(day.date, today) : { near: null, day: 'بدون تاریخ' };
  const heading = title.near ? `${title.near}، ${title.day}` : title.day;
  const tone = archived || left === 0 ? FINISHED_TONE : CARD_TONE[group];
  const late = !archived && group === 'overdue' && left > 0;

  return (
    <section aria-label={`کارهای ${heading}`} className={`rounded-2xl border p-3 space-y-2 shadow-xs ${tone}`}>
      <div className="flex items-center gap-2">
        <h3 className={`flex-1 min-w-0 text-sm font-black ${archived || left === 0 ? 'text-ink-soft' : GROUP_STYLE[group]}`}>
          {title.near && <span>{title.near}، </span>}
          <span className={title.near ? 'font-bold' : ''}>{title.day}</span>
          {late && <span className="ms-1 text-xs font-bold">(عقب‌افتاده)</span>}
        </h3>
        <span className="text-xs font-bold text-muted whitespace-nowrap">
          {archived ? `${toPersianDigits(day.items.length)} کار` : `${toPersianDigits(done.length)} از ${toPersianDigits(day.items.length)} انجام شد`}
        </span>
        {!archived && done.length > 0 && (
          <button
            type="button"
            onClick={() => void archiveDoneTodos(done.map((t) => t.id))}
            aria-label={`بایگانی انجام‌شده‌های ${heading}`}
            title="بایگانی انجام‌شده‌های این روز"
            className="p-1.5 rounded-lg text-muted hover:bg-white hover:text-sky-800"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
      </div>
      <ul className="divide-y divide-black/5">
        {day.items.map((t) => (
          <NoteRow key={t.id} todo={t} onEdit={onEdit ? () => onEdit(t) : undefined} archived={archived} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
};

const iconButton = 'p-1 rounded-lg text-muted hover:bg-white hover:text-sky-800';

/** One note in its day's card: its steps can be ticked right here. */
const NoteRow: React.FC<{ todo: PersonalTodo; onEdit?: () => void; archived: boolean; onChanged?: () => void }> = ({
  todo,
  onEdit,
  archived,
  onChanged,
}) => {
  const { updateTodo, deleteTodo, setActiveTab } = usePortal();
  const tick = useTickTodo();
  const [dating, setDating] = useState(false);
  const isDone = Boolean(todo.doneAt);
  const source = todoSource(todo.sourceType);
  const stepsDone = todo.steps.filter((s) => s.done).length;

  const toggleStep = (id: string) =>
    void updateTodo(todo.id, { steps: todo.steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  const restore = async () => {
    if (await updateTodo(todo.id, { archived: false })) {
      toast.success('به صفحهٔ یادداشت‌ها برگشت.');
      onChanged?.();
    }
  };
  const remove = async () => {
    if (!window.confirm(`«${todo.title}» برای همیشه پاک شود؟`)) return;
    if (await deleteTodo(todo.id)) onChanged?.();
  };

  return (
    <li aria-label={todo.title} className="py-1.5 first:pt-0 last:pb-0 space-y-1">
      {/* One line: tick, title with its small signs, then the buttons; a long title wraps beside them. */}
      <div className="flex items-start gap-1.5">
        {archived ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-label="انجام شد" />
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={isDone}
            aria-label={isDone ? `برگرداندن «${todo.title}» به یادداشت‌های باز` : `انجام شد: ${todo.title}`}
            onClick={(e) => {
              haptic();
              if (!isDone) pop(e.currentTarget.firstElementChild);
              return isDone ? void updateTodo(todo.id, { done: false }) : void tick(todo);
            }}
            className="p-0.5 rounded-lg hover:bg-white shrink-0"
          >
            {isDone ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-faint" />}
          </button>
        )}
        <div className="flex-1 min-w-0 pt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <h4 className={`min-w-0 text-sm font-black leading-snug break-words transition-colors ${isDone ? 'line-through text-faint' : 'text-ink'}`}>{todo.title}</h4>
          {isDone && <span className="px-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold whitespace-nowrap">انجام شد {formatDate(todo.doneAt)}</span>}
          {todo.repeat && (
            <span className="text-sky-800 text-xs flex items-center gap-0.5 whitespace-nowrap" title={repeatLabel(todo)}>
              <Repeat className="w-3 h-3" /> {repeatLabel(todo)}
            </span>
          )}
          {!isDone && todo.dueDate && (
            <span className="text-faint flex items-center gap-0.5 text-xs" title={todo.remind === 'none' ? 'بدون یادآوری' : todo.remind === 'both' ? 'یادآوری روز قبل و همان روز' : 'یادآوری صبح همان روز'}>
              {todo.remind === 'none' ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
              {todo.remind === 'both' && <span>۲</span>}
            </span>
          )}
          {todo.steps.length > 0 && (
            <span className="text-xs font-bold text-faint whitespace-nowrap">
              {toPersianDigits(stepsDone)} از {toPersianDigits(todo.steps.length)} گام
            </span>
          )}
        </div>
        <div className="flex items-center shrink-0">
          {archived ? (
            <>
              <button type="button" onClick={() => void restore()} aria-label={`برگرداندن ${todo.title} از آرشیو`} title="برگرداندن به صفحهٔ یادداشت‌ها" className={iconButton}>
                <ArchiveRestore className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => void remove()} aria-label={`پاک کردن ${todo.title}`} title="پاک کردن برای همیشه" className={`${iconButton} hover:text-red-700`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              {onEdit && (
                <button type="button" onClick={onEdit} aria-label={`ویرایش ${todo.title}`} title="ویرایش" className={iconButton}>
                  <Pencil className="w-4 h-4" />
                </button>
              )}
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
                <button type="button" onClick={() => void updateTodo(todo.id, { archived: true })} aria-label={`بایگانی ${todo.title}`} title="بایگانی" className={iconButton}>
                  <Archive className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {source && todo.sourceId && (
            <button type="button" onClick={() => setActiveTab(source.tab, todo.sourceId!)} aria-label={`رفتن به ${source.label}`} title={`رفتن به ${source.label}`} className={iconButton}>
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          {!isDone && (
            <button
              type="button"
              aria-pressed={todo.important}
              aria-label={todo.important ? `برداشتن ستارهٔ ${todo.title}` : `مهم: ${todo.title}`}
              title={todo.important ? 'مهم' : 'علامت مهم'}
              onClick={() => void updateTodo(todo.id, { important: !todo.important })}
              className={iconButton}
            >
              <Star className={`w-4 h-4 ${todo.important ? 'fill-amber-500 text-amber-500' : 'text-line-strong'}`} />
            </button>
          )}
        </div>
      </div>

      {todo.note && <p className="ps-7 text-xs text-ink-soft leading-relaxed whitespace-pre-line line-clamp-5">{todo.note}</p>}

      {todo.steps.length > 0 && (
        <ul className="ps-7 space-y-0.5">
          {todo.steps.map((s) => (
            <li key={s.id}>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={s.done} disabled={isDone} onChange={() => toggleStep(s.id)} className="mt-0.5 w-3.5 h-3.5 accent-sky-700" />
                <span className={s.done ? 'line-through text-faint' : 'text-ink'}>{s.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {dating && (
        <div className="ps-7">
          <QuickDueDates
            value=""
            only={todo.dueDate ? ['tomorrow', 'weekEnd', 'nextWeek'] : undefined}
            onPick={(date) => {
              setDating(false);
              void updateTodo(todo.id, { dueDate: date });
            }}
          />
        </div>
      )}
    </li>
  );
};
