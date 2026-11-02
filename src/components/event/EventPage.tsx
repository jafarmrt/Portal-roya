import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock, MapPin, Plus, Sparkles } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { PageHeader } from '../common/PageHeader';
import { EmptyState } from '../common/Placeholder';
import { primaryButtonClass } from '../common/Modal';
import { CompetitionCard } from './CompetitionCard';
import { CompetitionFormModal } from './CompetitionFormModal';
import { AwardsSection } from './AwardsSection';
import { FunSection } from './FunSection';
import { GuessCard, PredictionsSection } from './GamesSection';
import { FalCard, ScheduleCard } from './NightSection';
import { QuizEditor, QuizPlayCard } from './QuizSection';
import { WheelCard, WishesCard, WishesModeration } from './WishesSection';
import { Countdown, JuryStrip, NowCard } from './EventParts';
import { CreateEventForm, EventSettings } from './EventSettings';
import { OrganizerConsole } from './OrganizerConsole';
import { RemotePanel } from './RemotePanel';
import { PhaseChip, heroStyle } from './eventUi';
import { COMPETITIONS_MAX } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import { hasEvent, type EventView } from './types';

type Section = 'competitions' | 'fun' | 'console' | 'remote' | 'settings';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'competitions', label: 'مسابقه‌ها' },
  { id: 'fun', label: 'فال، آرزو، آهنگ' },
  { id: 'console', label: 'میز برگزارکننده' },
  { id: 'remote', label: 'ریموت صفحهٔ بزرگ' },
  { id: 'settings', label: 'تنظیمات' },
];

/** Places on the page a notification or a «الان چه کنم؟» line can point to. */
const FOCUS_IDS: Record<string, string> = {
  objections: 'event-objections',
  awards: 'event-awards',
  fun: 'event-fun',
  predict: 'event-predict',
  guess: 'event-guess',
  schedule: 'event-schedule',
  quiz: 'event-quiz',
  wishes: 'event-wishes',
  wheel: 'event-wheel',
};

const Hero: React.FC<{ view: EventView }> = ({ view }) => {
  const { event } = view;
  return (
    <section className="rounded-3xl text-white p-5 sm:p-7 overflow-hidden relative" style={heroStyle}>
      <span className="absolute -left-6 -top-6 text-[120px] opacity-15 select-none pointer-events-none" aria-hidden>
        {event.theme === 'yalda' ? '🍉' : '✨'}
      </span>
      <div className="relative flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <PhaseChip phase={event.phase} />
            {event.status === 'draft' && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-300 text-amber-950">پیش‌نویس؛ همکاران هنوز نمی‌بینند</span>}
            {event.testPhase && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/20">حالت امتحان</span>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">{event.title}</h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-white/85">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="w-4 h-4" aria-hidden /> {toPersianDigits(event.programDate)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-4 h-4" aria-hidden /> ساعت {toPersianDigits(event.programTime)}
            </span>
            {event.programPlace && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" aria-hidden /> {event.programPlace}
              </span>
            )}
          </p>
          {event.intro && <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line max-w-2xl">{event.intro}</p>}
          {event.phase === 'signup' && <p className="text-xs text-amber-200 font-bold">ثبت‌نام تا پایان {toPersianDigits(event.signupEnd)}</p>}
        </div>
        <Countdown view={view} />
      </div>
    </section>
  );
};

/**
 * «رویداد ویژه» (شب یلدا): the page everyone sees while the administrator has it switched on, with the
 * competitions, the jury and each colleague's next step; organizers and jurors get their desk and the
 * remote of the big screen; those who manage events set it all up here.
 */
export const EventPage: React.FC = () => {
  const { specialEvent, isGuest, requestLogin, focusId } = usePortal();
  const [section, setSection] = useState<Section>('competitions');
  const [creating, setCreating] = useState(false);

  // A notification opens #event/<competition> (or #event/objections): scroll to it.
  const loaded = Boolean(specialEvent?.event);
  useEffect(() => {
    if (!focusId || !loaded) return undefined;
    if (focusId === 'objections') setSection('console');
    if (focusId === 'fun' || focusId === 'wishes' || focusId === 'wheel') setSection('fun');
    if (focusId === 'predict' || focusId === 'guess' || focusId === 'schedule') setSection('competitions');
    const timer = window.setTimeout(
      () =>
        document
          .getElementById(FOCUS_IDS[focusId] ?? `competition-${focusId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [focusId, loaded]);

  if (!specialEvent) return null;
  if (!hasEvent(specialEvent)) {
    if (specialEvent.loginRequired) {
      return (
        <EmptyState
          icon={<Sparkles className="w-8 h-8" />}
          title="برای دیدن رویداد وارد شوید"
          action={
            <button type="button" onClick={() => requestLogin()} className={primaryButtonClass}>
              ورود
            </button>
          }
        />
      );
    }
    if (specialEvent.canManage) {
      return (
        <div className="space-y-5">
          <PageHeader icon={<Sparkles />} title="رویداد ویژه" description="برای مناسبت‌هایی مثل شب یلدا: مسابقه، ثبت‌نام، جدول، داوری و صفحهٔ بزرگ." />
          <CreateEventForm />
        </div>
      );
    }
    return <EmptyState icon={<Sparkles className="w-8 h-8" />} title="الان رویداد ویژه‌ای در جریان نیست" />;
  }

  const view = specialEvent;
  const { me, event } = view;
  const sections = SECTIONS.filter((s) => (s.id === 'console' || s.id === 'remote' ? me.referee : s.id === 'settings' ? view.canManage : true));
  const current = sections.some((s) => s.id === section) ? section : 'competitions';
  const juryShown = event.phase !== 'signup' || me.referee;

  const jump = (target: string) => {
    if (target === 'console' || target === 'objections') {
      setSection('console');
      if (target === 'objections') window.setTimeout(() => document.getElementById('event-objections')?.scrollIntoView({ behavior: 'smooth' }), 100);
      return;
    }
    if (target === 'fun' || target === 'wishes' || target === 'wheel') {
      setSection('fun');
      if (target !== 'fun') window.setTimeout(() => document.getElementById(FOCUS_IDS[target])?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      return;
    }
    setSection('competitions');
    const id = FOCUS_IDS[target] ?? `competition-${target}`;
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <Hero view={view} />
      <QuizPlayCard view={view} />
      <NowCard view={view} onJump={jump} />

      {sections.length > 1 && (
        <div role="tablist" aria-label="بخش‌های رویداد" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={current === s.id}
              onClick={() => setSection(s.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap border ${current === s.id ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-line text-ink hover:bg-surface'}`}
            >
              {s.label}
              {s.id === 'console' && view.objections.some((o) => o.status === 'open') && <span className="ms-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 align-middle" aria-label="اعتراض باز" />}
              {s.id === 'console' && view.wishes.waiting.some((w) => w.status === 'pending') && <span className="ms-1.5 inline-block w-2 h-2 rounded-full bg-red-400 align-middle" aria-label="آرزوی منتظر تأیید" />}
            </button>
          ))}
        </div>
      )}

      {current === 'competitions' && (
        <div className="space-y-4">
          {juryShown && <JuryStrip view={view} />}
          <ScheduleCard view={view} />
          <PredictionsSection view={view} />
          <GuessCard key={view.guess ? 'on' : 'off'} view={view} />
          {view.competitions.length === 0 ? (
            <EmptyState icon={<Sparkles className="w-8 h-8" />} title="هنوز مسابقه‌ای اعلام نشده" hint={me.isOrganizer ? 'با دکمهٔ زیر اولین مسابقه را بسازید.' : 'به‌زودی مسابقه‌ها اینجا می‌آیند.'} compact />
          ) : (
            <div className="grid lg:grid-cols-2 gap-4 items-start">
              {view.competitions.map((c) => (
                <CompetitionCard key={c.id} view={view} competition={c} />
              ))}
            </div>
          )}
          {me.isOrganizer && view.competitions.length < COMPETITIONS_MAX && (
            <button type="button" onClick={() => setCreating(true)} className={`${primaryButtonClass} mx-auto`}>
              <Plus className="w-4 h-4" /> مسابقهٔ تازه
            </button>
          )}
          {isGuest && <p className="text-xs text-muted text-center">برای ثبت‌نام در مسابقه‌ها وارد حساب کاربری شوید.</p>}
          <AwardsSection view={view} />
        </div>
      )}
      {current === 'fun' && (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <FalCard view={view} />
            <WheelCard view={view} />
          </div>
          <WishesCard view={view} />
          <FunSection view={view} />
        </div>
      )}
      {current === 'console' && (
        <div className="space-y-4">
          <OrganizerConsole view={view} />
          <WishesModeration view={view} />
          <QuizEditor view={view} />
        </div>
      )}
      {current === 'remote' && <RemotePanel view={view} />}
      {current === 'settings' && <EventSettings view={view} />}

      {creating && <CompetitionFormModal eventId={event.id} onClose={() => setCreating(false)} />}
    </div>
  );
};
