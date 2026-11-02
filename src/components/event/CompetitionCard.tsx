import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Crown, LogOut, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { Bracket, MatchCard } from './Bracket';
import { ObjectionModal } from './ObjectionModal';
import { ResultModal } from './ResultModal';
import { TeamModal } from './TeamModal';
import { CompetitionFormModal } from './CompetitionFormModal';
import { EntryPicture, api, entryName, knockedOut, nextMatchOf, useEventAction } from './eventUi';
import { SCORINGS, STAGE_POLICIES, TIE_RULES } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventMatch, EventView } from './types';

const label = <T extends string>(list: readonly { id: T; label: string }[], id: T) => list.find((x) => x.id === id)?.label ?? '';

/** A competition: what it is, who signed up, signing up (alone or as a team), and its bracket. */
export const CompetitionCard: React.FC<{ view: EventView; competition: EventCompetition }> = ({ view, competition }) => {
  const { currentUser, isGuest, requestLogin } = usePortal();
  const run = useEventAction();
  const [teamModal, setTeamModal] = useState<'new' | 'edit' | 'others' | null>(null);
  const [editing, setEditing] = useState(false);
  const [resultFor, setResultFor] = useState<EventMatch | null>(null);
  const [objectionFor, setObjectionFor] = useState<EventMatch | null>(null);
  const [showEntries, setShowEntries] = useState(false);
  const me = currentUser?.id;
  const team = competition.kind === 'team';
  const { event, me: roles } = view;
  const myEntry = competition.entries.find((e) => (me ? e.members.includes(me) : false));
  const signupOpen = !competition.drawnAt && (event.phase === 'signup' || roles.isOrganizer);
  const isJuror = Boolean(me && event.juryIds.includes(me));
  const inEntries = competition.entries.filter((e) => e.status === 'in');
  const waiting = competition.entries.filter((e) => e.status === 'waitlist');
  const mine = new Set(myEntry ? [myEntry.id] : []);
  const nextMatch = myEntry ? nextMatchOf(competition, myEntry.id) : null;
  const champion = competition.entries.find((e) => e.id === competition.champion);

  const signUpAlone = () =>
    run(() => api.post<{ status: string }>(`/api/event_competitions/${competition.id}/entries`, {})).then((r) => {
      if (r) toast.success(r.status === 'waitlist' ? 'ظرفیت پر بود؛ در فهرست انتظار ثبت شدید.' : 'ثبت‌نام شدید.');
    });

  const withdraw = () => {
    if (!myEntry) return;
    const leavingTeam = team && myEntry.members.length > 1 && myEntry.captainId !== me;
    const question = leavingTeam ? `از تیم «${myEntry.name}» خارج می‌شوید؟` : team ? `تیم «${myEntry.name}» از مسابقه خارج شود؟` : `از «${competition.title}» انصراف می‌دهید؟`;
    if (!window.confirm(question)) return;
    if (team && myEntry.captainId === me && myEntry.members.length > 1) {
      // A captain may leave alone (the next member leads) or withdraw the whole team.
      const whole = window.confirm('کل تیم انصراف دهد؟ اگر «لغو» را بزنید فقط خودتان خارج می‌شوید و سرپرستی به نفر بعد می‌رسد.');
      void run(() => (whole ? api.delete(`/api/event_entries/${myEntry.id}`) : api.post(`/api/event_entries/${myEntry.id}/leave`)), whole ? 'تیم انصراف داد.' : 'از تیم خارج شدید.');
      return;
    }
    void run(() => (team && myEntry.members.length > 1 ? api.post(`/api/event_entries/${myEntry.id}/leave`) : api.delete(`/api/event_entries/${myEntry.id}`)), 'انصراف ثبت شد.');
  };

  const myObjection = (m: EventMatch) => view.objections.find((o) => o.matchId === m.id && o.byId === me && o.status === 'open');

  return (
    <article className="bg-white rounded-3xl border border-line shadow-xs overflow-hidden" id={`competition-${competition.id}`}>
      <div className="p-4 sm:p-5 flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>
          {competition.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-ink">{competition.title}</h3>
          <p className="text-xs text-muted mt-0.5">
            {team ? `تیمی، ${toPersianDigits(competition.teamMin)} تا ${toPersianDigits(competition.teamMax)} نفر` : 'فردی'} · جدول حذفی ·{' '}
            {toPersianDigits(inEntries.length)} از {toPersianDigits(competition.capacity)} {team ? 'تیم' : 'نفر'}
            {waiting.length > 0 && ` · ${toPersianDigits(waiting.length)} در انتظار`}
          </p>
          <p className="text-[11px] text-faint mt-0.5">
            {label(STAGE_POLICIES, competition.stagePolicy)}
            {competition.stagePolicy !== 'all' && competition.dayPlace ? ` · ${competition.dayPlace}` : ''}
            {competition.scoring !== 'winner' && ` · تساوی: ${label(TIE_RULES, competition.tieRule)}`}
            {` · نتیجه: ${label(SCORINGS, competition.scoring)}`}
          </p>
        </div>
        {roles.isOrganizer && (
          <div className="flex gap-1">
            <button type="button" onClick={() => setEditing(true)} className="p-2 rounded-xl hover:bg-surface text-muted" aria-label={`ویرایش ${competition.title}`}>
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`مسابقهٔ «${competition.title}» با همهٔ ثبت‌نام‌ها و نتیجه‌هایش حذف شود؟`)) void run(() => api.delete(`/api/event_competitions/${competition.id}`), 'مسابقه حذف شد.');
              }}
              className="p-2 rounded-xl hover:bg-red-50 text-red-700"
              aria-label={`حذف ${competition.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {competition.rules && <p className="px-4 sm:px-5 -mt-2 pb-3 text-xs text-ink-soft leading-relaxed whitespace-pre-line">{competition.rules}</p>}

      {champion && (
        <div className="mx-4 sm:mx-5 mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3">
          <Crown className="w-6 h-6 text-amber-500 shrink-0" aria-hidden />
          <EntryPicture entry={champion} people={view.people} className="w-9 h-9 rounded-xl text-xl" />
          <div className="min-w-0">
            <p className="text-[11px] text-amber-900 font-bold">قهرمان</p>
            <p className="text-sm font-black text-ink truncate">{entryName(champion, view.people)}</p>
          </div>
        </div>
      )}

      {/* The viewer's own place in it */}
      {!isGuest && (
        <div className="px-4 sm:px-5 pb-4 space-y-2">
          {myEntry ? (
            <div className="p-3 rounded-2xl bg-surface flex flex-wrap items-center gap-2">
              <EntryPicture entry={myEntry} people={view.people} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-ink truncate">{team ? `تیم «${myEntry.name}»` : 'شما ثبت‌نام کرده‌اید'}</p>
                <p className="text-[11px] text-muted">
                  {myEntry.status === 'waitlist'
                    ? `در فهرست انتظار، نفر ${toPersianDigits(myEntry.waitlistPosition ?? 0)}`
                    : team
                      ? `${myEntry.members.map((id) => view.people[id]?.firstName ?? '').join('، ')}${myEntry.members.length < competition.teamMin ? ` · ${toPersianDigits(competition.teamMin - myEntry.members.length)} نفر کم دارد` : ''}`
                      : 'جای شما قطعی است'}
                </p>
              </div>
              {!competition.drawnAt && (
                <div className="flex gap-1.5">
                  {team && myEntry.captainId === me && signupOpen && (
                    <button type="button" onClick={() => setTeamModal('edit')} className={secondaryButtonClass}>
                      <Users className="w-4 h-4" /> تیم
                    </button>
                  )}
                  {signupOpen && (
                    <button type="button" onClick={withdraw} className={secondaryButtonClass}>
                      <LogOut className="w-4 h-4" /> {team && myEntry.members.length > 1 && myEntry.captainId !== me ? 'خروج از تیم' : 'انصراف'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : signupOpen && !isJuror ? (
            <button
              type="button"
              onClick={() => (team ? setTeamModal('new') : void signUpAlone())}
              className={`${primaryButtonClass} w-full justify-center py-3 text-sm`}
            >
              <UserPlus className="w-4 h-4" />
              {competition.full ? 'ثبت‌نام در فهرست انتظار' : team ? 'ساختن تیم و ثبت‌نام' : 'ثبت‌نام می‌کنم'}
            </button>
          ) : isJuror ? (
            <p className="text-xs text-muted">شما داور رویداد هستید و در مسابقات شرکت نمی‌کنید.</p>
          ) : null}

          {nextMatch && competition.bracketVisible && (
            <div>
              <p className="text-xs font-black text-ink-soft mb-1.5">بازی بعدی من</p>
              <MatchCard competition={competition} match={nextMatch} people={view.people} mine={mine} />
            </div>
          )}
          {myEntry && competition.bracketVisible && knockedOut(competition, myEntry.id) && !nextMatch && (
            <p className="text-xs text-muted">مسابقهٔ شما تمام شد؛ حالا نوبت تشویق بقیه است 🍉</p>
          )}
        </div>
      )}
      {isGuest && signupOpen && (
        <div className="px-4 sm:px-5 pb-4">
          <button type="button" onClick={() => requestLogin('برای ثبت‌نام در مسابقه وارد حساب کاربری خود شوید.')} className={`${secondaryButtonClass} w-full justify-center`}>
            برای ثبت‌نام وارد شوید
          </button>
        </div>
      )}

      {/* Who is in it */}
      {competition.entries.length > 0 && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setShowEntries((v) => !v)}
            aria-expanded={showEntries}
            className="w-full px-4 sm:px-5 py-3 flex items-center justify-between text-xs font-bold text-ink-soft hover:bg-surface"
          >
            <span>
              {team ? 'تیم‌ها' : 'شرکت‌کنندگان'} ({toPersianDigits(competition.entries.length)})
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showEntries ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showEntries && (
            <ul className="px-4 sm:px-5 pb-4 grid sm:grid-cols-2 gap-2">
              {competition.entries.map((e) => (
                <li key={e.id} className={`flex items-center gap-2 p-2 rounded-xl border ${e.status === 'waitlist' ? 'border-dashed border-line-strong opacity-75' : 'border-line'}`}>
                  <EntryPicture entry={e} people={view.people} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-ink truncate">{entryName(e, view.people)}</p>
                    {team && <p className="text-[11px] text-muted truncate">{e.members.map((id) => view.people[id]?.name ?? '').join('، ')}</p>}
                    {e.status === 'waitlist' && <p className="text-[11px] text-amber-800">انتظار، نفر {toPersianDigits(e.waitlistPosition ?? 0)}</p>}
                  </div>
                  {roles.isOrganizer && !competition.drawnAt && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`«${entryName(e, view.people)}» از مسابقه حذف شود؟`)) void run(() => api.delete(`/api/event_entries/${e.id}`), 'حذف شد.');
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-700"
                      aria-label={`حذف ${entryName(e, view.people)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {roles.isOrganizer && signupOpen && (
        <div className="px-4 sm:px-5 pb-4">
          <button type="button" onClick={() => setTeamModal('others')} className={`${secondaryButtonClass} text-[11px]`}>
            <UserPlus className="w-3.5 h-3.5" /> ثبت‌نام {team ? 'تیم' : 'همکار'} به‌جای دیگران
          </button>
        </div>
      )}

      {/* The bracket */}
      {competition.bracketVisible && competition.matches.length > 0 && (
        <div className="border-t border-line p-4 sm:p-5 space-y-3">
          {!competition.publishedAt && <p className="text-[11px] font-bold text-amber-800 bg-amber-50 rounded-lg px-2 py-1 inline-block">هنوز منتشر نشده؛ فقط برگزارکنندگان و داوران می‌بینند</p>}
          <Bracket
            competition={competition}
            people={view.people}
            mine={mine}
            onOpen={roles.referee ? setResultFor : myEntry ? (m) => (m.winnerId && !myObjection(m) ? setObjectionFor(m) : undefined) : undefined}
          />
          {myEntry && !roles.referee && <p className="text-[11px] text-muted">اگر به نتیجهٔ بازی خودتان اعتراض دارید، روی همان بازی بزنید.</p>}
        </div>
      )}
      {!competition.bracketVisible && competition.drawnAt && (
        <p className="border-t border-line px-4 sm:px-5 py-3 text-xs text-muted">قرعه کشیده شده و جدول به‌زودی منتشر می‌شود.</p>
      )}

      {(teamModal === 'new' || teamModal === 'others') && (
        <TeamModal view={view} competition={competition} forOthers={teamModal === 'others'} onClose={() => setTeamModal(null)} />
      )}
      {teamModal === 'edit' && myEntry && <TeamModal view={view} competition={competition} entry={myEntry} onClose={() => setTeamModal(null)} />}
      {editing && <CompetitionFormModal eventId={event.id} competition={competition} onClose={() => setEditing(false)} />}
      {resultFor && <ResultModal view={view} competition={competition} match={resultFor} onClose={() => setResultFor(null)} />}
      {objectionFor && <ObjectionModal view={view} competition={competition} match={objectionFor} onClose={() => setObjectionFor(null)} />}
    </article>
  );
};
