import React, { useEffect, useId, useState } from 'react';
import { BookOpen, CalendarClock, Plus, Trash2 } from 'lucide-react';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { usePortal } from '../../context/PortalContext';
import { api, useEventAction } from './eventUi';
import { HAFEZ_FAL, SCHEDULE_MAX, SCHEDULE_TITLE_MAX, scheduleNow, type ScheduleItem } from '../../../shared/specialEvents';
import { toJalali, toLatinDigits, toPersianDigits } from '../../lib/jalali';
import type { EventView } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';

/** The item on now and the next one, ticking every half minute. */
export function useScheduleNow(view: EventView, offset = 0) {
  const [now, setNow] = useState(() => new Date(Date.now() + offset));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date(Date.now() + offset)), 30_000);
    return () => window.clearInterval(timer);
  }, [offset]);
  return scheduleNow(view.event.schedule, view.event.programDate, now, (d) => toJalali(d), (d) => toJalali(d, 'HH:mm'));
}

type Row = { id?: string; time: string; title: string };

/** «برنامهٔ امشب»: what happens when on the night; the organizers write it here. */
export const ScheduleCard: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const { event, me } = view;
  const { ordered, current, next } = useScheduleNow(view);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const over = event.phase === 'memories' || event.phase === 'ended';
  if (ordered.length === 0 && (!me.isOrganizer || over)) return null;

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    const items = rows
      .map((r) => ({ ...r, time: toLatinDigits(r.time.trim()), title: r.title.trim() }))
      .filter((r) => r.time || r.title);
    const ok = await run(() => api.put(`/api/special_events/${event.id}/schedule`, { items }), 'برنامه ذخیره شد.');
    if (ok) setRows(null);
    setBusy(false);
  };

  return (
    <section id="event-schedule" className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          برنامهٔ امشب
        </h2>
        <span className="text-[11px] text-muted">
          {toPersianDigits(event.programDate)}
          {event.programPlace ? ` · ${event.programPlace}` : ''}
        </span>
        {me.isOrganizer && !rows && !over && (
          <button type="button" onClick={() => setRows(ordered.map((i) => ({ ...i, time: toPersianDigits(i.time) })))} className="ms-auto text-[11px] text-red-700 underline">
            {ordered.length ? 'ویرایش برنامه' : 'نوشتن برنامه'}
          </button>
        )}
      </div>

      {rows ? (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="flex gap-2 items-center">
              <label className="sr-only" htmlFor={`${id}-t${i}`}>
                ساعت بخش {toPersianDigits(i + 1)}
              </label>
              <input
                id={`${id}-t${i}`}
                className={`${inputClass} w-20 text-center tabular-nums`}
                inputMode="numeric"
                placeholder="۱۵:۰۰"
                value={r.time}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
              />
              <label className="sr-only" htmlFor={`${id}-n${i}`}>
                عنوان بخش {toPersianDigits(i + 1)}
              </label>
              <input
                id={`${id}-n${i}`}
                className={`${inputClass} flex-1`}
                maxLength={SCHEDULE_TITLE_MAX}
                placeholder="مثلاً فینال فیفا روی صحنه"
                value={r.title}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-red-700" aria-label={`حذف بخش ${toPersianDigits(i + 1)}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {rows.length < SCHEDULE_MAX && (
              <button type="button" onClick={() => setRows([...rows, { time: '', title: '' }])} className={secondaryButtonClass}>
                <Plus className="w-4 h-4" /> بخش تازه
              </button>
            )}
            <button type="button" disabled={busy} onClick={save} className={primaryButtonClass}>
              ذخیرهٔ برنامه
            </button>
            <button type="button" onClick={() => setRows(null)} className="text-xs text-muted underline">
              انصراف
            </button>
          </div>
        </div>
      ) : ordered.length === 0 ? (
        <p className="text-xs text-muted">هنوز برنامه‌ای نوشته نشده. ساعت هر بخش (مثلاً شام، فینال، انتخاب‌ها) را بنویسید تا همه و صفحهٔ بزرگ ببینند.</p>
      ) : (
        <ol className="relative border-s-2 border-line ms-2 space-y-2">
          {ordered.map((item: ScheduleItem) => {
            const now = current?.id === item.id;
            const past = Boolean(current && item.time < current.time);
            return (
              <li key={item.id} className={`ps-4 relative ${past ? 'opacity-55' : ''}`} aria-current={now ? 'step' : undefined}>
                <span className={`absolute -start-[7px] top-1.5 w-3 h-3 rounded-full ${now ? 'bg-red-600 ring-4 ring-red-100' : 'bg-line-strong'}`} aria-hidden />
                <span className="text-xs font-black tabular-nums text-red-800 me-2">{toPersianDigits(item.time)}</span>
                <span className={`text-sm ${now ? 'font-black text-ink' : 'text-ink'}`}>{item.title}</span>
                {now && <span className="ms-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-700 text-white">الان</span>}
                {next?.id === item.id && <span className="ms-2 text-[10px] font-bold text-amber-700">بعدی</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

/** The two halves of a couplet, one under the other. */
export const Couplet: React.FC<{ index: number; className?: string }> = ({ index, className = '' }) => {
  const fal = HAFEZ_FAL[index];
  if (!fal) return null;
  return (
    <p className={`text-center leading-loose font-bold ${className}`}>
      <span className="block">{fal.verse[0]}</span>
      <span className="block">{fal.verse[1]}</span>
    </p>
  );
};

/** «فال حافظ»: one fal a night for each colleague, with a light reading. */
export const FalCard: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest } = usePortal();
  const run = useEventAction();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const { fal, event } = view;
  if (isGuest || (fal.mine === null && !fal.open)) return null;

  const draw = async () => {
    setBusy(true);
    await run(() => api.post(`/api/special_events/${event.id}/fal`));
    setBusy(false);
  };

  return (
    <section className={`${card} bg-gradient-to-b from-amber-50 to-white`} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          فال حافظ
        </h2>
        <span className="text-[11px] text-muted">{toPersianDigits(fal.count)} نفر فال گرفته‌اند؛ هر نفر یک فال در این رویداد.</span>
      </div>
      {fal.mine === null ? (
        <div className="text-center space-y-3 py-2">
          <p className="text-sm text-ink">ای حافظ شیرازی! تو محرم هر رازی… نیت کنید و دکمه را بزنید.</p>
          <button type="button" disabled={busy} onClick={draw} className={`${primaryButtonClass} mx-auto`}>
            نیت کردم، فال بگیر
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <Couplet index={fal.mine} className="text-base sm:text-lg text-red-900" />
          <p className="text-xs text-ink-soft leading-relaxed text-center">{HAFEZ_FAL[fal.mine]?.reading}</p>
        </div>
      )}
    </section>
  );
};

/** On the remote: each award's envelope goes on the big screen sealed, then is opened on stage. */
export const EnvelopePanel: React.FC<{ view: EventView; onShow: (awardId: string) => void }> = ({ view, onShow }) => {
  const run = useEventAction();
  const id = useId();
  const awards = view.awards.filter((a) => a.decided || a.stage === 'revealed');
  if (view.awards.length === 0) return null;
  const screenAward = view.event.screen?.scene === 'envelope' ? view.event.screen.awardId : null;

  const open = (awardId: string, title: string) => {
    if (!window.confirm(`پاکت «${title}» باز شود؟ برنده برای همه اعلام می‌شود.`)) return;
    void run(() => api.post(`/api/event_awards/${awardId}/reveal`), 'پاکت باز شد 🎉').then((ok) => ok && onShow(awardId));
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-black text-ink">
        پاکت‌های انتخاب‌ها
      </h2>
      {awards.length === 0 ? (
        <p className="text-xs text-muted">هنوز برندهٔ هیچ بخشی معلوم نشده؛ بعد از بسته شدن رأی‌ها پاکت‌ها اینجا می‌آیند.</p>
      ) : (
        <ul className="space-y-1.5">
          {awards.map((a) => {
            const onScreen = screenAward === a.id;
            return (
              <li key={a.id} className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border ${onScreen ? 'border-red-700 bg-red-50' : 'border-line'}`}>
                <span className="text-lg" aria-hidden>
                  {a.icon}
                </span>
                <span className="flex-1 min-w-0 text-xs font-bold truncate">
                  {a.title}
                  {a.stage === 'revealed' && <span className="text-muted font-normal"> · {a.winnerId ? (view.people[a.winnerId]?.name ?? 'همکار') : 'بدون برنده'}</span>}
                </span>
                <button type="button" onClick={() => onShow(a.id)} aria-pressed={onScreen} className={secondaryButtonClass}>
                  {onScreen ? 'روی صفحه است' : 'پاکت روی صفحه'}
                </button>
                {a.stage !== 'revealed' && (
                  <button type="button" onClick={() => open(a.id, a.title)} className={primaryButtonClass}>
                    باز کردن پاکت
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
