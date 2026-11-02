import React, { useId, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Clock, Dices, Eraser, History, Megaphone, MessageSquareWarning, X } from 'lucide-react';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { MatchCard } from './Bracket';
import { ResultModal } from './ResultModal';
import { api, isReady, scoreLine, sidesLine, useEventAction } from './eventUi';
import { OBJECTION_MAX, PLACE_MAX } from '../../../shared/specialEvents';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventMatch, EventObjection, EventView } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5';

/** Changes the day, time and place of one match, or moves it to the stage. */
const MatchTimeModal: React.FC<{ competition: EventCompetition; match: EventMatch; onClose: () => void }> = ({ competition, match, onClose }) => {
  const run = useEventAction();
  const id = useId();
  const [day, setDay] = useState(match.day);
  const [time, setTime] = useState(match.time);
  const [place, setPlace] = useState(match.place);
  const [onStage, setOnStage] = useState(match.onStage);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api.patch(`/api/event_matches/${match.id}`, { day, time, place: place.trim(), onStage }), 'ساعت بازی ذخیره شد.');
    if (ok) onClose();
  };
  return (
    <Modal
      title="زمان و محل بازی"
      subtitle={`${competition.title} · ${match.roundName}`}
      icon={<CalendarClock className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={id} className={primaryButtonClass}>
            ذخیره
          </button>
        </>
      }
    >
      <form id={id} onSubmit={save} className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
          <input type="checkbox" checked={onStage} onChange={(e) => setOnStage(e.target.checked)} className="w-4 h-4 accent-red-700" />
          این بازی شب برنامه روی صحنه انجام می‌شود
        </label>
        {!onStage && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-day`} className={labelClass}>
                روز
              </label>
              <JalaliDateInput id={`${id}-day`} value={day} onChange={setDay} />
            </div>
            <div>
              <label htmlFor={`${id}-time`} className={labelClass}>
                ساعت
              </label>
              <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} dir="ltr" />
            </div>
            <div className="col-span-2">
              <label htmlFor={`${id}-place`} className={labelClass}>
                محل
              </label>
              <input id={`${id}-place`} value={place} maxLength={PLACE_MAX} onChange={(e) => setPlace(e.target.value)} className={inputClass} placeholder="اتاق VIP" />
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted">اگر جدول منتشر شده باشد، بازیکن‌های این بازی از تغییر ساعت باخبر می‌شوند.</p>
      </form>
    </Modal>
  );
};

/** One objection, and for the jury the two buttons to decide it. */
const ObjectionItem: React.FC<{ view: EventView; objection: EventObjection }> = ({ view, objection }) => {
  const run = useEventAction();
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  const competition = view.competitions.find((c) => c.matches.some((m) => m.id === objection.matchId));
  const match = competition?.matches.find((m) => m.id === objection.matchId);
  const by = view.people[objection.byId];
  const decide = async (status: 'accepted' | 'rejected') => {
    setBusy(true);
    await run(() => api.post(`/api/event_objections/${objection.id}/decide`, { status, decision: decision.trim() }), status === 'accepted' ? 'اعتراض پذیرفته شد؛ اگر لازم است نتیجه را اصلاح کنید.' : 'اعتراض رد شد.');
    setBusy(false);
  };
  return (
    <li className="p-3 rounded-2xl border border-line space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="font-black text-ink">{by?.name ?? 'همکار'}</span>
        <span className="text-muted">
          {competition?.title} · {match?.roundName}
          {match && competition && ` · ${sidesLine(competition, match, view.people)} ${scoreLine(match, competition)}`}
        </span>
        <span className="text-faint ms-auto">{timeAgo(objection.createdAt)}</span>
      </div>
      <p className="text-sm text-ink whitespace-pre-line">{objection.text}</p>
      {objection.status === 'open' ? (
        view.me.decides ? (
          <div className="space-y-2">
            <input value={decision} maxLength={OBJECTION_MAX} onChange={(e) => setDecision(e.target.value)} className={inputClass} placeholder="پاسخ داوران (برای معترض فرستاده می‌شود)" aria-label="پاسخ داوران" />
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={busy || decision.trim().length < 2} onClick={() => void decide('rejected')} className={secondaryButtonClass}>
                <X className="w-4 h-4" /> رد
              </button>
              <button type="button" disabled={busy || decision.trim().length < 2} onClick={() => void decide('accepted')} className={primaryButtonClass}>
                <Check className="w-4 h-4" /> پذیرش
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-amber-800">منتظر رأی هیئت داوران</p>
        )
      ) : (
        <p className={`text-xs rounded-xl p-2 ${objection.status === 'accepted' ? 'bg-emerald-50 text-emerald-900' : 'bg-surface text-ink-soft'}`}>
          {objection.status === 'accepted' ? 'پذیرفته شد' : 'رد شد'} ({view.people[objection.decidedById ?? '']?.name ?? 'داور'}): {objection.decision}
        </p>
      )}
    </li>
  );
};

/** The draw and publishing of one competition, and moving its daytime matches when the day runs late. */
const CompetitionControls: React.FC<{ competition: EventCompetition }> = ({ competition }) => {
  const run = useEventAction();
  const played = competition.matches.some((m) => m.done && !m.bye);
  const inEntries = competition.entries.filter((e) => e.status === 'in').length;
  const daytime = competition.matches.some((m) => !m.onStage && !m.done && m.time);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <span className="text-lg" aria-hidden>
        {competition.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-ink truncate">{competition.title}</p>
        <p className="text-[11px] text-muted">
          {toPersianDigits(inEntries)} {competition.kind === 'team' ? 'تیم' : 'نفر'} ·{' '}
          {competition.publishedAt ? 'جدول منتشر شده' : competition.drawnAt ? 'قرعه کشیده شده، منتشر نشده' : 'هنوز قرعه‌کشی نشده'}
        </p>
      </div>
      {!competition.drawnAt && (
        <button
          type="button"
          disabled={inEntries < 2}
          onClick={() => {
            if (window.confirm(`قرعهٔ «${competition.title}» کشیده شود؟ بعد از آن ثبت‌نام این مسابقه بسته می‌شود (تا قرعه پاک نشود).`)) void run(() => api.post(`/api/event_competitions/${competition.id}/draw`), 'قرعه کشیده شد؛ جدول را ببینید و منتشر کنید.');
          }}
          className={secondaryButtonClass}
        >
          <Dices className="w-4 h-4" /> قرعه‌کشی
        </button>
      )}
      {competition.drawnAt && !played && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('قرعه پاک شود؟ جدول از بین می‌رود و ثبت‌نام دوباره باز می‌شود.')) void run(() => api.delete(`/api/event_competitions/${competition.id}/draw`), 'قرعه پاک شد.');
          }}
          className={secondaryButtonClass}
        >
          <Eraser className="w-4 h-4" /> پاک کردن قرعه
        </button>
      )}
      {competition.drawnAt && !competition.publishedAt && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(competition.format === 'ranking' ? 'ترتیب اجرا برای همه منتشر شود؟ هر شرکت‌کننده از نوبت و ساعتش باخبر می‌شود.' : 'جدول برای همه منتشر شود؟ هر بازیکن از حریف و ساعت بازی‌اش باخبر می‌شود.')) void run(() => api.post(`/api/event_competitions/${competition.id}/publish`), 'جدول منتشر شد.');
          }}
          className={primaryButtonClass}
        >
          <Megaphone className="w-4 h-4" /> انتشار جدول
        </button>
      )}
      {daytime && (
        <div className="flex gap-1" role="group" aria-label="جابه‌جایی همهٔ بازی‌های روزانهٔ این مسابقه">
          {[-10, 10].map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => void run(() => api.post(`/api/event_competitions/${competition.id}/shift`, { minutes }), `بازی‌ها ${toPersianDigits(10)} دقیقه ${minutes > 0 ? 'دیرتر' : 'زودتر'} شدند.`)}
              className={`${secondaryButtonClass} px-2.5`}
            >
              <Clock className="w-3.5 h-3.5" /> {minutes > 0 ? '۱۰ دقیقه دیرتر' : '۱۰ دقیقه زودتر'}
            </button>
          ))}
        </div>
      )}
    </li>
  );
};

/**
 * «میز برگزارکننده»: everything an organizer or juror needs on the day, on a phone: matches waiting for a
 * result (by time), the draw and publishing, objections, warnings and the history of every change.
 */
export const OrganizerConsole: React.FC<{ view: EventView }> = ({ view }) => {
  const [resultFor, setResultFor] = useState<{ competition: EventCompetition; match: EventMatch } | null>(null);
  const [timeFor, setTimeFor] = useState<{ competition: EventCompetition; match: EventMatch } | null>(null);
  const [showDone, setShowDone] = useState(false);

  const pending = view.competitions
    .flatMap((c) => c.matches.filter((m) => isReady(c, m) && (showDone || !m.done)).map((m) => ({ competition: c, match: m })))
    .sort((a, b) => Number(a.match.onStage) - Number(b.match.onStage) || (a.match.day || '9').localeCompare(b.match.day || '9') || (a.match.time || '99').localeCompare(b.match.time || '99'));
  const objections = [...view.objections].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      {view.warnings.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-3xl p-4 space-y-1.5" aria-label="هشدارها">
          {view.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-950 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
              {w}
            </p>
          ))}
        </section>
      )}

      <section className={card} id="event-console-matches">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-black text-ink">بازی‌ها و ثبت نتیجه</h2>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-red-700" />
            تمام‌شده‌ها هم
          </label>
        </div>
        {pending.length === 0 ? (
          <p className="text-xs text-muted">{view.competitions.some((c) => c.drawnAt) ? 'بازی‌ای منتظر نتیجه نیست.' : 'بعد از قرعه‌کشی، بازی‌ها اینجا به ترتیب ساعت می‌آیند.'}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pending.map(({ competition, match }) => (
              <li key={match.id} className="space-y-1">
                <p className="text-[11px] font-bold text-muted flex items-center justify-between gap-2">
                  <span className="truncate">
                    {competition.icon} {competition.title} · {match.roundName}
                    {match.day && match.day !== view.event.programDate && !match.onStage ? ` · ${toPersianDigits(match.day)}` : ''}
                  </span>
                  {!match.done && (
                    <button type="button" onClick={() => setTimeFor({ competition, match })} className="p-1 rounded-lg hover:bg-surface" aria-label="تغییر زمان و محل این بازی">
                      <CalendarClock className="w-3.5 h-3.5" />
                    </button>
                  )}
                </p>
                <MatchCard competition={competition} match={match} people={view.people} onOpen={(m) => setResultFor({ competition, match: m })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.me.isOrganizer && view.competitions.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-black text-ink">قرعه و انتشار جدول</h2>
          <p className="text-[11px] text-muted mt-1">
            اگر دستی کاری نکنید، فردای پایان ثبت‌نام قرعه خودکار کشیده و ساعت ۱۰ منتشر می‌شود.
          </p>
          <ul className="divide-y divide-line mt-2">
            {view.competitions.map((c) => (
              <CompetitionControls key={c.id} competition={c} />
            ))}
          </ul>
        </section>
      )}

      <section className={card} id="event-objections">
        <h2 className="text-sm font-black text-ink flex items-center gap-1.5">
          <MessageSquareWarning className="w-4 h-4 text-red-700" /> اعتراض‌ها
        </h2>
        {objections.length === 0 ? (
          <p className="text-xs text-muted mt-2">اعتراضی نرسیده است.</p>
        ) : (
          <ul className="space-y-2 mt-3">
            {objections.map((o) => (
              <ObjectionItem key={o.id} view={view} objection={o} />
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-black text-ink flex items-center gap-1.5">
          <History className="w-4 h-4 text-muted" /> تاریخچهٔ تغییرها
        </h2>
        {view.log.length === 0 ? (
          <p className="text-xs text-muted mt-2">هنوز چیزی ثبت نشده است.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {view.log.map((l) => (
              <li key={l.id} className="text-xs text-ink-soft flex gap-2">
                <span className="text-faint shrink-0 w-20 truncate">{timeAgo(l.createdAt)}</span>
                <span className="min-w-0">
                  <span className="font-bold text-ink">{l.action}</span>
                  {l.detail && ` · ${l.detail}`}
                  {l.byId && <span className="text-muted"> ({view.people[l.byId]?.name ?? 'خودکار'})</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {resultFor && <ResultModal view={view} competition={resultFor.competition} match={resultFor.match} onClose={() => setResultFor(null)} />}
      {timeFor && <MatchTimeModal competition={timeFor.competition} match={timeFor.match} onClose={() => setTimeFor(null)} />}
    </div>
  );
};
