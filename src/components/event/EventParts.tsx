import React, { useEffect, useState } from 'react';
import { Gavel, Lightbulb, Scale } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { entryName, isReady, matchWhen, myEntries, nextMatchOf, PersonAvatar } from './eventUi';
import { programStart, scheduleNow } from '../../../shared/specialEvents';
import { toJalali, toPersianDigits } from '../../lib/jalali';
import type { EventView } from './types';

/** Seconds until a moment, ticking every second (or every minute when it is far away). */
export function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  const step = left > 3 * 3600 ? 60_000 : 1000;
  useEffect(() => {
    if (left === 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), step);
    return () => window.clearInterval(timer);
  }, [left === 0, step]); // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}

/** «۲ روز و ۳ ساعت» or «۰۲:۱۴:۰۵». */
export function countdownText(sec: number) {
  if (sec <= 0) return '';
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${toPersianDigits(days)} روز${hours > 0 ? ` و ${toPersianDigits(hours)} ساعت` : ''}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return toPersianDigits(`${pad(hours)}:${pad(minutes)}:${pad(sec % 60)}`);
}

export const Countdown: React.FC<{ view: EventView }> = ({ view }) => {
  const left = useCountdown(programStart(view.event));
  if (left <= 0) return null;
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-2 text-center">
      <p className="text-[11px] text-white/70">تا شروع برنامه</p>
      <p className="text-lg font-black tabular-nums" aria-live="off">
        {countdownText(left)}
      </p>
    </div>
  );
};

interface NowLine {
  text: string;
  /** The competition to jump to, if any. */
  target?: string;
}

/** What this colleague should do right now, in one or two lines. */
function nowLines(view: EventView, userId: string | undefined, isGuest: boolean): NowLine[] {
  const { event, me } = view;
  const phase = event.phase;
  if (isGuest) return [{ text: 'برای ثبت‌نام و دیدن بازی‌های خودتان وارد حساب کاربری شوید.' }];
  const lines: NowLine[] = [];
  const mine = myEntries(view, userId);

  if (me.decides) {
    const open = view.objections.filter((o) => o.status === 'open').length;
    if (open > 0) lines.push({ text: `${toPersianDigits(open)} اعتراض منتظر رأی ${event.juryIds.length > 0 ? 'هیئت داوران' : 'شما'} است.`, target: 'objections' });
    // A shared first place waits for whoever decides.
    for (const c of view.competitions.filter((x) => x.championTie.length > 0)) lines.push({ text: `رتبهٔ اول «${c.title}» مساوی شد؛ قهرمان را انتخاب کنید.`, target: c.id });
  }
  if (me.referee && (phase === 'matchday' || phase === 'live')) {
    const due = view.competitions.flatMap((c) => c.matches.filter((m) => isReady(c, m) && !m.done && m.day === event.programDate && !m.onStage));
    if (due.length > 0) lines.push({ text: `${toPersianDigits(due.length)} بازی روز امروز هنوز نتیجه ندارد؛ نتیجه‌ها را از «میز برگزارکننده» ثبت کنید.`, target: 'console' });
  }
  // «انتخاب‌های یلدا»: the head settles a tie, jurors vote, a shortlisted colleague may step down, everyone nominates.
  const { awards, awardsInfo } = view;
  if (awards.some((a) => a.tie.length > 0)) lines.push({ text: 'رأی‌های یکی از بخش‌های انتخاب‌ها مساوی شد؛ انتخاب برنده با شماست.', target: 'awards' });
  if (awardsInfo.votes && awardsInfo.publishedAt && !awardsInfo.closedAt) {
    const left = awards.filter((a) => !a.myVote && a.nominees.some((n) => !n.withdrawn && !n.removed)).length;
    if (left > 0) lines.push({ text: `در ${toPersianDigits(left)} بخش انتخاب‌ها هنوز رأی نداده‌اید.`, target: 'awards' });
  }
  if (awardsInfo.canStepDown && awardsInfo.onShortlist.length > 0) {
    lines.push({ text: 'شما در انتخاب‌های یلدا نامزد شده‌اید 🎉 اگر نمی‌خواهید، تا انتشار فهرست انصراف دهید.', target: 'awards' });
  }
  if (phase === 'signup' && !awardsInfo.shortlistedAt && !(userId && event.juryIds.includes(userId))) {
    const left = awards.filter((a) => !a.myNomination).length;
    if (left > 0) lines.push({ text: `در ${toPersianDigits(left)} بخش «انتخاب‌ها» هنوز کسی را معرفی نکرده‌اید.`, target: 'awards' });
  }

  // Everyone, players or not: a song for the night.
  if (phase === 'signup' && !view.songs.some((s) => s.mine)) lines.push({ text: 'آهنگی برای شب یلدا پیشنهاد بدهید یا به آهنگ همکاران «من هم» بدهید 🎵', target: 'fun' });
  if (phase === 'live' || phase === 'matchday') {
    const { current, next } = scheduleNow(event.schedule, event.programDate, new Date(), (d) => toJalali(d), (d) => toJalali(d, 'HH:mm'));
    if (current || next) {
      lines.push({
        text: [current && `الان: ${current.title}`, next && `بعدی ساعت ${toPersianDigits(next.time)}: ${next.title}`].filter(Boolean).join(' · '),
        target: 'schedule',
      });
    }
  }
  const q = view.quiz.current;
  if (q && view.quiz.live && view.quiz.canPlay && q.open && q.myChoice === null) lines.push({ text: `سؤال ${toPersianDigits(q.index)} مسابقهٔ همه باز است؛ زود جواب بدهید! ⏱️`, target: 'quiz' });
  const pendingWishes = view.wishes.waiting.filter((w) => w.status === 'pending').length;
  if (me.isOrganizer && pendingWishes > 0) lines.push({ text: `${toPersianDigits(pendingWishes)} آرزوی یلدا منتظر تأیید شماست.`, target: 'console' });
  if ((phase === 'matchday' || phase === 'live') && view.wishes.canWrite && view.wishes.mine.length === 0 && userId) {
    lines.push({ text: 'یک آرزوی کوتاه برای سال تازه بنویسید؛ امشب روی صفحهٔ بزرگ می‌آید 🕯️', target: 'wishes' });
  }
  if (phase === 'live' && userId && !view.wheel.inIt && !view.wheel.organizer) {
    lines.push({ text: 'اسم شما هنوز در گردونهٔ شانس نیست؛ با یک فال، پیش‌بینی یا آرزو اسمتان به گردونه می‌رود 🎡', target: 'wheel' });
  }
  const waiting = view.predictions.me?.waiting ?? 0;
  if (waiting > 0) lines.push({ text: `${toPersianDigits(waiting)} بازی منتظر پیش‌بینی شماست؛ حدس بزنید چه کسی می‌برد 🔮`, target: 'predict' });
  if (view.guess?.canGuess && view.guess.mine === null) lines.push({ text: `«${view.guess.question}» حدستان را تا شروع برنامه بنویسید 🎯`, target: 'guess' });

  if (userId && event.juryIds.includes(userId)) {
    lines.push({ text: 'شما داور رویداد هستید: نتیجه‌ها، اصلاح‌ها و اعتراض‌ها با هیئت داوران است و در هیچ مسابقه‌ای شرکت نمی‌کنید.' });
    return lines;
  }

  if (phase === 'signup') {
    const before = lines.length;
    if (mine.size === 0) {
      lines.push({ text: `در مسابقه‌ها ثبت‌نام کنید؛ تنها یا با تیم. ثبت‌نام تا پایان ${toPersianDigits(event.signupEnd)} باز است.`, target: view.competitions[0]?.id });
    } else {
      for (const c of view.competitions) {
        const entry = mine.get(c.id);
        if (!entry) continue;
        if (entry.status === 'waitlist') lines.push({ text: `در «${c.title}» در فهرست انتظارید (نفر ${toPersianDigits(entry.waitlistPosition ?? 0)})؛ اگر جایی باز شود خبرتان می‌کنیم.`, target: c.id });
        else if (c.kind === 'team' && entry.members.length < c.teamMin)
          lines.push({ text: `تیم «${entry.name}» در «${c.title}» ${toPersianDigits(c.teamMin - entry.members.length)} نفر کم دارد؛ هم‌تیمی اضافه کنید.`, target: c.id });
      }
      if (lines.length === before) lines.push({ text: `ثبت‌نام شما در ${toPersianDigits(mine.size)} مسابقه قطعی است. بعد از ${toPersianDigits(event.signupEnd)} قرعه کشیده می‌شود.` });
    }
    return lines;
  }

  if (phase === 'memories' || phase === 'ended') {
    lines.push({ text: 'ممنون که بودید! قهرمان‌ها و جدول کامل مسابقه‌ها را پایین ببینید 🍉' });
    return lines;
  }

  // brackets, matchday, live: the next match of each of mine.
  for (const c of view.competitions) {
    const entry = mine.get(c.id);
    if (!entry || !c.bracketVisible) continue;
    const next = nextMatchOf(c, entry.id);
    if (!next) continue;
    if (c.format === 'ranking') {
      lines.push({ text: `نوبت اجرای شما در «${c.title}»: ${next.roundName}، ${matchWhen(next)}${next.day && next.day !== event.programDate && !next.onStage ? ` (${toPersianDigits(next.day)})` : ''}.`, target: c.id });
      continue;
    }
    const other = next.entryA === entry.id ? next.entryB : next.entryA;
    const rival = other ? entryName(c.entries.find((e) => e.id === other), view.people) : 'برندهٔ بازی قبل';
    lines.push({ text: `بازی بعدی شما در «${c.title}»: ${matchWhen(next)}${next.day && next.day !== event.programDate ? ` (${toPersianDigits(next.day)})` : ''}، مقابل ${rival}.`, target: c.id });
  }
  if (lines.length === 0) {
    lines.push({
      text:
        phase === 'live'
          ? 'برنامه شروع شده؛ بازی‌های روی صحنه و جدول‌ها اینجا زنده به‌روز می‌شوند.'
          : `جدول‌ها را دنبال کنید و ساعت ${toPersianDigits(event.programTime)} روز ${toPersianDigits(event.programDate)}${event.programPlace ? ` در ${event.programPlace}` : ''} منتظرتان هستیم.`,
    });
  }
  return lines;
}

/** «الان چه کنم؟»: the one card that tells each colleague their next step. */
export const NowCard: React.FC<{ view: EventView; onJump: (target: string) => void }> = ({ view, onJump }) => {
  const { currentUser, isGuest } = usePortal();
  const lines = nowLines(view, currentUser?.id, isGuest);
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-3xl p-4 sm:p-5 flex gap-3" aria-labelledby="event-now-title">
      <span className="w-10 h-10 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center shrink-0" aria-hidden>
        <Lightbulb className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="event-now-title" className="text-sm font-black text-amber-950">
          الان چه کنم؟
        </h2>
        <ul className="mt-1 space-y-1">
          {lines.map((line, i) => (
            <li key={i} className="text-xs sm:text-sm text-amber-950 leading-relaxed">
              {line.target ? (
                <button type="button" onClick={() => onJump(line.target!)} className="text-right underline decoration-amber-400 underline-offset-4 hover:decoration-amber-700">
                  {line.text}
                </button>
              ) : (
                line.text
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/** The jury of the event, with their photos: shown to everyone from the draw on (and to organizers always). */
export const JuryStrip: React.FC<{ view: EventView; fileUrl?: (url: string) => string; big?: boolean }> = ({ view, fileUrl = (u) => u, big }) => {
  const { event, people } = view;
  if (event.juryIds.length === 0) return null;
  const ordered = [...event.juryIds].sort((a, b) => (a === event.juryHeadId ? -1 : b === event.juryHeadId ? 1 : 0));
  return (
    <section className={big ? '' : 'bg-white border border-line rounded-3xl p-4 sm:p-5'} aria-labelledby={big ? undefined : 'event-jury-title'}>
      {!big && (
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-4 h-4 text-red-700" aria-hidden />
          <h2 id="event-jury-title" className="text-sm font-black text-ink">
            هیئت داوران
          </h2>
          <span className="text-[11px] text-muted">نتیجه‌ها، اصلاح‌ها و اعتراض‌ها با آن‌هاست؛ خودشان در هیچ مسابقه‌ای نیستند.</span>
        </div>
      )}
      <ul className={`flex flex-wrap justify-center ${big ? 'gap-10' : 'gap-4'}`}>
        {ordered.map((id) => {
          const person = people[id];
          const photo = event.juryPhotos[id] || person?.avatarUrl;
          const head = id === event.juryHeadId;
          return (
            <li key={id} className={`flex flex-col items-center text-center ${big ? 'w-56' : 'w-24'}`}>
              <div className="relative">
                <PersonAvatar
                  person={person}
                  src={photo ? fileUrl(photo) : undefined}
                  className={`${big ? 'w-44 h-44 text-5xl' : 'w-16 h-16 text-xl'} rounded-full object-cover ${head ? 'ring-4 ring-amber-400' : 'ring-2 ring-line'}`}
                />
                {head && (
                  <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 rounded-full font-black flex items-center gap-1 whitespace-nowrap ${big ? 'px-3 py-1 text-lg' : 'px-2 py-0.5 text-[10px]'}`}>
                    <Gavel className={big ? 'w-5 h-5' : 'w-3 h-3'} aria-hidden />
                    رئیس
                  </span>
                )}
              </div>
              <p className={`mt-2 font-black ${big ? 'text-3xl' : 'text-xs text-ink'}`}>{person?.name ?? 'همکار'}</p>
              {person?.position && <p className={`${big ? 'text-xl opacity-75' : 'text-[11px] text-muted'} truncate max-w-full`}>{person.position}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
