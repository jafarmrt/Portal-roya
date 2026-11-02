import React, { useId, useState } from 'react';
import { Check, EyeOff, Heart, RotateCcw, Trash2, UserX } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { usePortal } from '../../context/PortalContext';
import { PersonAvatar, api, useEventAction } from './eventUi';
import { WHEEL_PRIZE_MAX, WISHES_PER_PERSON, WISH_MAX, type WishStatus } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventView } from './types';

// «آرزوهای یلدا» (a wall of short wishes, approved by the organizers) and «گردونهٔ شانس» (a name from
// everyone who took part, turned on the night from the remote).

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';

const STATUS: Record<WishStatus, { label: string; className: string }> = {
  pending: { label: 'منتظر تأیید', className: 'bg-amber-100 text-amber-900' },
  approved: { label: 'روی دیوار', className: 'bg-emerald-100 text-emerald-900' },
  hidden: { label: 'روی دیوار نرفت', className: 'bg-surface text-muted' },
};

/** One wish on the wall: the text, and who wrote it unless sent without a name. */
const WishNote: React.FC<{ view: EventView; text: string; byId: string | null }> = ({ view, text, byId }) => (
  <li className="p-3 rounded-2xl bg-gradient-to-br from-red-50 to-amber-50 border border-red-100 space-y-1.5">
    <p className="text-sm text-ink leading-relaxed">«{text}»</p>
    <p className="text-[11px] font-bold text-red-900">{byId ? (view.people[byId]?.name ?? 'همکار') : 'بی‌نام'}</p>
  </li>
);

/** «آرزوهای یلدا»: write a wish for the new year; the approved ones are on the wall and the big screen. */
export const WishesCard: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest } = usePortal();
  const run = useEventAction();
  const id = useId();
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const { wishes, event } = view;
  if (!wishes.canWrite && wishes.wall.length === 0) return null;
  const wall = [...wishes.wall].reverse();
  const shown = all ? wall : wall.slice(0, 6);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 2 || busy) return;
    setBusy(true);
    const ok = await run(() => api.post(`/api/special_events/${event.id}/wishes`, { text: text.trim(), anonymous }), view.me.isOrganizer ? 'آرزو روی دیوار رفت.' : 'آرزو ثبت شد؛ بعد از تأیید روی دیوار می‌رود.');
    setBusy(false);
    if (ok) setText('');
  };
  const takeBack = (wishId: string) => {
    if (window.confirm('این آرزو برداشته شود؟')) void run(() => api.delete(`/api/event_wishes/${wishId}`));
  };

  return (
    <section id="event-wishes" className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <Heart className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          آرزوهای یلدا
        </h2>
        <span className="text-[11px] text-muted">یک آرزوی کوتاه برای سال تازه؛ بعد از تأیید برگزارکننده روی دیوار و صفحهٔ بزرگ می‌آید.</span>
      </div>

      {wishes.canWrite && !isGuest && wishes.mine.length < WISHES_PER_PERSON && (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-2xl bg-surface">
          <label htmlFor={`${id}-text`} className="sr-only">
            آرزوی شما
          </label>
          <textarea
            id={`${id}-text`}
            value={text}
            maxLength={WISH_MAX}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            className={inputClass}
            placeholder="مثلاً سالی پر از سلامتی و خبرهای خوب برای همهٔ بچه‌های شرکت"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="w-4 h-4 accent-red-700" />
              بدون نام من
            </label>
            <span className="text-[11px] text-muted tabular-nums">
              {toPersianDigits(text.length)}/{toPersianDigits(WISH_MAX)}
            </span>
            <button type="submit" disabled={text.trim().length < 2 || busy} className={`${primaryButtonClass} ms-auto`}>
              ثبت آرزو
            </button>
          </div>
        </form>
      )}

      {wishes.mine.length > 0 && (
        <div className="space-y-1.5">
          <p className={labelClass}>آرزوهای من</p>
          <ul className="space-y-1.5">
            {wishes.mine.map((w) => (
              <li key={w.id} className="flex items-start gap-2 text-xs p-2 rounded-xl border border-line">
                <span className="flex-1 min-w-0 leading-relaxed">
                  {w.text}
                  {w.anonymous && <span className="text-muted"> (بدون نام)</span>}
                </span>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS[w.status].className}`}>{STATUS[w.status].label}</span>
                <button type="button" onClick={() => takeBack(w.id)} className="shrink-0 text-muted hover:text-red-700" aria-label="برداشتن این آرزو">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {wall.length === 0 ? (
        <p className="text-xs text-muted">هنوز آرزویی روی دیوار نیست. اولین نفر باشید!</p>
      ) : (
        <>
          <ul className="grid sm:grid-cols-2 gap-2">
            {shown.map((w) => (
              <WishNote key={w.id} view={view} text={w.text} byId={w.byId} />
            ))}
          </ul>
          {wall.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="text-xs text-red-700 underline">
              همهٔ {toPersianDigits(wall.length)} آرزو
            </button>
          )}
        </>
      )}
    </section>
  );
};

/** «گردونهٔ شانس» on the page: whether one's name is in it, and who it stopped on. */
export const WheelCard: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest } = usePortal();
  const id = useId();
  const { wheel, event } = view;
  const winners = wheel.spins.filter((s) => !s.absent);
  if (isGuest && winners.length === 0) return null;
  if (event.phase === 'memories' && winners.length === 0) return null;

  return (
    <section id="event-wheel" className={`${card} bg-gradient-to-b from-amber-50 to-white`} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden>
          🎡
        </span>
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          گردونهٔ شانس
        </h2>
        <span className="text-[11px] text-muted">شب برنامه، روی صفحهٔ بزرگ اسم چند نفر از همهٔ کسانی که در این صفحه شرکت کرده‌اند درمی‌آید.</span>
      </div>
      {!isGuest &&
        (wheel.organizer ? (
          <p className="text-xs text-ink-soft">برگزارکنندگان گردونه را می‌چرخانند و خودشان در آن نیستند.</p>
        ) : wheel.inIt ? (
          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
            <Check className="w-4 h-4" aria-hidden /> اسم شما در گردونه است.
          </p>
        ) : (
          <p className="text-xs text-ink-soft">
            اسم شما هنوز در گردونه نیست. با یک کار در همین صفحه (پیش‌بینی یک بازی، فال حافظ، یک آرزو، پیشنهاد آهنگ یا جواب مسابقهٔ همه) اسمتان به گردونه می‌رود.
          </p>
        ))}
      {winners.length > 0 && (
        <ul className="space-y-1.5">
          {winners.map((s) => {
            const person = view.people[s.winnerId];
            return (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <PersonAvatar person={person} className="w-7 h-7 rounded-full text-[10px]" />
                <span className="font-black">{person?.name ?? 'همکار'}</span>
                {s.prize && <span className="text-muted">· {s.prize}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/** On the organizer's desk: wishes waiting for a yes, and the wall (anything can be taken off it). */
export const WishesModeration: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const { wishes, me } = view;
  if (!me.isOrganizer) return null;
  const pending = wishes.waiting.filter((w) => w.status === 'pending');
  const hidden = wishes.waiting.filter((w) => w.status === 'hidden');
  const decide = (wishId: string, status: 'approved' | 'hidden') => run(() => api.patch(`/api/event_wishes/${wishId}`, { status }));

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <Heart className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          آرزوهای یلدا
        </h2>
        {pending.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950">{toPersianDigits(pending.length)} منتظر تأیید</span>}
        <span className="text-[11px] text-muted">{toPersianDigits(wishes.wall.length)} آرزو روی دیوار</span>
      </div>
      {pending.length === 0 ? (
        <p className="text-xs text-muted">آرزوی تازه‌ای منتظر نیست.</p>
      ) : (
        <ul className="space-y-1.5">
          {pending.map((w) => (
            <li key={w.id} className="p-2.5 rounded-2xl border border-amber-200 bg-amber-50 space-y-2">
              <p className="text-sm leading-relaxed">{w.text}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted">
                  {view.people[w.byId]?.name ?? 'همکار'}
                  {w.anonymous && ' · بدون نام روی دیوار'}
                </span>
                <button type="button" onClick={() => void decide(w.id, 'approved')} className={`${primaryButtonClass} ms-auto`}>
                  <Check className="w-4 h-4" /> روی دیوار
                </button>
                <button type="button" onClick={() => void decide(w.id, 'hidden')} className={secondaryButtonClass}>
                  <EyeOff className="w-4 h-4" /> نه
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {wishes.wall.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-ink-soft">آرزوهای روی دیوار</summary>
          <ul className="mt-2 space-y-1">
            {[...wishes.wall].reverse().map((w) => (
              <li key={w.id} className="flex items-start gap-2">
                <span className="flex-1 min-w-0">
                  {w.text} <span className="text-muted">· {w.byId ? (view.people[w.byId]?.name ?? 'همکار') : 'بی‌نام'}</span>
                </span>
                <button type="button" onClick={() => void decide(w.id, 'hidden')} className="shrink-0 text-muted hover:text-red-700 underline">
                  برداشتن
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {hidden.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-ink-soft">روی دیوار نرفته ({toPersianDigits(hidden.length)})</summary>
          <ul className="mt-2 space-y-1">
            {hidden.map((w) => (
              <li key={w.id} className="flex items-start gap-2">
                <span className="flex-1 min-w-0 text-muted">
                  {w.text} · {view.people[w.byId]?.name ?? 'همکار'}
                </span>
                <button type="button" onClick={() => void decide(w.id, 'approved')} className="shrink-0 text-red-700 underline">
                  روی دیوار
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};

/** On the remote: turn the wheel (with an optional prize), mark one who is not in the hall, start over. */
export const WheelRemote: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const [prize, setPrize] = useState('');
  const [busy, setBusy] = useState(false);
  const { wheel, event, me } = view;

  const spin = async () => {
    setBusy(true);
    const ok = await run(() => api.post(`/api/special_events/${event.id}/wheel/spin`, { prize: prize.trim() || undefined }), 'گردونه چرخید؛ اسم روی صفحهٔ بزرگ است.');
    setBusy(false);
    if (ok) setPrize('');
  };
  const reset = () => {
    if (window.confirm('گردونه از اول شود؟ همهٔ اسم‌ها برمی‌گردند (برای بعد از تمرین).')) void run(() => api.post(`/api/special_events/${event.id}/wheel/reset`));
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-black text-ink flex items-center gap-1.5">
        <span aria-hidden>🎡</span> گردونهٔ شانس
        <span className="text-[11px] font-normal text-muted">{toPersianDigits(wheel.left)} نفر در گردونه</span>
      </h2>
      {!wheel.live ? (
        <p className="text-xs text-muted">گردونه بعد از شروع برنامه می‌چرخد. در گردونه همهٔ کسانی هستند که در صفحهٔ رویداد کاری کرده‌اند؛ برگزارکنندگان نیستند.</p>
      ) : (
        <div className="space-y-2">
          <div>
            <label htmlFor={`${id}-prize`} className={labelClass}>
              جایزهٔ این دور (اختیاری)
            </label>
            <input id={`${id}-prize`} value={prize} maxLength={WHEEL_PRIZE_MAX} onChange={(e) => setPrize(e.target.value)} className={inputClass} placeholder="مثلاً یک جعبه گز" />
          </div>
          <button type="button" disabled={busy || wheel.left === 0} onClick={() => void spin()} className={`${primaryButtonClass} w-full justify-center py-3`}>
            🎡 بچرخان
          </button>
          {wheel.left === 0 && <p className="text-xs text-muted">کسی در گردونه نمانده است.</p>}
        </div>
      )}
      {wheel.spins.length > 0 && (
        <ol className="space-y-1.5">
          {[...wheel.spins].reverse().map((s) => (
            <li key={s.id} className={`flex flex-wrap items-center gap-2 text-xs p-2 rounded-xl border ${s.absent ? 'border-line opacity-60' : 'border-line'}`}>
              <span className={`flex-1 min-w-0 font-bold ${s.absent ? 'line-through' : ''}`}>
                {view.people[s.winnerId]?.name ?? 'همکار'}
                {s.prize && <span className="font-normal text-muted"> · {s.prize}</span>}
              </span>
              <button type="button" onClick={() => void run(() => api.patch(`/api/event_wheel/${s.id}`, { absent: !s.absent }))} className={secondaryButtonClass} aria-pressed={s.absent}>
                <UserX className="w-3.5 h-3.5" /> {s.absent ? 'بود' : 'نبود'}
              </button>
            </li>
          ))}
        </ol>
      )}
      {me.isOrganizer && wheel.spins.length > 0 && (
        <button type="button" onClick={reset} className="text-[11px] text-muted underline flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> از اول (بعد از تمرین)
        </button>
      )}
    </section>
  );
};
