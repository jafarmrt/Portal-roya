import React, { useId, useState } from 'react';
import { Check, Crown, EyeOff, Gavel, Lock, Medal, Pencil, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { PeoplePicker } from './PeoplePicker';
import { PersonAvatar, api, useEventAction } from './eventUi';
import { AWARD_ICONS, AWARD_NOTE_MAX, AWARD_STAGE_LABEL, AWARD_TITLE_MAX, EVENT_TEXT_MAX, NOMINATION_REASON_MAX } from '../../../shared/specialEvents';
import { toJalali, toPersianDigits } from '../../lib/jalali';
import type { AwardNominee, EventAward, EventView } from './types';

/** «۱۴۰۵/۰۹/۲۸ ساعت ۰۸:۰۰» */
const when = (iso: string) => `${toPersianDigits(toJalali(iso))} ساعت ${toPersianDigits(toJalali(iso, 'HH:mm'))}`;

/** Creates or changes a category. */
const AwardFormModal: React.FC<{ eventId: string; award?: EventAward; onClose: () => void }> = ({ eventId, award, onClose }) => {
  const run = useEventAction();
  const id = useId();
  const [title, setTitle] = useState(award?.title ?? '');
  const [icon, setIcon] = useState(award?.icon ?? AWARD_ICONS[0]);
  const [description, setDescription] = useState(award?.description ?? '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const body = { title: title.trim(), icon, description: description.trim() };
    const ok = award
      ? await run(() => api.put(`/api/event_awards/${award.id}`, body), 'ذخیره شد.')
      : await run(() => api.post(`/api/special_events/${eventId}/awards`, body), 'بخش ساخته شد.');
    if (ok) onClose();
  };
  return (
    <Modal
      title={award ? `ویرایش «${award.title}»` : 'بخش تازهٔ انتخاب‌ها'}
      icon={<Medal className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={id} disabled={!title.trim()} className={primaryButtonClass}>
            ذخیره
          </button>
        </>
      }
    >
      <form id={id} onSubmit={save} className="space-y-3">
        <div>
          <label htmlFor={`${id}-title`} className={labelClass}>
            نام بخش
          </label>
          <input id={`${id}-title`} value={title} maxLength={AWARD_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً خوش‌تیپ‌ترین" className={inputClass} />
        </div>
        <fieldset>
          <legend className={labelClass}>نشان</legend>
          <div className="flex flex-wrap gap-1.5">
            {AWARD_ICONS.map((i) => (
              <button key={i} type="button" onClick={() => setIcon(i)} aria-pressed={icon === i} className={`w-10 h-10 rounded-xl text-xl border-2 ${icon === i ? 'border-red-600 bg-red-50' : 'border-line bg-white'}`}>
                {i}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-desc`} className={labelClass}>
            یک جمله توضیح
          </label>
          <input id={`${id}-desc`} value={description} maxLength={EVENT_TEXT_MAX} onChange={(e) => setDescription(e.target.value)} placeholder="کسی که همیشه مرتب و شیک می‌آید" className={inputClass} />
        </div>
      </form>
    </Modal>
  );
};

/** The viewer's nomination in one category: pick a colleague and an optional line for the jury. */
const NominateModal: React.FC<{ view: EventView; award: EventAward; onClose: () => void }> = ({ view, award, onClose }) => {
  const { currentUser } = usePortal();
  const run = useEventAction();
  const id = useId();
  const [picked, setPicked] = useState<string[]>(award.myNomination ? [award.myNomination.nomineeId] : []);
  const [reason, setReason] = useState(award.myNomination?.reason ?? '');
  const unavailable = new Map<string, string>();
  for (const j of view.event.juryIds) unavailable.set(j, 'داور رویداد است');
  if (currentUser) unavailable.set(currentUser.id, 'خودتان');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (picked.length !== 1) return;
    const ok = await run(() => api.put(`/api/event_awards/${award.id}/nomination`, { nomineeId: picked[0], reason: reason.trim() }), 'معرفی شما ثبت شد.');
    if (ok) onClose();
  };
  return (
    <Modal
      title={`${award.icon} ${award.title}`}
      subtitle="چه کسی؟ اسم شما هیچ‌جا دیده نمی‌شود."
      icon={<Medal className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={id} disabled={picked.length !== 1} className={primaryButtonClass}>
            ثبت معرفی
          </button>
        </>
      }
    >
      <form id={id} onSubmit={save} className="space-y-3">
        <PeoplePicker label="همکار" value={picked} onChange={setPicked} max={1} accountsOnly unavailable={unavailable} />
        <div>
          <label htmlFor={`${id}-reason`} className={labelClass}>
            یک جمله برای داوران (اختیاری)
          </label>
          <input id={`${id}-reason`} value={reason} maxLength={NOMINATION_REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder="چون همیشه اتوکرده است" className={inputClass} />
          <p className="text-[11px] text-muted mt-1">این جمله را فقط هیئت داوران می‌بیند، بدون اسم شما.</p>
        </div>
      </form>
    </Modal>
  );
};

/** The jury adds a colleague to a shortlist, with a reason kept in the history. */
const AddNomineeModal: React.FC<{ view: EventView; award: EventAward; onClose: () => void }> = ({ view, award, onClose }) => {
  const run = useEventAction();
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const unavailable = new Map<string, string>();
  for (const j of view.event.juryIds) unavailable.set(j, 'داور رویداد است');
  for (const n of award.nominees) if (!n.removed && !n.withdrawn) unavailable.set(n.id, 'در فهرست هست');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api.post(`/api/event_awards/${award.id}/nominees`, { employeeId: picked[0], note: note.trim() }), 'به فهرست اضافه شد.');
    if (ok) onClose();
  };
  return (
    <Modal
      title={`افزودن نامزد به «${award.title}»`}
      icon={<UserPlus className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={id} disabled={picked.length !== 1 || note.trim().length < 3} className={primaryButtonClass}>
            افزودن
          </button>
        </>
      }
    >
      <form id={id} onSubmit={save} className="space-y-3">
        <PeoplePicker label="همکار" value={picked} onChange={setPicked} max={1} accountsOnly unavailable={unavailable} />
        <div>
          <label htmlFor={`${id}-note`} className={labelClass}>
            دلیل (در تاریخچه می‌ماند)
          </label>
          <input id={`${id}-note`} value={note} maxLength={AWARD_NOTE_MAX} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
      </form>
    </Modal>
  );
};

const NomineeRow: React.FC<{ view: EventView; award: EventAward; nominee: AwardNominee; canVote: boolean }> = ({ view, award, nominee, canVote }) => {
  const run = useEventAction();
  const person = view.people[nominee.id];
  const off = nominee.withdrawn || nominee.removed;
  const editable = canVote && award.stage !== 'counting' && award.stage !== 'decided' && award.stage !== 'revealed';
  const voting = canVote && award.stage === 'voting' && !off;
  const chosen = award.myVote === nominee.id;
  return (
    <li className={`rounded-2xl border p-2.5 space-y-1.5 ${chosen ? 'border-emerald-500 bg-emerald-50/50' : 'border-line'} ${off ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <PersonAvatar person={person} className="w-10 h-10 rounded-full" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-ink truncate">{person?.name ?? 'همکار'}</p>
          <p className="text-[11px] text-muted truncate">
            {nominee.withdrawn
              ? 'انصراف داد'
              : nominee.removed
                ? `برداشته شد: ${nominee.removedReason}`
                : nominee.source === 'jury'
                  ? `افزودهٔ داوران: ${nominee.note}`
                  : (person?.position ?? '')}
          </p>
        </div>
        {voting && (
          <button
            type="button"
            onClick={() => void run(() => api.put(`/api/event_awards/${award.id}/vote`, { nomineeId: nominee.id }), 'رأی شما ثبت شد.')}
            aria-pressed={chosen}
            className={chosen ? `${primaryButtonClass} bg-emerald-700 hover:bg-emerald-800` : secondaryButtonClass}
          >
            {chosen ? <Check className="w-4 h-4" /> : null}
            {chosen ? 'رأی من' : 'انتخاب'}
          </button>
        )}
        {editable && !off && (
          <button
            type="button"
            onClick={() => {
              const reason = window.prompt(`چرا «${person?.name ?? ''}» از فهرست برداشته شود؟ (در تاریخچه می‌ماند)`);
              if (reason && reason.trim().length >= 3) void run(() => api.post(`/api/event_awards/${award.id}/nominees/${nominee.id}/remove`, { reason: reason.trim() }), 'از فهرست برداشته شد.');
            }}
            className="p-2 rounded-xl hover:bg-red-50 text-red-700"
            aria-label={`برداشتن ${person?.name ?? ''} از فهرست`}
          >
            <UserMinus className="w-4 h-4" />
          </button>
        )}
      </div>
      {canVote && nominee.reasons.length > 0 && (
        <ul className="ps-12 space-y-1">
          {nominee.reasons.map((r) => (
            <li key={r.id} className="flex items-start gap-1.5 text-xs text-ink-soft">
              <span className="flex-1">{r.hidden ? <span className="text-faint">(پنهان شد)</span> : `«${r.text}»`}</span>
              <button
                type="button"
                onClick={() => void run(() => api.post(`/api/event_nominations/${r.id}/hide`, { hidden: !r.hidden }))}
                className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-0.5"
              >
                <EyeOff className="w-3 h-3" /> {r.hidden ? 'نمایش' : 'پنهان'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

const AwardCard: React.FC<{ view: EventView; award: EventAward }> = ({ view, award }) => {
  const { isGuest } = usePortal();
  const run = useEventAction();
  const [nominating, setNominating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const { me, awardsInfo } = view;
  const canVote = awardsInfo.votes;
  const nominating_ = award.stage === 'nominating';
  const canNominate = nominating_ && !isGuest && !me.isJuror && (view.event.phase === 'signup' || me.isOrganizer);
  const mine = award.myNomination ? view.people[award.myNomination.nomineeId] : null;
  const shown = award.nominees.filter((n) => me.referee || (!n.withdrawn && !n.removed));
  const winner = award.winnerId ? view.people[award.winnerId] : null;

  return (
    <article className="bg-white border border-line rounded-3xl p-4 space-y-3" aria-label={award.title}>
      <div className="flex items-start gap-2">
        <span className="text-3xl leading-none" aria-hidden>
          {award.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-ink">{award.title}</h3>
          {award.description && <p className="text-xs text-muted mt-0.5">{award.description}</p>}
          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-surface text-[11px] font-bold text-ink-soft">{AWARD_STAGE_LABEL[award.stage]}</span>
        </div>
        {me.isOrganizer && nominating_ && (
          <div className="flex gap-1">
            <button type="button" onClick={() => setEditing(true)} className="p-2 rounded-xl hover:bg-surface text-muted" aria-label={`ویرایش ${award.title}`}>
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`بخش «${award.title}» با همهٔ معرفی‌هایش حذف شود؟`)) void run(() => api.delete(`/api/event_awards/${award.id}`), 'حذف شد.');
              }}
              className="p-2 rounded-xl hover:bg-red-50 text-red-700"
              aria-label={`حذف ${award.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {winner && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3">
          <Crown className="w-6 h-6 text-amber-500 shrink-0" aria-hidden />
          <PersonAvatar person={winner} className="w-12 h-12 rounded-full" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-900">برنده</p>
            <p className="text-base font-black text-ink truncate">{winner.name}</p>
          </div>
        </div>
      )}
      {award.stage === 'revealed' && award.noWinner && <p className="text-xs text-muted">این بخش برنده‌ای نداشت.</p>}

      {canNominate && (
        <div className="p-3 rounded-2xl bg-surface flex items-center gap-2">
          {mine ? (
            <>
              <PersonAvatar person={mine} className="w-9 h-9 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-ink truncate">معرفی شما: {mine.name}</p>
                {award.myNomination?.reason && <p className="text-[11px] text-muted truncate">«{award.myNomination.reason}»</p>}
              </div>
              <button type="button" onClick={() => setNominating(true)} className={secondaryButtonClass}>
                تغییر
              </button>
              <button
                type="button"
                onClick={() => void run(() => api.delete(`/api/event_awards/${award.id}/nomination`), 'معرفی شما برداشته شد.')}
                className="p-2 rounded-xl hover:bg-red-50 text-red-700"
                aria-label="برداشتن معرفی من"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setNominating(true)} className={`${primaryButtonClass} w-full justify-center py-2.5`}>
              <UserPlus className="w-4 h-4" /> معرفی نامزد
            </button>
          )}
        </div>
      )}
      {nominating_ && me.isJuror && <p className="text-xs text-muted">شما داور هستید؛ بعد از ساخته شدن فهرست نامزدها، برنده را انتخاب می‌کنید.</p>}

      {shown.length > 0 && award.stage !== 'revealed' && (
        <ul className="space-y-2">
          {shown.map((n) => (
            <NomineeRow key={n.id} view={view} award={award} nominee={n} canVote={canVote} />
          ))}
        </ul>
      )}
      {!nominating_ && shown.length === 0 && award.stage !== 'revealed' && !award.decided && (
        <p className="text-xs text-muted">{me.referee || awardsInfo.publishedAt ? 'نامزدی برای این بخش نیست.' : 'فهرست نامزدها به‌زودی منتشر می‌شود.'}</p>
      )}

      {canVote && (award.stage === 'shortlisting' || award.stage === 'voting') && (
        <button type="button" onClick={() => setAdding(true)} className={`${secondaryButtonClass} text-[11px]`}>
          <UserPlus className="w-3.5 h-3.5" /> افزودن نامزد با دلیل
        </button>
      )}
      {me.referee && award.votedCount !== null && (award.stage === 'voting' || award.stage === 'counting') && (
        <p className="text-[11px] text-muted flex items-center gap-1">
          <Lock className="w-3.5 h-3.5" /> {toPersianDigits(award.votedCount)} از {toPersianDigits(awardsInfo.voters)} داور رأی داده‌اند؛ رأی‌ها محرمانه است.
        </p>
      )}

      {award.tie.length > 0 && (
        <div className="p-3 rounded-2xl border border-amber-300 bg-amber-50 space-y-2">
          <p className="text-xs font-black text-amber-950 flex items-center gap-1.5">
            <Gavel className="w-4 h-4" /> رأی‌ها مساوی شد؛ انتخاب برنده با شماست:
          </p>
          <div className="flex flex-wrap gap-2">
            {award.tie.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (window.confirm(`«${view.people[id]?.name ?? ''}» برندهٔ «${award.title}» باشد؟`)) void run(() => api.post(`/api/event_awards/${award.id}/settle`, { nomineeId: id }), 'ثبت شد.');
                }}
                className={secondaryButtonClass}
              >
                {view.people[id]?.name ?? 'همکار'}
              </button>
            ))}
          </div>
        </div>
      )}

      {me.referee && award.stage === 'decided' && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`برندهٔ «${award.title}» الان برای همه باز شود؟ (روی صحنه)`)) void run(() => api.post(`/api/event_awards/${award.id}/reveal`), 'برنده اعلام شد 🎉');
          }}
          className={`${primaryButtonClass} w-full justify-center py-2.5`}
        >
          <Crown className="w-4 h-4" /> اعلام برنده
        </button>
      )}

      {nominating && <NominateModal view={view} award={award} onClose={() => setNominating(false)} />}
      {editing && <AwardFormModal eventId={view.event.id} award={award} onClose={() => setEditing(false)} />}
      {adding && <AddNomineeModal view={view} award={award} onClose={() => setAdding(false)} />}
    </article>
  );
};

/** «انتخاب‌های یلدا»: categories, nominating, the shortlists, the jury's vote and the winners. */
export const AwardsSection: React.FC<{ view: EventView }> = ({ view }) => {
  const { isGuest } = usePortal();
  const run = useEventAction();
  const [creating, setCreating] = useState(false);
  const { awards, awardsInfo, me, event } = view;
  if (awards.length === 0 && !me.isOrganizer) return null;
  const stepDownTitles = awards.filter((a) => awardsInfo.onShortlist.includes(a.id)).map((a) => a.title);
  const ev = event.id;
  const confirmThen = (question: string, path: string, done: string) => {
    if (window.confirm(question)) void run(() => api.post(`/api/special_events/${ev}/awards/${path}`), done);
  };

  return (
    <section id="event-awards" className="space-y-3" aria-labelledby="event-awards-title">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-0">
          <h2 id="event-awards-title" className="text-base font-black text-ink flex items-center gap-1.5">
            <Medal className="w-5 h-5 text-red-700" /> انتخاب‌های {event.title}
          </h2>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            {awardsInfo.publishedAt
              ? awardsInfo.closedAt
                ? 'رأی‌گیری تمام شد؛ برنده‌ها شب برنامه روی صحنه اعلام می‌شوند.'
                : `هیئت داوران تا ${when(awardsInfo.voteDeadline)} محرمانه رأی می‌دهد. هیچ‌کس، حتی مدیر پرتال، تا اعلام روی صحنه نتیجه را نمی‌بیند.`
              : awardsInfo.shortlistedAt
                ? `فهرست نامزدها ${when(awardsInfo.publishAt)} برای همه منتشر می‌شود.`
                : `در هر بخش یک همکار را معرفی کنید (اسم شما هیچ‌جا دیده نمی‌شود). ${when(awardsInfo.shortlistAt)}، ۳ نفری که بیشتر معرفی شده‌اند نامزد می‌شوند و برنده را هیئت داوران انتخاب می‌کند. هر نفر فقط در یک بخش برنده می‌شود.`}
          </p>
        </div>
        {me.isOrganizer && !awardsInfo.shortlistedAt && (
          <button type="button" onClick={() => setCreating(true)} className={secondaryButtonClass}>
            <Plus className="w-4 h-4" /> بخش تازه
          </button>
        )}
      </div>

      {stepDownTitles.length > 0 && awardsInfo.canStepDown && (
        <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 flex flex-wrap items-center gap-2">
          <p className="flex-1 min-w-0 text-xs text-sky-950">
            شما در {stepDownTitles.map((t) => `«${t}»`).join('، ')} نامزد شده‌اید 🎉 اگر نمی‌خواهید، تا انتشار فهرست انصراف دهید.
          </p>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('از نامزدی انصراف می‌دهید؟ نفر بعدی جای شما می‌آید.')) void run(() => api.post(`/api/special_events/${ev}/awards/step_down`), 'انصراف شما ثبت شد.');
            }}
            className={secondaryButtonClass}
          >
            انصراف از نامزدی
          </button>
        </div>
      )}

      {awards.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
          {awards.map((a) => (
            <AwardCard key={a.id} view={view} award={a} />
          ))}
        </div>
      )}
      {awards.length === 0 && me.isOrganizer && (
        <p className="text-xs text-muted">هنوز بخشی نساخته‌اید؛ مثلاً «خوش‌تیپ‌ترین»، «همکار همیشه پایه» یا «بهترین چای‌ریز».</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isGuest && !me.isJuror && !awardsInfo.closedAt && awards.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
            <input
              type="checkbox"
              checked={awardsInfo.optedOut}
              onChange={(e) => void run(() => api.put(`/api/special_events/${ev}/awards/opt_out`, { out: e.target.checked }), e.target.checked ? 'دیگر در بخش‌های نامزدی نیستید.' : 'دوباره می‌شود شما را معرفی کرد.')}
              className="w-4 h-4 accent-red-700"
            />
            مرا در بخش‌های نامزدی قرار ندهید
          </label>
        )}
        {me.isOrganizer && awards.length > 0 && (
          <div className="flex flex-wrap gap-1.5 ms-auto">
            {!awardsInfo.shortlistedAt && (
              <button type="button" onClick={() => confirmThen('معرفی نامزد بسته و فهرست نامزدها همین الان ساخته شود؟', 'shortlist', 'فهرست نامزدها ساخته شد.')} className={`${secondaryButtonClass} text-[11px]`}>
                ساختن فهرست نامزدها الان
              </button>
            )}
            {awardsInfo.shortlistedAt && !awardsInfo.publishedAt && (
              <button type="button" onClick={() => confirmThen('فهرست نامزدها همین الان برای همه منتشر شود؟ بعد از آن انصراف ممکن نیست.', 'publish', 'فهرست منتشر شد.')} className={`${secondaryButtonClass} text-[11px]`}>
                انتشار فهرست الان
              </button>
            )}
            {awardsInfo.publishedAt && !awardsInfo.closedAt && (
              <button type="button" onClick={() => confirmThen('رأی‌گیری همین الان بسته و برنده‌ها مشخص شوند؟', 'close', 'رأی‌گیری بسته شد.')} className={`${secondaryButtonClass} text-[11px]`}>
                بستن رأی‌گیری الان
              </button>
            )}
          </div>
        )}
      </div>
      {creating && <AwardFormModal eventId={ev} onClose={() => setCreating(false)} />}
    </section>
  );
};
