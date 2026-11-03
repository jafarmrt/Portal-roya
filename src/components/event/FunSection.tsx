import React, { useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, EyeOff, Eye, Heart, Lightbulb, Music, Plus, Trash2 } from 'lucide-react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { usePortal } from '../../context/PortalContext';
import { ApiError } from '../../lib/api';
import { api, useEventAction } from './eventUi';
import {
  IDEA_KINDS,
  IDEA_MAX,
  IDEA_REPLY_MAX,
  IDEAS_PER_PERSON,
  SONG_ARTIST_MAX,
  SONG_NOTE_MAX,
  SONG_TITLE_MAX,
  SONGS_PER_PERSON,
  ideasOpen,
  songKey,
  songsOpen,
  type IdeaKind,
} from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventIdea, EventSong, EventView } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-3';

/** «پیشنهاد آهنگ»: up to three songs each, «من هم» for the others' songs, the most wanted first. */
const SongsSection: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest, currentUser } = usePortal();
  const run = useEventAction();
  const id = useId();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [note, setNote] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const { event, me } = view;
  const open = songsOpen(event.phase) && (event.status === 'active' || me.referee);
  const mine = view.songs.filter((s) => s.mine).length;
  const nowPlaying = event.screen?.songId ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const ok = await run(() => api.post(`/api/special_events/${event.id}/songs`, { title: title.trim(), artist: artist.trim(), note: note.trim(), anonymous }), 'آهنگ به فهرست اضافه شد.', { quiet409: true });
      if (ok) {
        setTitle('');
        setArtist('');
        setNote('');
      }
    } catch (err) {
      // The same song is already there: show it, so a «من هم» is one tap away.
      if (err instanceof ApiError && err.status === 409) {
        toast(err.message, { icon: '🎵' });
        const key = songKey(title, artist);
        const same = view.songs.find((s) => songKey(s.title, s.artist) === key);
        setFlash(same?.id ?? null);
        window.setTimeout(() => document.getElementById(`song-${same?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        window.setTimeout(() => setFlash(null), 4000);
      }
    }
    setBusy(false);
  };

  const vote = (song: EventSong) => run(() => api.put(`/api/event_songs/${song.id}/vote`, { on: !song.myVote }));

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-2">
        <Music className="w-4 h-4 text-red-700" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          آهنگ‌های شب
        </h2>
        <span className="text-[11px] text-muted">هر نفر تا {toPersianDigits(SONGS_PER_PERSON)} آهنگ؛ به آهنگ دیگران «من هم» بدهید.</span>
      </div>

      {open && !isGuest && currentUser && (
        mine < SONGS_PER_PERSON ? (
          <form onSubmit={submit} className="grid sm:grid-cols-2 gap-2 p-3 rounded-2xl bg-surface">
            <div>
              <label htmlFor={`${id}-song`} className={labelClass}>
                نام آهنگ
              </label>
              <input id={`${id}-song`} value={title} maxLength={SONG_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="مثلاً شب یلدا" />
            </div>
            <div>
              <label htmlFor={`${id}-artist`} className={labelClass}>
                خواننده
              </label>
              <input id={`${id}-artist`} value={artist} maxLength={SONG_ARTIST_MAX} onChange={(e) => setArtist(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-note`} className={labelClass}>
                یک جملهٔ کوتاه (اختیاری)
              </label>
              <input id={`${id}-note`} value={note} maxLength={SONG_NOTE_MAX} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="مثلاً برای واحد فروش 🙂" />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="w-4 h-4 accent-red-700" />
              بدون نام من
            </label>
            <button type="submit" disabled={!title.trim() || busy} className={`${primaryButtonClass} justify-self-end`}>
              <Plus className="w-4 h-4" /> پیشنهاد آهنگ
            </button>
          </form>
        ) : (
          <p className="text-xs text-muted">{toPersianDigits(SONGS_PER_PERSON)} آهنگ پیشنهاد داده‌اید؛ اگر آهنگ دیگری می‌خواهید، یکی از قبلی‌ها را حذف کنید.</p>
        )
      )}

      {view.songs.length === 0 ? (
        <p className="text-xs text-muted">هنوز آهنگی پیشنهاد نشده است.</p>
      ) : (
        <ol ref={listRef} className="space-y-1.5" aria-label="فهرست آهنگ‌ها، به ترتیب محبوبیت">
          {view.songs.map((s, i) => (
            <li
              key={s.id}
              id={`song-${s.id}`}
              className={`flex items-center gap-2 p-2.5 rounded-2xl border transition ${flash === s.id ? 'border-amber-400 ring-2 ring-amber-300' : 'border-line'} ${s.hidden ? 'opacity-60 border-dashed' : ''}`}
            >
              <span className="w-6 text-center text-xs font-black text-muted tabular-nums shrink-0">{toPersianDigits(i + 1)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-ink truncate">
                  {s.title}
                  {s.artist && <span className="font-bold text-muted"> · {s.artist}</span>}
                  {nowPlaying === s.id && <span className="ms-2 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900">در حال پخش</span>}
                  {s.playedAt && nowPlaying !== s.id && <span className="ms-2 text-[10px] text-emerald-700">پخش شد</span>}
                </p>
                <p className="text-[11px] text-muted truncate">
                  {s.byId ? view.people[s.byId]?.name : s.mine ? 'شما (بدون نام)' : 'بدون نام'}
                  {s.note && ` · «${s.note}»`}
                  {s.hidden && ' · پنهان شده'}
                </p>
              </div>
              {s.mine ? (
                <>
                  <span className="text-[11px] font-bold text-muted tabular-nums">{toPersianDigits(s.votes)} نفر</span>
                  {!s.playedAt && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`«${s.title}» از فهرست حذف شود؟`)) void run(() => api.delete(`/api/event_songs/${s.id}`), 'حذف شد.');
                      }}
                      className="p-1.5 rounded-lg hover:bg-danger-50 text-danger-700"
                      aria-label={`حذف ${s.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={!open || isGuest || s.hidden}
                  onClick={() => void vote(s)}
                  aria-pressed={s.myVote}
                  aria-label={`من هم: ${s.title} (${toPersianDigits(s.votes)} نفر)`}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border disabled:opacity-60 ${s.myVote ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong text-ink hover:bg-surface'}`}
                >
                  <Heart className={`w-3.5 h-3.5 ${s.myVote ? 'fill-current' : ''}`} aria-hidden /> من هم ({toPersianDigits(s.votes)})
                </button>
              )}
              {me.isOrganizer && (
                <button
                  type="button"
                  onClick={() => void run(() => api.post(`/api/event_songs/${s.id}/hide`, { hidden: !s.hidden }), s.hidden ? 'آهنگ برگشت.' : 'آهنگ پنهان شد.')}
                  className="p-1.5 rounded-lg hover:bg-surface text-muted"
                  aria-label={s.hidden ? `برگرداندن ${s.title}` : `پنهان کردن ${s.title}`}
                >
                  {s.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

/** One idea, its likes, and for the organizers «انجام می‌دهیم» with a line, or hiding it. */
const IdeaItem: React.FC<{ view: EventView; idea: EventIdea; open: boolean }> = ({ view, idea, open }) => {
  const { isGuest } = usePortal();
  const run = useEventAction();
  const [answering, setAnswering] = useState(false);
  const [reply, setReply] = useState(idea.reply);
  const kind = IDEA_KINDS.find((k) => k.id === idea.kind);
  const organizer = view.me.isOrganizer;
  return (
    <li className={`p-3 rounded-2xl border space-y-2 ${idea.doing ? 'border-emerald-300 bg-emerald-50/50' : 'border-line'} ${idea.hidden ? 'opacity-60 border-dashed' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none" aria-hidden>
          {kind?.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink whitespace-pre-line break-words">{idea.text}</p>
          <p className="text-[11px] text-muted mt-0.5">
            {kind?.label} · {idea.byId ? view.people[idea.byId]?.name : idea.mine ? 'شما (بدون نام)' : 'بدون نام'}
            {idea.hidden && ' · پنهان شده'}
          </p>
        </div>
        {idea.mine ? (
          <span className="text-[11px] font-bold text-muted shrink-0">♥ {toPersianDigits(idea.likes)}</span>
        ) : (
          <button
            type="button"
            disabled={!open || isGuest || idea.hidden}
            onClick={() => void run(() => api.put(`/api/event_ideas/${idea.id}/like`, { on: !idea.myLike }))}
            aria-pressed={idea.myLike}
            aria-label={`پسند ایده (${toPersianDigits(idea.likes)} نفر)`}
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border disabled:opacity-60 ${idea.myLike ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong text-ink hover:bg-surface'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${idea.myLike ? 'fill-current' : ''}`} aria-hidden /> {toPersianDigits(idea.likes)}
          </button>
        )}
        {idea.mine && !idea.doing && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('این ایده حذف شود؟')) void run(() => api.delete(`/api/event_ideas/${idea.id}`), 'حذف شد.');
            }}
            className="p-1.5 rounded-lg hover:bg-danger-50 text-danger-700 shrink-0"
            aria-label="حذف ایده"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {idea.doing && (
        <p className="text-xs text-emerald-900 font-bold flex items-center gap-1.5">
          <Check className="w-4 h-4" aria-hidden /> انجام می‌دهیم{idea.reply && <span className="font-normal">: {idea.reply}</span>}
        </p>
      )}
      {!idea.doing && idea.reply && <p className="text-xs text-ink-soft">پاسخ برگزارکننده: {idea.reply}</p>}
      {organizer && (
        answering ? (
          <div className="flex flex-wrap gap-2">
            <input value={reply} maxLength={IDEA_REPLY_MAX} onChange={(e) => setReply(e.target.value)} className={`${inputClass} flex-1 min-w-[12rem]`} placeholder="یک خط برای همه (اختیاری)" aria-label="پاسخ به ایده" />
            <button
              type="button"
              onClick={() => void run(() => api.post(`/api/event_ideas/${idea.id}/answer`, { doing: true, reply: reply.trim() }), 'ثبت شد؛ نویسنده باخبر می‌شود.').then(() => setAnswering(false))}
              className={primaryButtonClass}
            >
              <Check className="w-4 h-4" /> انجام می‌دهیم
            </button>
            <button
              type="button"
              onClick={() => void run(() => api.post(`/api/event_ideas/${idea.id}/answer`, { doing: false, reply: reply.trim() }), 'پاسخ ثبت شد.').then(() => setAnswering(false))}
              className={secondaryButtonClass}
            >
              فقط پاسخ
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setAnswering(true)} className={`${secondaryButtonClass} text-[11px]`}>
              پاسخ برگزارکننده
            </button>
            <button
              type="button"
              onClick={() => void run(() => api.post(`/api/event_ideas/${idea.id}/answer`, { hidden: !idea.hidden }), idea.hidden ? 'ایده برگشت.' : 'ایده پنهان شد.')}
              className={`${secondaryButtonClass} text-[11px]`}
            >
              {idea.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {idea.hidden ? 'برگرداندن' : 'پنهان کردن'}
            </button>
          </div>
        )
      )}
    </li>
  );
};

/** «امسال چه کنیم؟»: ideas for the program, public and light, for this event only. */
const IdeasSection: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest, currentUser } = usePortal();
  const run = useEventAction();
  const id = useId();
  const [kind, setKind] = useState<IdeaKind>('game');
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const { event, me } = view;
  const open = ideasOpen(event.phase) && (event.status === 'active' || me.referee);
  const mine = view.ideas.filter((i) => i.mine).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    const ok = await run(() => api.post(`/api/special_events/${event.id}/ideas`, { kind, text: text.trim(), anonymous }), 'ایده ثبت شد.');
    setBusy(false);
    if (ok) setText('');
  };

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" aria-hidden />
        <h2 id={`${id}-title`} className="text-sm font-black text-ink">
          امسال چه کنیم؟
        </h2>
        <span className="text-[11px] text-muted">ایده برای بازی، خوراکی، دکور یا اجرا؛ برگزارکننده جواب می‌دهد.</span>
      </div>

      {open && !isGuest && currentUser && mine < IDEAS_PER_PERSON && (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-2xl bg-surface">
          <fieldset>
            <legend className="sr-only">نوع ایده</legend>
            <div className="flex flex-wrap gap-1.5">
              {IDEA_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${kind === k.id ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line-strong text-ink'}`}
                >
                  {k.icon} {k.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label htmlFor={`${id}-text`} className="sr-only">
            ایدهٔ شما
          </label>
          <textarea id={`${id}-text`} value={text} maxLength={IDEA_MAX} rows={2} onChange={(e) => setText(e.target.value)} className={inputClass} placeholder="مثلاً مسابقهٔ شعرخوانی حافظ بین واحدها" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="w-4 h-4 accent-red-700" />
              بدون نام من
            </label>
            <button type="submit" disabled={text.trim().length < 3 || busy} className={`${primaryButtonClass} ms-auto`}>
              <Plus className="w-4 h-4" /> ثبت ایده
            </button>
          </div>
        </form>
      )}
      {!open && event.phase !== 'signup' && <p className="text-[11px] text-muted">وقت ایده دادن برای امسال تمام شده است.</p>}

      {view.ideas.length === 0 ? (
        <p className="text-xs text-muted">هنوز ایده‌ای ثبت نشده است.</p>
      ) : (
        <ul className="space-y-2">
          {view.ideas.map((idea) => (
            <IdeaItem key={idea.id} view={view} idea={idea} open={open} />
          ))}
        </ul>
      )}
    </section>
  );
};

/** «آهنگ‌ها و ایده‌ها»: the part of the page for everyone, not only the players. */
export const FunSection: React.FC<{ view: EventView }> = ({ view }) => (
  <div className="grid lg:grid-cols-2 gap-4 items-start" id="event-fun">
    <SongsSection view={view} />
    <IdeasSection view={view} />
  </div>
);
