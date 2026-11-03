import React, { useId, useState } from 'react';
import { Check, Crosshair, Sparkles, Trophy } from 'lucide-react';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { usePortal } from '../../context/PortalContext';
import { api, entryName, matchWhen, PersonAvatar, useEventAction } from './eventUi';
import { DEFAULT_GUESS_QUESTION, GUESS_MAX, GUESS_QUESTION_MAX, PREDICT_DRAW } from '../../../shared/specialEvents';
import { toLatinDigits } from '../../../shared/jalali';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventMatch, EventView, MatchPrediction } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';
const percent = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0);

/** A number typed with Persian or Latin digits (and thousands separators), or null. */
export function readNumber(text: string) {
  const latin = toLatinDigits(text.trim()).replace(/[,٬\s]/g, '');
  if (!/^\d{1,7}$/.test(latin)) return null;
  const value = Number(latin);
  return value <= GUESS_MAX ? value : null;
}

/** One match to predict: the two sides (and «مساوی» in a points table), then how everyone picked. */
const PredictionRow: React.FC<{ view: EventView; competition: EventCompetition; match: EventMatch; prediction: MatchPrediction }> = ({ view, competition: c, match: m, prediction: p }) => {
  const run = useEventAction();
  const [busy, setBusy] = useState(false);
  const name = (id: string | null) => entryName(c.entries.find((e) => e.id === id), view.people);
  const sides = [
    { id: m.entryA!, label: name(m.entryA), count: p.counts?.a ?? 0 },
    ...(c.format === 'league' ? [{ id: PREDICT_DRAW, label: 'مساوی', count: p.counts?.draw ?? 0 }] : []),
    { id: m.entryB!, label: name(m.entryB), count: p.counts?.b ?? 0 },
  ];
  const pick = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await run(() => api.put(`/api/event_matches/${m.id}/prediction`, { pick: p.mine === id ? null : id }), p.mine === id ? undefined : 'پیش‌بینی شما ثبت شد.');
    setBusy(false);
  };
  return (
    <li className="rounded-2xl border border-line p-3 space-y-2">
      <p className="text-[11px] text-muted">
        <span aria-hidden>{c.icon}</span> {c.title} · {m.roundName} · {matchWhen(m)}
      </p>
      <div className="flex gap-1.5" role="group" aria-label={`پیش‌بینی ${name(m.entryA)} و ${name(m.entryB)}`}>
        {sides.map((s) => {
          const chosen = p.mine === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!p.canPick || busy}
              aria-pressed={chosen}
              onClick={() => pick(s.id)}
              className={`flex-1 min-w-0 min-h-11 px-2 py-2 rounded-2xl text-xs font-bold border transition ${
                chosen ? 'bg-red-700 border-red-700 text-white' : p.canPick ? 'bg-white border-line text-ink hover:bg-surface' : 'bg-surface border-line text-ink cursor-default'
              } ${s.id === PREDICT_DRAW ? 'flex-none' : ''}`}
            >
              <span className="block truncate">
                {chosen && <Check className="inline w-3.5 h-3.5 me-1 align-[-2px]" aria-hidden />}
                {s.label}
              </span>
              {p.counts && p.counts.total > 0 && <span className={`block text-[10px] ${chosen ? 'text-white/80' : 'text-muted'}`}>{toPersianDigits(percent(s.count, p.counts.total))}٪</span>}
            </button>
          );
        })}
      </div>
      {p.counts && p.counts.total > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-surface" aria-hidden>
          {sides.map((s, i) => (
            <span key={s.id} style={{ width: `${percent(s.count, p.counts!.total)}%` }} className={i === 0 ? 'bg-red-600' : s.id === PREDICT_DRAW ? 'bg-amber-400' : 'bg-emerald-600'} />
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted">
        {!p.canPick && p.open
          ? 'این بازی را خودتان بازی می‌کنید؛ پیش‌بینی با دیگران است.'
          : p.mine
            ? `${toPersianDigits(p.counts?.total ?? 0)} نفر پیش‌بینی کرده‌اند؛ تا شروع بازی می‌توانید عوضش کنید.`
            : 'بعد از پیش‌بینی، می‌بینید دیگران چه گفته‌اند.'}
      </p>
    </li>
  );
};

/** «پیش‌بینی برنده»: everyone guesses who wins the coming matches; the best predictors get a table. */
export const PredictionsSection: React.FC<{ view: EventView }> = ({ view }) => {
  const { currentUser } = usePortal();
  const id = useId();
  const [all, setAll] = useState(false);
  const { predictions } = view;
  const open = view.competitions
    .flatMap((c) => c.matches.filter((m) => predictions.matches[m.id]?.open).map((m) => ({ c, m, p: predictions.matches[m.id] })))
    .sort((a, b) => Number(b.p.canPick && !b.p.mine) - Number(a.p.canPick && !a.p.mine) || (a.p.closesAt ?? '9').localeCompare(b.p.closesAt ?? '9'));
  const leaders = predictions.leaders;
  if (open.length === 0 && leaders.length === 0) return null;
  const shown = all ? open : open.slice(0, 4);
  const me = predictions.me;

  return (
    <section id="event-predict" className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <Crosshair className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          پیش‌بینی برنده
        </h2>
        <span className="text-[11px] text-muted">حدس بزنید چه کسی می‌برد؛ بهترین پیش‌بین‌ها روی صفحهٔ بزرگ می‌آیند.</span>
      </div>
      {me && me.total > 0 && (
        <p className="text-xs text-ink">
          پیش‌بینی‌های درست شما: <b>{toPersianDigits(me.correct)}</b> از {toPersianDigits(me.total)}
        </p>
      )}
      {open.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-2">
          {shown.map(({ c, m, p }) => (
            <PredictionRow key={m.id} view={view} competition={c} match={m} prediction={p} />
          ))}
        </ul>
      )}
      {open.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className={`${secondaryButtonClass} w-full`}>
          همهٔ {toPersianDigits(open.length)} بازی
        </button>
      )}
      {leaders.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-ink mb-1.5 flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden /> بهترین پیش‌بین‌ها
          </h3>
          <ol className="space-y-1">
            {leaders.slice(0, 5).map((l) => (
              <li key={l.employeeId} className={`flex items-center gap-2 text-xs rounded-xl px-2 py-1 ${l.employeeId === currentUser?.id ? 'bg-amber-50' : ''}`}>
                <span className="w-5 text-center font-black text-muted tabular-nums">{toPersianDigits(l.rank)}</span>
                <PersonAvatar person={view.people[l.employeeId]} className="w-6 h-6 rounded-full text-[10px]" />
                <span className="flex-1 min-w-0 truncate font-bold text-ink">{view.people[l.employeeId]?.name ?? 'همکار'}</span>
                <span className="text-muted tabular-nums">
                  {toPersianDigits(l.correct)} درست از {toPersianDigits(l.total)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

/** «چند دانه؟»: one number before the program; the answer is opened on stage and the closest wins. */
export const GuessCard: React.FC<{ view: EventView }> = ({ view }) => {
  const { currentUser } = usePortal();
  const run = useEventAction();
  const id = useId();
  const { event, me, guess } = view;
  const [text, setText] = useState(guess?.mine !== null && guess?.mine !== undefined ? toPersianDigits(guess.mine) : '');
  const [question, setQuestion] = useState(event.guessQuestion || DEFAULT_GUESS_QUESTION);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const over = event.phase === 'memories' || event.phase === 'ended';

  const saveQuestion = async (value: string) => {
    setBusy(true);
    const ok = await run(() => api.put(`/api/special_events/${event.id}/guess_question`, { question: value }), value ? 'پرسش ذخیره شد.' : 'بازی خاموش شد.');
    if (ok) setEditing(false);
    setBusy(false);
  };

  const questionForm = (
    <form
      className="flex flex-col sm:flex-row gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (question.trim()) void saveQuestion(question.trim());
      }}
    >
      <label className="sr-only" htmlFor={`${id}-q`}>
        پرسش بازی
      </label>
      <input id={`${id}-q`} className={`${inputClass} flex-1`} value={question} maxLength={GUESS_QUESTION_MAX} onChange={(e) => setQuestion(e.target.value)} />
      <button type="submit" disabled={busy || !question.trim()} className={primaryButtonClass}>
        {guess ? 'ذخیرهٔ پرسش' : 'روشن کردن بازی'}
      </button>
    </form>
  );

  if (!guess) {
    if (!me.isOrganizer || over) return null;
    return (
      <section id="event-guess" className={card} aria-labelledby={`${id}-title`}>
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="w-4 h-4 text-red-700" aria-hidden />
          <h2 id={`${id}-title`} className="text-sm font-black text-ink">
            بازی «چند دانه؟»
          </h2>
          <span className="text-[11px] text-muted">همه تا شروع برنامه یک عدد حدس می‌زنند و شب، جواب روی صفحهٔ بزرگ باز می‌شود؛ نزدیک‌ترین برنده است.</span>
        </div>
        {questionForm}
      </section>
    );
  }

  const value = readNumber(text);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value === null || busy) return;
    setBusy(true);
    await run(() => api.put(`/api/special_events/${event.id}/guess`, { value }), guess.mine === null ? 'حدس شما ثبت شد.' : 'حدس شما عوض شد.');
    setBusy(false);
  };

  return (
    <section id="event-guess" className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          چند دانه؟
        </h2>
        <span className="text-[11px] text-muted">
          {guess.revealed ? 'جواب اعلام شد.' : `${toPersianDigits(guess.count)} نفر حدس زده‌اند؛ جواب شب برنامه روی صفحهٔ بزرگ باز می‌شود.`}
        </span>
      </div>
      <p className="text-base font-black text-ink">{guess.question}</p>

      {guess.revealed ? (
        <div className="space-y-2">
          <p className="text-sm">
            جواب: <b className="text-2xl font-black text-red-700 tabular-nums">{toPersianDigits(guess.answer ?? 0)}</b>
          </p>
          <ol className="space-y-1">
            {guess.winners.map((w, i) => (
              <li key={w.employeeId} className={`flex items-center gap-2 text-xs rounded-xl px-2 py-1 ${w.employeeId === currentUser?.id ? 'bg-amber-50' : ''}`}>
                <span aria-hidden>{['🥇', '🥈', '🥉'][i]}</span>
                <PersonAvatar person={view.people[w.employeeId]} className="w-6 h-6 rounded-full text-[10px]" />
                <span className="flex-1 min-w-0 truncate font-bold text-ink">{view.people[w.employeeId]?.name ?? 'همکار'}</span>
                <span className="text-muted tabular-nums">
                  حدس {toPersianDigits(w.value)}
                  {w.diff === 0 ? ' · دقیق!' : `، ${toPersianDigits(w.diff)} اختلاف`}
                </span>
              </li>
            ))}
          </ol>
          {guess.mine !== null && guess.myRank && guess.myRank > 3 && (
            <p className="text-xs text-muted">
              حدس شما {toPersianDigits(guess.mine)} بود و نفر {toPersianDigits(guess.myRank)} شدید.
            </p>
          )}
        </div>
      ) : guess.canGuess ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs font-bold text-ink mb-1" htmlFor={`${id}-v`}>
              حدس شما
            </label>
            <input id={`${id}-v`} className={`${inputClass} tabular-nums`} inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || value === null || value === guess.mine} className={primaryButtonClass}>
            {guess.mine === null ? 'ثبت حدس' : 'عوض کردن'}
          </button>
          <p className="w-full text-[11px] text-muted">
            {guess.mine === null ? 'تا شروع برنامه می‌توانید حدستان را عوض کنید. از دو حدس به یک اندازه نزدیک، آن‌که زودتر ثبت شده می‌برد.' : `حدس شما: ${toPersianDigits(guess.mine)}`}
          </p>
        </form>
      ) : (
        <p className="text-xs text-muted">
          {guess.mine !== null
            ? `حدس شما: ${toPersianDigits(guess.mine)}؛ منتظر جواب روی صفحهٔ بزرگ باشید.`
            : guess.open
              ? me.isOrganizer || me.isJuror
                ? 'برگزارکنندگان و داوران در این بازی شرکت نمی‌کنند.'
                : 'برای حدس زدن وارد حساب کاربری شوید.'
              : 'وقت حدس زدن تمام شده است.'}
        </p>
      )}

      {me.isOrganizer && !guess.revealed && (
        <div className="border-t border-line pt-3 space-y-2">
          <p className="text-[11px] text-muted">جواب را شب برنامه از «ریموت صفحهٔ بزرگ» اعلام کنید.</p>
          {editing ? (
            <>
              {questionForm}
              {guess.count === 0 && (
                <button type="button" disabled={busy} onClick={() => saveQuestion('')} className="text-[11px] text-red-700 underline">
                  خاموش کردن بازی
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-red-700 underline">
              تغییر پرسش
            </button>
          )}
        </div>
      )}
    </section>
  );
};

/** On the remote: the answer of «چند دانه؟» is written in on stage and the big screen opens it. */
export const GuessReveal: React.FC<{ view: EventView; onShow: () => void }> = ({ view, onShow }) => {
  const run = useEventAction();
  const id = useId();
  const { event, guess } = view;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!guess) return null;
  const started = event.phase === 'live' || event.phase === 'memories' || event.phase === 'ended';
  const value = readNumber(text);

  const reveal = async (answer: number | null) => {
    setBusy(true);
    const ok = await run(() => api.post(`/api/special_events/${event.id}/guess_reveal`, { answer }), answer === null ? 'جواب پس گرفته شد.' : 'جواب اعلام شد.');
    if (ok && answer !== null) onShow();
    setBusy(false);
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-black text-ink flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-red-700" aria-hidden /> چند دانه؟
      </h2>
      <p className="text-xs text-muted">
        {guess.question}، {toPersianDigits(guess.count)} حدس
      </p>
      {guess.revealed ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm flex-1">
            جواب: <b className="text-xl tabular-nums">{toPersianDigits(guess.answer ?? 0)}</b>
            {guess.winners[0] && <> · برنده: {view.people[guess.winners[0].employeeId]?.name ?? 'همکار'}</>}
          </p>
          <button type="button" onClick={onShow} className={secondaryButtonClass}>
            نشان دادن روی صفحه
          </button>
          <button type="button" disabled={busy} onClick={() => reveal(null)} className="text-[11px] text-red-700 underline">
            پس گرفتن جواب
          </button>
        </div>
      ) : !started ? (
        <p className="text-xs text-muted">جواب بعد از شروع برنامه اعلام می‌شود؛ تا آن موقع روی صفحه فقط پرسش و تعداد حدس‌ها می‌آید.</p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value !== null && !busy) void reveal(value);
          }}
        >
          <label htmlFor={`${id}-a`} className="sr-only">
            جواب درست
          </label>
          <input id={`${id}-a`} className={`${inputClass} flex-1 tabular-nums`} inputMode="numeric" autoComplete="off" placeholder="جواب درست" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" disabled={busy || value === null} className={primaryButtonClass}>
            اعلام جواب
          </button>
        </form>
      )}
    </section>
  );
};
