import React, { useState } from 'react';
import { Check, MessageCircleQuestion } from 'lucide-react';
import toast from 'react-hot-toast';
import { haptic } from '../../lib/feedback';
import { toPersianDigits } from '../../lib/jalali';
import type { DayQuestionToday } from '../../../shared/dayQuestion';
import { MOOD_MIN_ANSWERS } from '../../../shared/mood';
import { answerDayQuestion } from './questionStore';

const optionClass =
  'px-3 py-2 rounded-xl border border-line bg-white hover:bg-brand-soft hover:border-red-300/50 hover:text-brand-strong text-xs font-bold text-ink-soft transition-colors disabled:opacity-60 disabled:cursor-wait';

/**
 * «پرسش روز», asked: one question that is new every day, answered with one tap. It can be passed
 * over; what colleagues said is shown only after answering.
 */
export const DayQuestionAsk: React.FC<{ today: DayQuestionToday; onSkip: () => void; skipLabel?: string; onAnswered?: () => void }> = ({
  today,
  onSkip,
  skipLabel = 'رد شدن',
  onAnswered,
}) => {
  const [busy, setBusy] = useState<number | null>(null);
  if (!today.question) return null;
  const choose = async (option: number) => {
    if (busy !== null) return;
    haptic();
    setBusy(option);
    const problem = await answerDayQuestion(option);
    setBusy(null);
    if (problem) toast.error(problem);
    else onAnswered?.();
  };
  return (
    <section aria-labelledby="day-question-title" className="space-y-2.5" data-testid="day-question">
      <div className="flex items-center gap-2 text-ink-soft">
        <MessageCircleQuestion className="w-4 h-4" />
        <h4 className="text-xs font-black">پرسش امروز</h4>
      </div>
      <p id="day-question-title" className="text-sm font-bold text-ink leading-relaxed">{today.question.text}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="گزینه‌های پرسش امروز">
        {today.question.options.map((option, i) => (
          <button key={option} type="button" onClick={() => void choose(i)} disabled={busy !== null} aria-pressed={today.mine === i} className={optionClass}>
            {option}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onSkip} className="text-[11px] font-bold text-muted hover:text-ink">
          {skipLabel}
        </button>
        <span className="text-[11px] text-faint">بعد از پاسخ می‌بینید بقیه چه گفتند.</span>
      </div>
    </section>
  );
};

/**
 * «پرسش روز», answered: every option with its share and the colleague's own choice marked. Shares
 * only. While the answers are too few, just the colleague's own answer and one line: the options
 * again without numbers only crowd the card.
 */
export const DayQuestionResults: React.FC<{ today: DayQuestionToday; onChange: () => void }> = ({ today, onChange }) => {
  if (!today.question || today.mine === null) return null;
  const { question, results, mine } = today;
  return (
    <section aria-labelledby="day-question-results-title" className="space-y-2.5" data-testid="day-question-results">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-ink-soft">
          <MessageCircleQuestion className="w-4 h-4" />
          <h4 className="text-xs font-black">پرسش امروز</h4>
        </div>
        <button type="button" onClick={onChange} className="text-xs font-bold text-muted hover:text-brand-strong">
          تغییر پاسخ
        </button>
      </div>
      <p id="day-question-results-title" className="text-sm font-bold text-ink leading-relaxed">{question.text}</p>
      {results ? (
        <>
          <ul className="space-y-1.5 max-w-sm">
            {question.options.map((option, i) => {
              const share = results?.shares[i] ?? null;
              return (
                <li key={option} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-1 min-w-0 ${mine === i ? 'font-black text-brand-strong' : 'font-medium text-ink-soft'}`}>
                      {mine === i && <Check className="w-3.5 h-3.5 shrink-0" aria-label="پاسخ شما" />}
                      <span className="truncate">{option}</span>
                    </span>
                    {share !== null && <span className="tabular-nums text-faint shrink-0">{toPersianDigits(share)}٪</span>}
                  </div>
                  {share !== null && (
                    <div className="mt-1 h-1.5 rounded-full bg-surface overflow-hidden" aria-hidden>
                      <div className={`h-full rounded-full ${mine === i ? 'bg-brand' : 'bg-brand/30'}`} style={{ width: `${share}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-faint">{toPersianDigits(results.answers)} پاسخ تا این لحظه</p>
        </>
      ) : (
        <p className="text-xs text-ink-soft leading-relaxed" data-testid="day-question-few">
          پاسخ شما: <strong className="text-brand-strong">{question.options[mine]}</strong>
          <span className="text-faint"> · نتیجه وقتی دیده می‌شود که دست‌کم {toPersianDigits(MOOD_MIN_ANSWERS)} نفر پاسخ دهند.</span>
        </p>
      )}
    </section>
  );
};
