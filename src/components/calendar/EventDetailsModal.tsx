import React, { useState } from 'react';
import { BellOff, BellRing, CalendarPlus, Check, Download, GraduationCap, ListChecks, MapPin, Pencil, Trash2, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { formatDate, formatDateTime, todayJalali, toPersianDigits } from '../../lib/jalali';
import type { CalendarEvent, CalendarRsvpRow } from '../../types';
import { Modal } from '../common/Modal';
import { audienceLabel } from '../polls/pollText';
import { timeRange, TypeIcon, TYPE_LABELS, typeChipClass } from './eventText';
import { AddToTodosButton } from '../todos/AddToTodosButton';

const answerLabel = (attending: boolean | null) => (attending === null ? 'پاسخ نداده' : attending ? 'شرکت می‌کند' : 'شرکت نمی‌کند');

const answerClass = (attending: boolean | null) =>
  attending === null ? 'bg-surface text-muted' : attending ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';

const choiceClass = (active: boolean, yes: boolean) =>
  `flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-60 ${
    active
      ? yes
        ? 'bg-emerald-600 border-emerald-600 text-white'
        : 'bg-red-700 border-red-700 text-white'
      : 'bg-white border-line-strong text-ink hover:border-red-300'
  }`;

const linkClass = 'flex items-center gap-1.5 text-xs font-bold hover:underline';

/**
 * One calendar event: when, where and for whom; "attending or not" for its audience; an .ics file
 * for Outlook; and for calendar managers, who answered what, editing and deleting.
 */
export const EventDetailsModal: React.FC<{ event: CalendarEvent; onClose: () => void; onEdit: () => void }> = ({ event, onClose, onEdit }) => {
  const { can, rsvpCalendarEvent, deleteCalendarEvent, setActiveTab } = usePortal();
  const isManager = can('calendar.manage');
  const past = event.date < todayJalali();
  const [answering, setAnswering] = useState(false);
  const [names, setNames] = useState<CalendarRsvpRow[] | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [loadingNames, setLoadingNames] = useState(false);

  const when = [formatDate(event.date), timeRange(event)].filter(Boolean).join('، ');
  const going = event.going ?? 0;
  const notGoing = event.notGoing ?? 0;
  const waiting = event.audienceCount !== undefined ? Math.max(0, event.audienceCount - going - notGoing) : undefined;

  const answer = async (attending: boolean) => {
    setAnswering(true);
    await rsvpCalendarEvent(event.id, attending);
    setAnswering(false);
    setNames(null);
    setShowNames(false);
  };

  const loadNames = async () => {
    if (names) return names;
    setLoadingNames(true);
    try {
      const rows = await api.get<CalendarRsvpRow[]>(`/api/calendar_events/${event.id}/rsvps`);
      setNames(rows);
      return rows;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setLoadingNames(false);
    }
  };

  const exportNames = async () => {
    const rows = await loadNames();
    if (!rows) return;
    downloadCsv(`roya-event-${event.id}.csv`, [
      ['نام', 'واحد', 'محل استقرار', 'پاسخ', 'زمان پاسخ'],
      ...rows.map((r) => [r.name, r.department, r.location, answerLabel(r.attending), r.respondedAt ? formatDateTime(r.respondedAt) : '']),
    ]);
  };

  const remove = async () => {
    const tellsAudience = event.notify && !event.trainingId && !past;
    if (!window.confirm(`«${event.title}» از تقویم حذف شود؟${tellsAudience ? ' به مخاطبانش خبر لغو آن داده می‌شود.' : ''}`)) return;
    await deleteCalendarEvent(event.id);
    onClose();
  };

  return (
    <Modal title={event.title} subtitle={when} icon={<TypeIcon type={event.type} />} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`font-bold px-2 py-0.5 rounded-full ${typeChipClass(event.type)}`}>{TYPE_LABELS[event.type]}</span>
          <span className="flex items-center gap-1 text-muted">
            <Users className="w-3.5 h-3.5" /> برای: {audienceLabel(event)}
          </span>
          {isManager && (
            <span className="flex items-center gap-1 text-muted">
              {event.notify ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              {event.notify ? 'اعلان و یادآوری روشن' : 'بدون اعلان'}
            </span>
          )}
        </div>

        {event.location && (
          <p className="flex items-center gap-1.5 text-xs text-ink">
            <MapPin className="w-4 h-4 text-faint" /> {event.location}
          </p>
        )}
        {event.description && <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{event.description}</p>}

        {event.rsvp && (
          <section aria-label="اعلام حضور" className="rounded-2xl border border-line bg-page p-3 space-y-3">
            {event.forMe && !past && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-ink">
                  {event.myRsvp === null ? 'شما شرکت می‌کنید؟' : 'پاسخ شما ثبت شده است؛ تا روز رویداد می‌توانید آن را تغییر دهید.'}
                </p>
                <div className="flex gap-2">
                  <button type="button" aria-pressed={event.myRsvp === true} disabled={answering} onClick={() => answer(true)} className={choiceClass(event.myRsvp === true, true)}>
                    <Check className="w-4 h-4" /> شرکت می‌کنم
                  </button>
                  <button type="button" aria-pressed={event.myRsvp === false} disabled={answering} onClick={() => answer(false)} className={choiceClass(event.myRsvp === false, false)}>
                    <X className="w-4 h-4" /> شرکت نمی‌کنم
                  </button>
                </div>
              </div>
            )}
            {event.forMe && past && event.myRsvp !== null && (
              <p className="text-xs text-ink-soft">پاسخ شما: {event.myRsvp ? 'شرکت می‌کنم' : 'شرکت نمی‌کنم'}</p>
            )}
            <p className="text-xs text-ink-soft">
              <strong className="text-emerald-700">{toPersianDigits(going)} نفر</strong> شرکت می‌کنند،{' '}
              <strong className="text-red-700">{toPersianDigits(notGoing)} نفر</strong> نمی‌آیند
              {waiting !== undefined && <>، {toPersianDigits(waiting)} نفر هنوز پاسخ نداده‌اند</>}
            </p>
            {isManager && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-4">
                  <button
                    type="button"
                    aria-expanded={showNames}
                    onClick={async () => {
                      if (!showNames) await loadNames();
                      setShowNames(!showNames);
                    }}
                    className={`${linkClass} text-brand-strong`}
                  >
                    <ListChecks className="w-4 h-4" /> {showNames ? 'بستن فهرست نام‌ها' : 'فهرست نام‌ها'}
                  </button>
                  <button type="button" onClick={exportNames} className={`${linkClass} text-brand-strong`}>
                    <Download className="w-4 h-4" /> خروجی اکسل
                  </button>
                </div>
                {loadingNames && <p className="text-xs text-muted">در حال بارگذاری…</p>}
                {showNames && names && (
                  <ul className="max-h-64 overflow-y-auto divide-y divide-surface-strong rounded-xl bg-white border border-line" aria-label="پاسخ همکاران">
                    {names.length === 0 && <li className="p-3 text-xs text-muted">کسی در مخاطبان این رویداد نیست.</li>}
                    {names.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span>
                          <span className="font-bold text-ink">{r.name}</span>
                          <span className="text-faint"> · {r.department}</span>
                        </span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${answerClass(r.attending)}`}>{answerLabel(r.attending)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 border-t border-surface-strong">
          <a href={`/api/calendar_events/${event.id}/ics`} download className={`${linkClass} text-sky-800`}>
            <CalendarPlus className="w-4 h-4" /> افزودن به Outlook
          </a>
          <AddToTodosButton type="event" id={event.id} title={event.title} dueDate={event.date} className={`${linkClass} text-sky-800`} />
          {event.trainingId && (
            <button
              type="button"
              onClick={() => {
                onClose();
                setActiveTab('training', event.trainingId!);
              }}
              className={`${linkClass} text-brand-strong`}
            >
              <GraduationCap className="w-4 h-4" /> {isManager ? 'ویرایش از صفحهٔ آموزش' : 'مشاهدهٔ دوره و ثبت‌نام'}
            </button>
          )}
          {isManager && !event.trainingId && (
            <button type="button" onClick={onEdit} className={`${linkClass} text-brand-strong`}>
              <Pencil className="w-4 h-4" /> ویرایش رویداد
            </button>
          )}
          {isManager && (
            <button type="button" onClick={remove} className={`${linkClass} text-red-700`}>
              <Trash2 className="w-4 h-4" /> حذف این رویداد
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
