import React, { useId, useState } from 'react';
import { Baby, Check, Eye, Monitor, Newspaper, Trash2 } from 'lucide-react';
import { primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { usePortal } from '../../context/PortalContext';
import { api, useEventAction } from './eventUi';
import { toPersianDigits } from '../../lib/jalali';
import type { EventView } from './types';

// «این بچه کیه؟» (childhood photos guessed on the night) and the closing news draft of the event.

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';

/** On the page: send one's childhood photo, and the photos already answered. */
export const KidPhotoCard: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest } = usePortal();
  const run = useEventAction();
  const id = useId();
  const { kid, event } = view;
  if (!kid.canSend && kid.gallery.length === 0) return null;
  if (isGuest && kid.gallery.length === 0) return null;

  const send = (url: string) => run(() => api.put(`/api/special_events/${event.id}/kid_photo`, { url }), kid.mine ? 'عکس عوض شد.' : 'عکس رسید؛ ممنون! تا شب برنامه فقط برگزارکنندگان آن را می‌بینند.');
  const takeBack = () => {
    if (window.confirm('عکس کودکی‌تان پس گرفته شود؟')) void run(() => api.delete(`/api/special_events/${event.id}/kid_photo`), 'عکس پاک شد.');
  };

  return (
    <section id="event-kid" className={card} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <Baby className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          این بچه کیه؟
        </h2>
        <span className="text-[11px] text-muted">{toPersianDigits(kid.count)} نفر عکس کودکی فرستاده‌اند.</span>
      </div>

      {kid.canSend && !isGuest && (
        <div className="p-3 rounded-2xl bg-surface space-y-2">
          <p className="text-xs text-ink-soft leading-relaxed">
            اگر دوست دارید، یک عکس از کودکی‌تان بفرستید. شب برنامه عکس روی صفحهٔ بزرگ می‌آید و همکاران روی گوشی حدس می‌زنند کیست. تا آن موقع فقط برگزارکنندگان و داوران
            عکس را می‌بینند. بعد از بسته شدن صفحهٔ رویداد عکس‌ها از پرتال پاک می‌شوند.
          </p>
          {kid.mine ? (
            <div className="flex flex-wrap items-center gap-3">
              <img src={kid.mine.url} alt="عکس کودکی من" className="w-20 h-20 rounded-2xl object-cover border border-line" />
              {kid.mine.shown ? (
                <p className="text-xs font-bold text-emerald-800">عکس شما روی صفحهٔ بزرگ رفت 🎉</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <Check className="w-4 h-4" aria-hidden /> عکس شما رسیده
                  </span>
                  <FileUpload accept={IMAGE_ACCEPT} label="عوض کردن عکس" onUploaded={(f) => void send(f.url)} />
                  <button type="button" onClick={takeBack} className="text-xs text-muted hover:text-red-700 underline">
                    پس گرفتن
                  </button>
                </div>
              )}
            </div>
          ) : (
            <FileUpload accept={IMAGE_ACCEPT} label="فرستادن عکس کودکی" onUploaded={(f) => void send(f.url)} />
          )}
        </div>
      )}

      {kid.gallery.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-ink-soft">بچه‌های دیروز</p>
          <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {kid.gallery.map((g) => (
              <li key={g.id} className="space-y-1 text-center">
                <img src={g.url} alt={`کودکی ${view.people[g.employeeId]?.name ?? 'همکار'}`} className="w-full aspect-square rounded-2xl object-cover border border-line" />
                <p className="text-[11px] font-bold truncate">{view.people[g.employeeId]?.name ?? 'همکار'}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {kid.me && <p className="text-xs text-ink-soft">شما {toPersianDigits(kid.me.correct)} عکس را درست حدس زدید (نفر {toPersianDigits(kid.me.rank)}).</p>}
    </section>
  );
};

/** On every phone in the hall, while a photo is on the big screen: whose is it? */
export const KidGuessCard: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const current = view.kid.current;
  if (!current || !view.kid.live) return null;

  const pick = async (employeeId: string) => {
    if (busy) return;
    setBusy(true);
    await run(() => api.put(`/api/event_kid_photos/${current.id}/guess`, { pick: employeeId }));
    setBusy(false);
  };

  return (
    <section id="event-kid-guess" className="rounded-3xl p-4 sm:p-5 space-y-3 bg-rose-950 text-white" aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-2">
        <Baby className="w-5 h-5 text-amber-300" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black">
          این بچه کیه؟
        </h2>
        <span className="ms-auto text-[11px] text-white/70">{toPersianDigits(current.guessed)} نفر حدس زده‌اند</span>
      </div>
      <div className="flex gap-3 items-start">
        <img src={current.url} alt="عکس کودکی روی صفحهٔ بزرگ" className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          {current.options.map((o, i) => {
            const mine = current.myPick === o;
            const right = current.revealed && current.ownerId === o;
            return (
              <button
                key={o}
                type="button"
                disabled={!current.canGuess || busy}
                onClick={() => void pick(o)}
                aria-pressed={mine}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-bold border-2 text-right disabled:cursor-default ${
                  right ? 'bg-emerald-500 border-emerald-300' : mine ? 'bg-white text-rose-950 border-white' : 'bg-white/10 border-white/20'
                }`}
              >
                <span className="flex-1 min-w-0 truncate">{view.people[o]?.name ?? 'همکار'}</span>
                {current.counts && <span className="text-xs tabular-nums opacity-80">{toPersianDigits(current.counts[i] ?? 0)}</span>}
                {right && <Check className="w-4 h-4" aria-label="جواب درست" />}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-white/80">
        {current.revealed
          ? current.myPick
            ? current.myPick === current.ownerId
              ? 'درست گفتید! 🎉'
              : `این عکس ${view.people[current.ownerId ?? '']?.name ?? 'همکار'} بود.`
            : `این عکس ${view.people[current.ownerId ?? '']?.name ?? 'همکار'} بود.`
          : current.isMine
            ? 'این عکس خود شماست؛ لو ندهید! 🤫'
            : current.canGuess
              ? current.myPick
                ? 'تا اعلام جواب می‌توانید حدستان را عوض کنید.'
                : 'یک اسم را انتخاب کنید.'
              : 'برگزارکنندگان و داوران عکس‌ها را از قبل دیده‌اند و حدس نمی‌زنند.'}
      </p>
    </section>
  );
};

/** On the remote: each photo goes on the big screen, then whose it was. */
export const KidRemote: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const { kid, me } = view;
  if (kid.photos.length === 0) return null;
  const onScreen = view.event.screen?.scene === 'kid' ? view.event.screen.kidPhotoId : null;

  const remove = (photoId: string) => {
    if (window.confirm('این عکس از بازی برداشته و پاک شود؟')) void run(() => api.delete(`/api/event_kid_photos/${photoId}`), 'عکس پاک شد.');
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-black text-ink flex items-center gap-1.5">
        <Baby className="w-4 h-4 text-red-700" aria-hidden /> این بچه کیه؟
        <span className="text-[11px] font-normal text-muted">{toPersianDigits(kid.photos.length)} عکس</span>
      </h2>
      {!kid.live && <p className="text-xs text-muted">عکس‌ها بعد از شروع برنامه روی صفحه می‌روند. اسم صاحب هر عکس فقط برای شما و داوران پیداست.</p>}
      <ul className="space-y-1.5">
        {kid.photos.map((p) => {
          const active = onScreen === p.id;
          return (
            <li key={p.id} className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border ${active ? 'border-red-700 bg-red-50' : 'border-line'}`}>
              <img src={p.url} alt={`عکس کودکی ${view.people[p.employeeId]?.name ?? 'همکار'}`} className="w-12 h-12 rounded-xl object-cover" />
              <span className="flex-1 min-w-0 text-xs">
                <span className="font-bold">{view.people[p.employeeId]?.name ?? 'همکار'}</span>
                <span className="block text-muted">{p.revealed ? `جواب اعلام شد · ${toPersianDigits(p.guessed)} حدس` : p.shown ? `روی صفحه رفته · ${toPersianDigits(p.guessed)} حدس` : 'هنوز نشان داده نشده'}</span>
              </span>
              {kid.live && (
                <button type="button" onClick={() => void run(() => api.post(`/api/event_kid_photos/${p.id}/show`))} aria-pressed={active} className={secondaryButtonClass}>
                  <Monitor className="w-3.5 h-3.5" /> {active ? 'روی صفحه است' : 'روی صفحه'}
                </button>
              )}
              {p.shown && !p.revealed && (
                <button type="button" onClick={() => void run(() => api.post(`/api/event_kid_photos/${p.id}/reveal`))} className={primaryButtonClass}>
                  <Eye className="w-3.5 h-3.5" /> بگو کیست
                </button>
              )}
              {me.isOrganizer && (
                <button type="button" onClick={() => remove(p.id)} className="p-1.5 text-muted hover:text-danger-700" aria-label={`پاک کردن عکس ${view.people[p.employeeId]?.name ?? 'همکار'}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {kid.leaders.length > 0 && (
        <p className="text-xs text-ink-soft">
          بهترین حدس‌ها:{' '}
          {kid.leaders
            .filter((l) => l.rank <= 3)
            .map((l) => `${view.people[l.employeeId]?.name ?? 'همکار'} (${toPersianDigits(l.correct)})`)
            .join('، ')}
        </p>
      )}
    </section>
  );
};

/** On the organizer's desk after the program: the night as a news draft, for the news publishers. */
export const ClosingNewsCard: React.FC<{ view: EventView }> = ({ view }) => {
  const run = useEventAction();
  const id = useId();
  const { setActiveTab } = usePortal();
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ newsId: string; canPublish: boolean } | null>(null);
  const { event, me } = view;
  if (!me.isOrganizer || !['live', 'memories', 'ended'].includes(event.phase)) return null;
  const newsId = made?.newsId ?? event.closingNewsId;
  const exists = Boolean(newsId);

  const make = async () => {
    setBusy(true);
    const result = await run(
      () => api.post<{ newsId: string; refreshed: boolean; canPublish: boolean }>(`/api/special_events/${event.id}/closing_news`),
      exists ? 'پیش‌نویس با آخرین نتیجه‌ها به‌روز شد.' : 'پیش‌نویس خبر پایانی ساخته شد.',
    );
    if (result) setMade({ newsId: result.newsId, canPublish: result.canPublish });
    setBusy(false);
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-black text-ink flex items-center gap-1.5">
        <Newspaper className="w-4 h-4 text-red-700" aria-hidden /> خبر پایانی
      </h2>
      <p className="text-xs text-ink-soft leading-relaxed">
        با یک دکمه، گزارش شب (قهرمان‌ها، برنده‌های انتخاب‌ها و بازی‌های همه، چند آرزو و تشکر از برگزارکنندگان و داوران) به‌صورت پیش‌نویس خبر ساخته می‌شود. مسئول اخبار آن را
        می‌خواند، عکس اضافه می‌کند و از بخش اخبار منتشر می‌کند.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void make()} className={primaryButtonClass}>
          {exists ? 'به‌روز کردن پیش‌نویس' : 'ساختن پیش‌نویس خبر پایانی'}
        </button>
        {newsId && (made?.canPublish ?? true) && (
          <button type="button" onClick={() => setActiveTab('news', newsId)} className="text-xs text-red-700 underline">
            دیدن پیش‌نویس در اخبار
          </button>
        )}
        {made && !made.canPublish && <span className="text-xs text-muted">پیش‌نویس برای مسئول اخبار آماده است.</span>}
      </div>
    </section>
  );
};
