import React, { useEffect, useMemo, useState } from 'react';
import moment from 'moment-jalaali';
import { ArrowLeft, Check, Footprints, Send } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { tabOn } from '../../lib/features';
import { toPersianDigits, todayJalali } from '../../lib/jalali';
import { inputClass } from '../common/Modal';
import { TaskFormModal } from '../tasks/TaskFormModal';
import { openGive, useThanks } from '../thanks/thanksStore';
import { DAY_PLAN_NOTES, DAY_STEP_LABELS, DAY_STEP_LIST, dayStepOrder, pickStep, type DayStepFacts, type DayStepKind } from '../../../shared/dayStep';
import type { Mood } from '../../../shared/mood';
import { addJalaliDays, TODO_TITLE_MAX } from '../../../shared/todos';
import type { PersonalTodo } from '../../types';
import { countStep, saveStepMemory, useStepMemory } from './stepStore';

const primary = 'px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50';
const quiet = 'px-2.5 py-1 rounded-lg border border-line bg-white hover:bg-surface text-[11px] font-bold text-ink-soft transition-colors';

/**
 * «یک قدم برای امروز»: after the mood, one step chosen from what really waits for the colleague
 * (shared/dayStep.ts), done right here where it can be. One a day; «امروز نه» closes it and each kind
 * can be switched off for good. On a hard day no work is suggested, only a quiet way to be heard.
 */
export const DayStep: React.FC<{ mood: Mood }> = ({ mood }) => {
  const { currentUser, appSettings, featureOn, isLoaded, news, polls, todos, tasks, trainings, setActiveTab, addTodo, answerTask } = usePortal();
  const thanks = useThanks();
  const userId = currentUser?.id ?? '';
  const memory = useStepMemory(userId);
  const today = todayJalali();
  // What the colleague did with the step in this visit, kept on screen until they leave the page.
  const [finished, setFinished] = useState<{ kind: DayStepKind; line: string } | null>(null);
  const [planned, setPlanned] = useState<PersonalTodo[]>([]);
  const [handing, setHanding] = useState<PersonalTodo | null>(null);

  const notesOn = featureOn('todos');
  const tasksOn = featureOn('tasks');
  const thanksOn = featureOn('recognition');
  const pendingAcks = useMemo(() => news.filter((n) => n.status === 'published' && n.requiresAck && !n.acknowledgedAt), [news]);
  const waiting = useMemo(() => (tasksOn ? tasks.mine.filter((t) => t.status === 'new') : []), [tasks.mine, tasksOn]);
  const openPoll = featureOn('polls') ? polls.find((p) => p.isActive && p.forMe && !p.hasVoted) : undefined;
  const weekAhead = addJalaliDays(today, 7);
  const course = featureOn('training')
    ? [...trainings].filter((t) => t.date > today && t.date <= weekAhead && !t.myStatus && t.instructorId !== userId).sort((a, b) => a.date.localeCompare(b.date))[0]
    : undefined;

  // Nothing is chosen before everything it is chosen from has arrived: an early guess would be the day's step.
  const ready =
    Boolean(userId) && isLoaded('news') && isLoaded('polls') && isLoaded('todos') && isLoaded('tasks') && isLoaded('trainings') && (!thanksOn || thanks.wallet !== null);

  const facts: DayStepFacts = {
    mood,
    hour: new Date().getHours(),
    weekday: (moment().day() + 1) % 7,
    pendingAcks: pendingAcks.length,
    tasksWaiting: waiting.length,
    notes: notesOn,
    notesToday: todos.filter((t) => !t.doneAt && t.dueDate === today).length,
    suggestions: tabOn(appSettings, 'suggestions'),
    coinsLeft: thanksOn ? (thanks.wallet?.left ?? 0) : 0,
    openPolls: openPoll ? 1 : 0,
    trainingSoon: Boolean(course),
  };
  // In the order whoever looks after «شروع روز» chose for everyone (the built-in one unless they did).
  const kind = !ready || finished ? null : pickStep(facts, memory, today, dayStepOrder(appSettings?.dayStepOrder));

  // The first time a kind is on screen today it becomes the day's step, and is counted once.
  useEffect(() => {
    if (!kind || (memory.last?.date === today && memory.last.kind === kind)) return;
    saveStepMemory(userId, { ...memory, last: { date: today, kind, state: 'open' } });
    countStep(kind, 'shown', today);
  }, [kind, memory, today, userId]);

  const settle = (step: DayStepKind, state: 'done' | 'closed', line = '') => {
    saveStepMemory(userId, { ...memory, last: { date: today, kind: step, state } });
    countStep(step, state, today);
    if (line) setFinished({ kind: step, line });
  };
  const mute = (step: DayStepKind) => {
    saveStepMemory(userId, { muted: [...new Set([...memory.muted, step])], last: { date: today, kind: step, state: 'closed' } });
    countStep(step, 'muted', today);
  };
  const go = (step: DayStepKind, tab: Parameters<typeof setActiveTab>[0], id?: string) => {
    settle(step, 'done');
    setActiveTab(tab, id);
  };

  if (finished) {
    return (
      <Frame>
        <p className="flex items-center gap-1.5 text-xs font-bold text-green-800" data-testid="day-step-done">
          <Check className="w-4 h-4 shrink-0" />
          {finished.line}
        </p>
        {finished.kind === 'plan' && planned.length > 0 && (
          <ul className="space-y-1.5">
            {planned.map((note) => (
              <li key={note.id} className="flex items-center justify-between gap-2 text-xs text-ink">
                <span className="truncate">{note.title}</span>
                {tasksOn && (tasks.recipients?.length ?? 0) > 0 && (
                  <button type="button" onClick={() => setHanding(note)} aria-label={`سپردن «${note.title}» به یک همکار`} className={`${quiet} shrink-0 flex items-center gap-1`}>
                    <Send className="w-3 h-3" />
                    بسپار به همکار
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {handing && <TaskFormModal initialTitle={handing.title} initialDueDate={handing.dueDate ?? today} onClose={() => setHanding(null)} />}
      </Frame>
    );
  }
  if (!kind) return null;

  const more = (n: number) => (n > DAY_STEP_LIST ? <p className="text-[11px] text-faint">و {toPersianDigits(n - DAY_STEP_LIST)} مورد دیگر</p> : null);
  const footer = (
    <div className="flex items-center gap-3 pt-1">
      <button type="button" onClick={() => settle(kind, 'closed')} className="text-[11px] font-bold text-muted hover:text-ink">
        امروز نه
      </button>
      <button type="button" onClick={() => mute(kind)} className="text-[11px] text-faint hover:text-ink" title={`«${DAY_STEP_LABELS[kind]}» دیگر پیشنهاد نمی‌شود`}>
        این را دیگر پیشنهاد نده
      </button>
    </div>
  );

  let body: React.ReactNode;
  switch (kind) {
    case 'care':
      body = (
        <>
          <p className="text-xs text-ink-soft leading-relaxed">اگر چیزی هست که باید شنیده شود، می‌توانید آن را ناشناس بنویسید.</p>
          <button type="button" onClick={() => go('care', 'suggestions')} className="text-xs font-bold text-brand-strong hover:underline flex items-center gap-1 w-fit">
            نوشتن پیام ناشناس
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </>
      );
      break;
    case 'acks':
      body = (
        <>
          <p className="text-xs font-bold text-ink">{toPersianDigits(pendingAcks.length)} بخشنامه منتظر تأیید شماست.</p>
          <ul className="space-y-1">
            {pendingAcks.slice(0, DAY_STEP_LIST).map((n) => (
              <li key={n.id} className="text-xs text-ink-soft truncate">{n.title}</li>
            ))}
          </ul>
          {more(pendingAcks.length)}
          <button type="button" onClick={() => go('acks', 'news', pendingAcks[0]?.id)} className={primary}>
            خواندن و تأیید
          </button>
        </>
      );
      break;
    case 'tasksWaiting':
      body = (
        <>
          <p className="text-xs font-bold text-ink">{toPersianDigits(waiting.length)} کار منتظر پاسخ شماست؛ می‌پذیرید؟</p>
          <ul className="space-y-1.5">
            {waiting.slice(0, DAY_STEP_LIST).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-xs text-ink truncate">{t.title}</span>
                  <span className="block text-[11px] text-muted truncate">از {t.from.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`پذیرفتن ${t.title}`}
                  onClick={async () => {
                    if (await answerTask(t.id, 'accepted')) settle('tasksWaiting', 'done', waiting.length > 1 ? 'پذیرفتید. بقیه در «کارهای ارجاعی» منتظرند.' : 'پذیرفتید؛ به همکارتان خبر داده شد.');
                  }}
                  className={`${quiet} shrink-0`}
                >
                  می‌پذیرم
                </button>
              </li>
            ))}
          </ul>
          {more(waiting.length)}
          <button type="button" onClick={() => go('tasksWaiting', 'tasks')} className="text-xs font-bold text-brand-strong hover:underline w-fit">
            رد کردن و جزئیات در «کارهای ارجاعی»
          </button>
        </>
      );
      break;
    case 'plan':
      body = <PlanForm onSave={savePlan} />;
      break;
    case 'thanks':
      body = (
        <>
          <p className="text-xs text-ink-soft leading-relaxed">کسی در این حال خوب سهم داشت؟ از او قدردانی کنید.</p>
          <button
            type="button"
            onClick={() => {
              settle('thanks', 'done');
              openGive();
            }}
            className={primary}
          >
            قدردانی کن
          </button>
        </>
      );
      break;
    case 'poll':
      body = (
        <>
          <p className="text-xs text-ink-soft leading-relaxed">یک نظرسنجی باز دارید: <strong className="text-ink">{openPoll?.title}</strong></p>
          <button type="button" onClick={() => go('poll', 'polls', openPoll?.id)} className={primary}>
            شرکت در نظرسنجی
          </button>
        </>
      );
      break;
    case 'training':
      body = (
        <>
          <p className="text-xs text-ink-soft leading-relaxed">این هفته دورهٔ <strong className="text-ink">{course?.title}</strong> برگزار می‌شود.</p>
          <button type="button" onClick={() => go('training', 'training', course?.id)} className={primary}>
            جزئیات و ثبت‌نام
          </button>
        </>
      );
      break;
    case 'coins':
      body = (
        <>
          <p className="text-xs text-ink-soft leading-relaxed">{toPersianDigits(thanks.wallet?.left ?? 0)} سکه تا آخر ماه دارید. این هفته چه کسی کارتان را راحت‌تر کرد؟</p>
          <button
            type="button"
            onClick={() => {
              settle('coins', 'done');
              openGive();
            }}
            className={primary}
          >
            قدردانی کن
          </button>
        </>
      );
      break;
  }

  return (
    <Frame kind={kind}>
      {body}
      {footer}
    </Frame>
  );

  async function savePlan(titles: string[]) {
    const created: PersonalTodo[] = [];
    for (const title of titles) {
      const note = await addTodo({ title, dueDate: today }, { quiet: true });
      if (note) created.push(note);
    }
    if (created.length === 0) return false;
    setPlanned(created);
    settle('plan', 'done', `${toPersianDigits(created.length)} کار برای امروز در «یادداشت‌های من» ثبت شد.`);
    return true;
  }
};

const Frame: React.FC<{ kind?: DayStepKind; children: React.ReactNode }> = ({ kind, children }) => (
  <section aria-labelledby="day-step-title" className="space-y-2.5" data-testid="day-step" data-step={kind}>
    <div className="flex items-center gap-2 text-ink-soft">
      <Footprints className="w-4 h-4" />
      <h4 id="day-step-title" className="text-xs font-black">یک قدم برای امروز</h4>
    </div>
    {children}
  </section>
);

/** «سه کار مهم امروزتان چیست؟»: three lines in the card itself; each becomes a note due today. */
const PlanForm: React.FC<{ onSave: (titles: string[]) => Promise<boolean> }> = ({ onSave }) => {
  const [titles, setTitles] = useState<string[]>(() => Array.from({ length: DAY_PLAN_NOTES }, () => ''));
  const [busy, setBusy] = useState(false);
  const written = titles.map((t) => t.trim()).filter(Boolean);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || written.length === 0) return;
        setBusy(true);
        await onSave(written);
        setBusy(false);
      }}
    >
      <p className="text-xs font-bold text-ink">سه کار مهم امروزتان چیست؟</p>
      {titles.map((title, i) => (
        <input
          key={i}
          value={title}
          onChange={(e) => setTitles((list) => list.map((t, j) => (j === i ? e.target.value : t)))}
          maxLength={TODO_TITLE_MAX}
          aria-label={`کار ${['اول', 'دوم', 'سوم'][i] ?? toPersianDigits(i + 1)}`}
          placeholder={['مهم‌ترین کار امروز', 'کار دوم', 'کار سوم'][i] ?? ''}
          className={`${inputClass} text-xs`}
        />
      ))}
      <p className="text-[11px] text-faint">در «یادداشت‌های من» با سررسید امروز ثبت می‌شود. فقط خودتان آن‌ها را می‌بینید.</p>
      <button type="submit" disabled={busy || written.length === 0} className={primary}>
        {busy ? 'در حال ثبت...' : 'ثبت'}
      </button>
    </form>
  );
};
