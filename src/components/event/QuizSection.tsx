import React, { useEffect, useId, useMemo, useState } from 'react';
import { Check, HelpCircle, Plus, RotateCcw, Trash2, Trophy } from 'lucide-react';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { usePortal } from '../../context/PortalContext';
import { api, PersonAvatar, useEventAction } from './eventUi';
import { QUIZ_COLORS, QUIZ_MAX, QUIZ_OPTION_MAX, QUIZ_SECONDS, QUIZ_TEXT_MAX } from '../../../shared/specialEvents';
import { toLatinDigits, toPersianDigits } from '../../lib/jalali';
import type { EventQuiz, EventView } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';

/** Milliseconds the server's clock is ahead of this device's (phones' clocks may be off). */
export const useServerOffset = (serverNow: string) => useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);

/** Seconds left on the question on now, ticking four times a second. */
export function useQuizLeft(current: EventQuiz['current'], offset: number) {
  const [, tick] = useState(0);
  const running = Boolean(current && !current.revealed);
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [running]);
  if (!current || current.revealed) return 0;
  return Math.max(0, Math.ceil((new Date(current.closesAt).getTime() - (Date.now() + offset)) / 1000));
}

/** The four colored options; on a phone they are the answer buttons. */
export const QuizOptions: React.FC<{
  current: NonNullable<EventQuiz['current']>;
  onPick?: (i: number) => void;
  disabled?: boolean;
  big?: boolean;
}> = ({ current, onPick, disabled, big }) => {
  const total = current.counts?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className={`grid grid-cols-2 ${big ? 'gap-[1.4vw]' : 'gap-2'}`} role={onPick ? 'group' : undefined} aria-label={onPick ? 'گزینه‌ها' : undefined}>
      {current.options.map((option, i) => {
        const color = QUIZ_COLORS[i];
        const right = current.correct === i;
        const dim = current.revealed && !right;
        const mine = current.myChoice === i;
        const content = (
          <>
            <span className={`${big ? 'text-[1.8vw] px-[0.8vw]' : 'text-[11px] px-1.5'} rounded-lg bg-black/20 font-black shrink-0`}>{color.letter}</span>
            <span className="flex-1 min-w-0 break-words">{option}</span>
            {current.revealed && right && <Check className={big ? 'w-[3vw] h-[3vw]' : 'w-5 h-5'} aria-label="جواب درست" />}
            {current.counts && current.revealed && (
              <span className={`${big ? 'text-[2vw]' : 'text-xs'} font-black tabular-nums`}>{toPersianDigits(total ? Math.round((current.counts[i] * 100) / total) : 0)}٪</span>
            )}
          </>
        );
        const className = `flex items-center gap-2 text-right text-white font-bold rounded-2xl transition ${big ? 'text-[2.6vw] p-[1.4vw] min-h-[9vw]' : 'text-sm p-3 min-h-16'} ${dim ? 'opacity-35' : ''} ${mine ? 'ring-4 ring-offset-2 ring-amber-300' : ''}`;
        return onPick ? (
          <button key={i} type="button" disabled={disabled} onClick={() => onPick(i)} aria-pressed={mine} className={`${className} disabled:cursor-default`} style={{ background: color.bg }}>
            {content}
          </button>
        ) : (
          <div key={i} className={className} style={{ background: color.bg }}>
            {content}
          </div>
        );
      })}
    </div>
  );
};

/** On every phone while a question is on: the question, the clock and four big buttons. */
export const QuizPlayCard: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const offset = useServerOffset(view.serverNow);
  const { quiz } = view;
  const left = useQuizLeft(quiz.current, offset);
  const [busy, setBusy] = useState(false);
  const current = quiz.current;
  if (!current || !quiz.live) return null;
  const answered = current.myChoice !== null;
  const timeUp = !current.revealed && left === 0;

  const pick = async (choice: number) => {
    if (busy || answered) return;
    setBusy(true);
    await run(() => api.put(`/api/event_quiz/${current.id}/answer`, { choice }));
    setBusy(false);
  };

  return (
    <section id="event-quiz" className="rounded-3xl p-4 sm:p-5 space-y-3 bg-indigo-950 text-white" aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-2">
        <HelpCircle className="w-5 h-5 text-amber-300" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black">
          مسابقهٔ همه · سؤال {toPersianDigits(current.index)} از {toPersianDigits(quiz.count)}
        </h2>
        <span className={`ms-auto text-2xl font-black tabular-nums ${left <= 5 && !current.revealed ? 'text-red-300' : 'text-amber-300'}`} aria-live="off">
          {current.revealed ? '' : toPersianDigits(left)}
        </span>
      </div>
      <p className="text-lg font-black leading-relaxed">{current.text}</p>
      <QuizOptions current={current} onPick={quiz.canPlay ? pick : undefined} disabled={!quiz.canPlay || answered || timeUp || current.revealed || busy} />
      <p className="text-xs text-white/80" aria-live="polite">
        {current.revealed
          ? current.myChoice === null
            ? 'به این سؤال جواب ندادید.'
            : current.myChoice === current.correct
              ? `آفرین! ${toPersianDigits(current.myPoints ?? 0)} امتیاز گرفتید.`
              : 'این بار نشد؛ سؤال بعدی!'
          : answered
            ? 'جوابتان ثبت شد؛ منتظر نمایش جواب بمانید.'
            : timeUp
              ? 'وقت تمام شد.'
              : quiz.canPlay
                ? 'سریع‌تر جواب بدهید تا امتیاز بیشتری بگیرید.'
                : 'برگزارکنندگان که سؤال‌ها را نوشته‌اند جواب نمی‌دهند.'}
        {quiz.me && current.revealed && ` · جمع شما: ${toPersianDigits(quiz.me.points)} (نفر ${toPersianDigits(quiz.me.rank)})`}
      </p>
    </section>
  );
};

/** The table of points: right and fast answers. */
export const QuizLeaders: React.FC<{ view: EventView }> = ({ view }) => {
  const { currentUser } = usePortal();
  const { leaders } = view.quiz;
  if (leaders.length === 0) return null;
  return (
    <ol className="space-y-1">
      {leaders.map((l) => (
        <li key={l.employeeId} className={`flex items-center gap-2 text-xs rounded-xl px-2 py-1 ${l.employeeId === currentUser?.id ? 'bg-amber-50' : ''}`}>
          <span className="w-5 text-center font-black text-muted tabular-nums">{toPersianDigits(l.rank)}</span>
          <PersonAvatar person={view.people[l.employeeId]} className="w-6 h-6 rounded-full text-[10px]" />
          <span className="flex-1 min-w-0 truncate font-bold text-ink">{view.people[l.employeeId]?.name ?? 'همکار'}</span>
          <span className="text-muted tabular-nums">{toPersianDigits(l.points)} امتیاز</span>
        </li>
      ))}
    </ol>
  );
};

type Draft = { id?: string; text: string; options: string[]; correct: number; seconds: string };

/** The organizers write the questions before the night. */
export const QuizEditor: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const { quiz, me, event } = view;
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me.isOrganizer) return null;

  const start = () =>
    setDrafts(
      quiz.questions.length
        ? quiz.questions.map((q) => ({ id: q.id, text: q.text, options: [...q.options], correct: q.correct, seconds: toPersianDigits(q.seconds) }))
        : [{ text: '', options: ['', '', '', ''], correct: 0, seconds: toPersianDigits(QUIZ_SECONDS.default) }],
    );
  const change = (i: number, patch: Partial<Draft>) => setDrafts((d) => d && d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (!drafts) return;
    setBusy(true);
    const questions = drafts.map((d) => {
      const options = d.options.map((o) => o.trim()).filter(Boolean);
      return { id: d.id, text: d.text.trim(), options, correct: Math.min(d.correct, Math.max(0, options.length - 1)), seconds: Number(toLatinDigits(d.seconds)) || QUIZ_SECONDS.default };
    });
    const ok = await run(() => api.put(`/api/special_events/${event.id}/quiz_questions`, { questions }), 'سؤال‌ها ذخیره شد.');
    if (ok) setDrafts(null);
    setBusy(false);
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <HelpCircle className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          سؤال‌های مسابقهٔ همه
        </h2>
        <span className="text-[11px] text-muted">
          {toPersianDigits(quiz.count)} سؤال · شب برنامه از «ریموت صفحهٔ بزرگ» یکی‌یکی باز می‌شوند و همه با گوشی جواب می‌دهند.
        </span>
      </div>
      {!drafts ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={start} className={secondaryButtonClass}>
            {quiz.count ? 'ویرایش سؤال‌ها' : 'نوشتن سؤال‌ها'}
          </button>
          {quiz.asked > 0 && (
            <button
              type="button"
              onClick={() => window.confirm('همهٔ جواب‌ها پاک شود و مسابقه از اول شروع شود؟ (مثلاً بعد از تمرین)') && void run(() => api.post(`/api/special_events/${event.id}/quiz/reset`), 'مسابقه از اول شد.')}
              className={secondaryButtonClass}
            >
              <RotateCcw className="w-4 h-4" /> از اول (پاک کردن جواب‌ها)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d, i) => (
            <fieldset key={d.id ?? `new-${i}`} className="rounded-2xl border border-line p-3 space-y-2">
              <legend className="px-1 text-xs font-black text-ink">سؤال {toPersianDigits(i + 1)}</legend>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor={`${id}-q${i}`}>
                  متن سؤال {toPersianDigits(i + 1)}
                </label>
                <input id={`${id}-q${i}`} className={`${inputClass} flex-1`} maxLength={QUIZ_TEXT_MAX} placeholder="متن سؤال" value={d.text} onChange={(e) => change(i, { text: e.target.value })} />
                <label className="sr-only" htmlFor={`${id}-s${i}`}>
                  ثانیه‌های سؤال {toPersianDigits(i + 1)}
                </label>
                <input id={`${id}-s${i}`} className={`${inputClass} w-16 text-center`} inputMode="numeric" title="ثانیه" value={d.seconds} onChange={(e) => change(i, { seconds: e.target.value })} />
                <button type="button" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-danger-700" aria-label={`حذف سؤال ${toPersianDigits(i + 1)}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {d.options.map((o, k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`${id}-c${i}`}
                      checked={d.correct === k}
                      onChange={() => change(i, { correct: k })}
                      aria-label={`گزینهٔ ${QUIZ_COLORS[k].letter} درست است`}
                      className="accent-emerald-600 w-4 h-4"
                    />
                    <input
                      className={`${inputClass} flex-1`}
                      maxLength={QUIZ_OPTION_MAX}
                      placeholder={`گزینهٔ ${QUIZ_COLORS[k].letter}${k >= 2 ? ' (اختیاری)' : ''}`}
                      aria-label={`سؤال ${toPersianDigits(i + 1)}، گزینهٔ ${QUIZ_COLORS[k].letter}`}
                      value={o}
                      onChange={(e) => change(i, { options: d.options.map((x, j) => (j === k ? e.target.value : x)) })}
                      style={{ borderInlineStartColor: QUIZ_COLORS[k].bg, borderInlineStartWidth: 4 }}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-[11px] text-muted">دایرهٔ کنار هر گزینه یعنی «این جواب درست است». زمان هر سؤال بین {toPersianDigits(QUIZ_SECONDS.min)} تا {toPersianDigits(QUIZ_SECONDS.max)} ثانیه است.</p>
          <div className="flex flex-wrap gap-2">
            {drafts.length < QUIZ_MAX && (
              <button type="button" onClick={() => setDrafts([...drafts, { text: '', options: ['', '', '', ''], correct: 0, seconds: toPersianDigits(QUIZ_SECONDS.default) }])} className={secondaryButtonClass}>
                <Plus className="w-4 h-4" /> سؤال تازه
              </button>
            )}
            <button type="button" disabled={busy} onClick={save} className={primaryButtonClass}>
              ذخیرهٔ سؤال‌ها
            </button>
            <button type="button" onClick={() => setDrafts(null)} className="text-xs text-muted underline">
              انصراف
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

/** On the remote: open the next question, show its answer, then the table. */
export const QuizRemote: React.FC<{ view: EventView; onBoard: () => void }> = ({ view, onBoard }) => {
  const run = useEventAction();
  const { reloadSpecialEvent } = usePortal();
  const id = useId();
  const offset = useServerOffset(view.serverNow);
  const { quiz, event } = view;
  const current = quiz.current;
  const left = useQuizLeft(current, offset);
  const waiting = Boolean(current && !current.revealed);
  // While a question is on, the count of answers comes in every two seconds.
  useEffect(() => {
    if (!waiting) return undefined;
    const t = window.setInterval(() => void reloadSpecialEvent(), 2000);
    return () => window.clearInterval(t);
  }, [waiting, reloadSpecialEvent]);
  if (quiz.count === 0) return null;
  const done = quiz.asked >= quiz.count;

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-black text-ink flex items-center gap-1.5">
        <HelpCircle className="w-4 h-4 text-red-700" aria-hidden /> مسابقهٔ همه
      </h2>
      {!quiz.live ? (
        <p className="text-xs text-muted">سؤال‌ها بعد از شروع برنامه باز می‌شوند ({toPersianDigits(quiz.count)} سؤال آماده است).</p>
      ) : (
        <>
          {current && (
            <div className="rounded-2xl bg-surface p-3 space-y-1">
              <p className="text-xs text-muted">
                سؤال {toPersianDigits(current.index)} از {toPersianDigits(quiz.count)} ·{' '}
                {current.revealed ? 'جواب نشان داده شد' : left > 0 ? `${toPersianDigits(left)} ثانیه مانده` : 'وقت تمام شد'} · {toPersianDigits(current.answered)} جواب
              </p>
              <p className="text-sm font-bold text-ink">{current.text}</p>
              {current.correct !== null && <p className="text-xs text-emerald-700">جواب درست: {current.options[current.correct]}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {waiting ? (
              <button type="button" onClick={() => void run(() => api.post(`/api/special_events/${event.id}/quiz/reveal`))} className={primaryButtonClass}>
                نمایش جواب
              </button>
            ) : (
              <button type="button" disabled={done} onClick={() => void run(() => api.post(`/api/special_events/${event.id}/quiz/next`, {}))} className={primaryButtonClass}>
                {done ? 'همهٔ سؤال‌ها پرسیده شد' : current ? 'سؤال بعدی' : 'شروع: سؤال اول'}
              </button>
            )}
            <button type="button" disabled={waiting || quiz.leaders.length === 0} onClick={onBoard} className={secondaryButtonClass}>
              <Trophy className="w-4 h-4" /> جدول امتیاز روی صفحه
            </button>
          </div>
        </>
      )}
    </section>
  );
};
