import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, ClipboardList, Lock, Pencil, PlayCircle, RotateCcw, Send, Trash2, Undo2, X, XCircle } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { PageHeader } from '../common/PageHeader';
import { EmptyState } from '../common/Placeholder';
import { Avatar } from '../common/Avatar';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { featureInPreview } from '../../lib/features';
import { toPersianDigits, todayJalali } from '../../lib/jalali';
import { shortDue } from '../todos/todoText';
import { TASK_REPLY_MAX, taskOpen, taskStatus, type TaskAnswer } from '../../../shared/tasks';
import type { AssignedTask, TaskPerson } from '../../types';
import { TaskFormModal } from './TaskFormModal';

type View = 'mine' | 'given';

const byDue = (a: AssignedTask, b: AssignedTask) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);

/** The due date in a few words, red once it has passed on an unfinished task. */
const Due: React.FC<{ task: AssignedTask }> = ({ task }) => {
  const today = todayJalali();
  const late = taskOpen(task.status) && task.dueDate < today;
  const soon = taskOpen(task.status) && task.dueDate === today;
  return (
    <span className={`text-xs font-bold whitespace-nowrap ${late ? 'text-red-700' : soon ? 'text-amber-800' : 'text-muted'}`}>
      موعد: {shortDue(task.dueDate, today)}
    </span>
  );
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = taskStatus(status);
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${s.tone}`}>{s.label}</span>;
};

const PersonLine: React.FC<{ person: TaskPerson; prefix: string }> = ({ person, prefix }) => {
  const [first, ...rest] = person.name.split(' ');
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted min-w-0">
      <Avatar src={person.avatarUrl} firstName={first ?? ''} lastName={rest.join(' ')} className="w-5 h-5 rounded-full text-[10px]" />
      <span className="truncate">
        {prefix} <span className="font-bold text-ink-soft">{person.name}</span>
      </span>
    </span>
  );
};

/**
 * «کارهای ارجاعی»: the work colleagues handed to this person, and the work this person handed out.
 * Only the two people on a task see it; managers have no view of it.
 */
export const TasksPage: React.FC = () => {
  const { tasks, appSettings } = usePortal();
  const [view, setView] = useState<View>(() => (tasks.mine.some((t) => taskOpen(t.status)) || tasks.given.length === 0 ? 'mine' : 'given'));
  const [writing, setWriting] = useState(false);
  const mineOpen = tasks.mine.filter((t) => taskOpen(t.status)).length;
  const givenOpen = tasks.given.filter((t) => taskOpen(t.status)).length;

  const tabs: { id: View; label: string; count: number }[] = [
    { id: 'mine', label: 'به من سپرده‌اند', count: mineOpen },
    { id: 'given', label: 'سپرده‌ام', count: givenOpen },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<ClipboardList />}
        title="کارهای ارجاعی"
        descriptionOnPhone
        description={
          <span className="flex flex-wrap items-center gap-x-1">
            <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> هر کار را فقط سپارنده و گیرنده‌اش می‌بینند.</span>
            {featureInPreview(appSettings, 'tasks') && <span className="px-2 py-0.5 text-xs font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>}
          </span>
        }
      >
        <button type="button" onClick={() => setWriting(true)} className={primaryButtonClass}>
          <Send className="w-4 h-4" /> سپردن کار
        </button>
      </PageHeader>

      <div className="flex gap-1.5" role="tablist" aria-label="کارهای ارجاعی">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={`px-4 py-2 text-sm font-bold rounded-full border flex items-center gap-1.5 transition-colors ${
              view === t.id ? 'bg-brand-deep border-brand-deep text-white' : 'bg-white border-line text-ink-soft hover:border-brand-deep'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className={`text-xs ${view === t.id ? 'text-white/80' : 'text-faint'}`}>{toPersianDigits(t.count)} باز</span>}
          </button>
        ))}
      </div>

      {view === 'mine' ? <MineView /> : <GivenView onAssign={() => setWriting(true)} />}

      {writing && <TaskFormModal onClose={() => setWriting(false)} />}
    </div>
  );
};

const Section: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <section className="space-y-2">
    <h2 className="text-sm font-black text-muted">
      {title} <span className="font-bold">({toPersianDigits(count)})</span>
    </h2>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">{children}</div>
  </section>
);

const cardClass = 'bg-white border border-line/70 shadow-card rounded-2xl p-3 sm:p-4 space-y-2';

/** Work handed to this person: waiting for an answer, being done, finished. */
const MineView: React.FC = () => {
  const { tasks } = usePortal();
  const waiting = tasks.mine.filter((t) => t.status === 'new').sort(byDue);
  const doing = tasks.mine.filter((t) => t.status === 'accepted' || t.status === 'in_progress').sort(byDue);
  const finished = tasks.mine.filter((t) => !taskOpen(t.status)).sort((a, b) => (b.statusAt ?? '').localeCompare(a.statusAt ?? ''));

  if (tasks.mine.length === 0) {
    return <EmptyState icon={<ClipboardList />} title="کاری به شما سپرده نشده است." hint="وقتی همکاری کاری به شما بسپارد، این‌جا و در زنگولهٔ اعلان‌ها می‌آید." />;
  }
  return (
    <div className="space-y-6">
      {waiting.length > 0 && (
        <Section title="منتظر پاسخ شما" count={waiting.length}>
          {waiting.map((t) => <MineCard key={t.id} task={t} />)}
        </Section>
      )}
      {doing.length > 0 && (
        <Section title="در دست انجام" count={doing.length}>
          {doing.map((t) => <MineCard key={t.id} task={t} />)}
        </Section>
      )}
      {finished.length > 0 && (
        <Section title="تمام‌شده" count={finished.length}>
          {finished.map((t) => <MineCard key={t.id} task={t} />)}
        </Section>
      )}
    </div>
  );
};

/** One task handed to this person, with the answers that fit its status. */
const MineCard: React.FC<{ task: AssignedTask }> = ({ task }) => {
  const { answerTask, removeTask } = usePortal();
  // «رد می‌کنم» and «انجام شد» can carry a short answer for the one who handed it over.
  const [answering, setAnswering] = useState<'declined' | 'done' | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const answer = async (status: TaskAnswer, text?: string) => {
    setBusy(true);
    const ok = await answerTask(task.id, status, text);
    setBusy(false);
    if (ok) {
      setAnswering(null);
      setReply('');
    }
  };

  return (
    <article aria-label={task.title} className={cardClass}>
      <div className="flex items-start gap-2">
        <h3 className={`flex-1 min-w-0 text-sm font-black break-words ${task.status === 'done' ? 'line-through text-faint' : 'text-ink'}`}>{task.title}</h3>
        <StatusPill status={task.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PersonLine person={task.from} prefix="از" />
        <Due task={task} />
      </div>
      {task.note && <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-line">{task.note}</p>}
      {task.reply && !taskOpen(task.status) && <p className="text-xs text-muted">پاسخ شما: {task.reply}</p>}

      {answering ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void answer(answering, reply.trim());
          }}
          className="space-y-2"
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={TASK_REPLY_MAX}
            aria-label={answering === 'declined' ? 'دلیل رد کردن' : 'توضیح کوتاه'}
            placeholder={answering === 'declined' ? 'دلیل (اختیاری)، مثلاً «این هفته مرخصی هستم»' : 'توضیح کوتاه (اختیاری)، مثلاً «فایل را ایمیل کردم»'}
            className={inputClass}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAnswering(null)} className={secondaryButtonClass}>انصراف</button>
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {answering === 'declined' ? 'رد کردن کار' : 'ثبت «انجام شد»'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {task.status === 'new' && (
            <>
              <ActionButton icon={<Check />} label="می‌پذیرم" onClick={() => void answer('accepted')} disabled={busy} strong />
              <ActionButton icon={<XCircle />} label="رد می‌کنم" onClick={() => setAnswering('declined')} disabled={busy} />
            </>
          )}
          {(task.status === 'accepted' || task.status === 'new') && (
            <ActionButton icon={<PlayCircle />} label="در حال انجام" onClick={() => void answer('in_progress')} disabled={busy} />
          )}
          {taskOpen(task.status) && <ActionButton icon={<CheckCircle2 />} label="انجام شد" onClick={() => setAnswering('done')} disabled={busy} strong={task.status !== 'new'} />}
          {task.status === 'in_progress' && <ActionButton icon={<XCircle />} label="نمی‌توانم انجام دهم" onClick={() => setAnswering('declined')} disabled={busy} />}
          {!taskOpen(task.status) && (
            <>
              <ActionButton icon={<RotateCcw />} label={task.status === 'done' ? 'باز کردن دوباره' : 'پذیرفتن'} onClick={() => void answer(task.status === 'done' ? 'in_progress' : 'accepted')} disabled={busy} />
              <ActionButton icon={<Trash2 />} label="برداشتن از فهرست" onClick={() => void removeTask(task)} disabled={busy} />
            </>
          )}
        </div>
      )}
    </article>
  );
};

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; strong?: boolean }> = ({
  icon,
  label,
  onClick,
  disabled,
  strong,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1 disabled:opacity-50 [&>svg]:w-3.5 [&>svg]:h-3.5 ${
      strong ? 'bg-brand-deep border-brand-deep text-white hover:opacity-90' : 'bg-white border-line text-ink-soft hover:border-brand-deep'
    }`}
  >
    {icon}
    {label}
  </button>
);

/** Work this person handed out: one card per task, with how far each colleague got. */
const GivenView: React.FC<{ onAssign: () => void }> = ({ onAssign }) => {
  const { tasks } = usePortal();
  const groups = useMemo(() => {
    const map = new Map<string, AssignedTask[]>();
    for (const t of tasks.given) map.set(t.groupId, [...(map.get(t.groupId) ?? []), t]);
    return [...map.values()].map((copies) => copies.sort((a, b) => a.to.name.localeCompare(b.to.name, 'fa')));
  }, [tasks.given]);
  const open = groups.filter((g) => g.some((t) => taskOpen(t.status))).sort((a, b) => byDue(a[0], b[0]));
  const finished = groups.filter((g) => g.every((t) => !taskOpen(t.status))).sort((a, b) => b[0].updatedAt.localeCompare(a[0].updatedAt));

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Send />}
        title="هنوز کاری به همکاران نسپرده‌اید."
        hint="با «سپردن کار» کاری را با موعد و توضیح به یک یا چند همکار بدهید و این‌جا ببینید به کجا رسیده است."
        action={<button type="button" onClick={onAssign} className={primaryButtonClass}><Send className="w-4 h-4" /> سپردن کار</button>}
      />
    );
  }
  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <Section title="در جریان" count={open.length}>
          {open.map((g) => <GivenCard key={g[0].groupId} copies={g} />)}
        </Section>
      )}
      {finished.length > 0 && (
        <Section title="تمام‌شده" count={finished.length}>
          {finished.map((g) => <GivenCard key={g[0].groupId} copies={g} />)}
        </Section>
      )}
    </div>
  );
};

const GivenCard: React.FC<{ copies: AssignedTask[] }> = ({ copies }) => {
  const { removeTask } = usePortal();
  const [editing, setEditing] = useState(false);
  const first = copies[0];
  const anyOpen = copies.some((t) => taskOpen(t.status));
  const done = copies.filter((t) => t.status === 'done').length;

  const takeBack = (task: AssignedTask) => {
    if (taskOpen(task.status) && !window.confirm(`کار «${task.title}» از ${task.to.name} پس گرفته شود؟ به او خبر داده می‌شود.`)) return;
    void removeTask(task);
  };
  const clearAll = async () => {
    for (const t of copies) await removeTask(t);
  };

  return (
    <article aria-label={first.title} className={cardClass}>
      <div className="flex items-start gap-2">
        <h3 className="flex-1 min-w-0 text-sm font-black text-ink break-words">{first.title}</h3>
        {copies.length > 1 && (
          <span className="text-xs font-bold text-muted whitespace-nowrap">
            {toPersianDigits(done)} از {toPersianDigits(copies.length)} انجام شد
          </span>
        )}
        {anyOpen && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`ویرایش ${first.title}`} title="ویرایش" className="p-1 rounded-lg text-muted hover:bg-surface-soft hover:text-brand-deep">
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {!anyOpen && (
          <button type="button" onClick={() => void clearAll()} aria-label={`برداشتن ${first.title} از فهرست`} title="برداشتن از فهرست" className="p-1 rounded-lg text-muted hover:bg-surface-soft hover:text-red-700">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <Due task={copies.find((t) => taskOpen(t.status)) ?? first} />
      {first.note && <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-line">{first.note}</p>}
      <ul className="divide-y divide-black/5 border-t border-black/5">
        {copies.map((t) => (
          <li key={t.id} className="py-1.5 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0"><PersonLine person={t.to} prefix="به" /></span>
              <StatusPill status={t.status} />
              {taskOpen(t.status) ? (
                <button type="button" onClick={() => takeBack(t)} aria-label={`پس گرفتن کار از ${t.to.name}`} title="پس گرفتن کار" className="p-1 rounded-lg text-faint hover:text-red-700">
                  <Undo2 className="w-4 h-4" />
                </button>
              ) : (
                anyOpen && (
                  <button type="button" onClick={() => void removeTask(t)} aria-label={`برداشتن ${t.to.name} از فهرست`} title="برداشتن از فهرست" className="p-1 rounded-lg text-faint hover:text-red-700">
                    <X className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
            {t.reply && <p className="ps-7 text-xs text-muted">«{t.reply}»</p>}
          </li>
        ))}
      </ul>
      {editing && <TaskFormModal task={copies.find((t) => taskOpen(t.status)) ?? first} onClose={() => setEditing(false)} />}
    </article>
  );
};
