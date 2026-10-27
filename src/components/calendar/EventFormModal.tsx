import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { Audience } from '../../../shared/audience';
import { usePortal } from '../../context/PortalContext';
import { todayJalali } from '../../lib/jalali';
import type { CalendarEvent, CalendarEventInput } from '../../types';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AudiencePicker } from '../news/AudiencePicker';

/** Adds an event to the calendar, or edits one: when and where, for whom, and what the audience is told. */
export const EventFormModal: React.FC<{ event?: CalendarEvent; date?: string; onClose: () => void }> = ({ event, date, onClose }) => {
  const { addCalendarEvent, updateCalendarEvent, currentUser } = usePortal();
  const [title, setTitle] = useState(event?.title ?? '');
  const [dateStr, setDateStr] = useState(event?.date ?? date ?? todayJalali());
  const [type, setType] = useState<CalendarEvent['type']>(event?.type ?? 'meeting');
  const [time, setTime] = useState(event?.time ?? '');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [audience, setAudience] = useState<Audience>({
    departments: event?.targetDepartments ?? [],
    locations: event?.targetLocations ?? [],
    roles: event?.targetRoles ?? [],
    userIds: event?.targetUserIds ?? [],
  });
  const [notify, setNotify] = useState(event?.notify ?? true);
  const [rsvp, setRsvp] = useState(event?.rsvp ?? false);
  const [saving, setSaving] = useState(false);
  const canAskAttendance = type !== 'holiday';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: CalendarEventInput = {
      title,
      date: dateStr,
      type,
      description,
      time,
      endTime: time ? endTime : '',
      location,
      targetDepartments: audience.departments,
      targetLocations: audience.locations,
      targetRoles: audience.roles,
      targetUserIds: audience.userIds,
      notify,
      rsvp: canAskAttendance && rsvp,
    };
    setSaving(true);
    const ok = event ? await updateCalendarEvent(event.id, input) : await addCalendarEvent(input);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={event ? 'ویرایش رویداد' : 'افزودن رویداد جدید به تقویم'}
      icon={event ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="event-form" disabled={saving} className={primaryButtonClass}>ذخیره رویداد</button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="event-title" className={labelClass}>عنوان رویداد *</label>
          <input id="event-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="event-date" className={labelClass}>تاریخ رویداد *</label>
            <JalaliDateInput id="event-date" required value={dateStr} onChange={setDateStr} />
          </div>
          <div>
            <label htmlFor="event-type" className={labelClass}>نوع رویداد</label>
            <select id="event-type" value={type} onChange={(e) => setType(e.target.value as CalendarEvent['type'])} className={inputClass}>
              <option value="meeting">جلسه یا همایش کاری</option>
              <option value="event">رویداد سازمانی</option>
              <option value="training">دوره آموزشی</option>
              <option value="holiday">تعطیلی یا مرخصی سازمانی</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="event-time" className={labelClass}>ساعت شروع</label>
            <input id="event-time" type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="event-end-time" className={labelClass}>ساعت پایان</label>
            <input
              id="event-end-time"
              type="time"
              dir="ltr"
              value={time ? endTime : ''}
              min={time || undefined}
              disabled={!time}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${inputClass} disabled:opacity-50`}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="event-location" className={labelClass}>مکان</label>
            <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="event-description" className={labelClass}>توضیحات</label>
          <textarea id="event-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>

        <AudiencePicker value={audience} onChange={setAudience} authorId={currentUser?.id ?? ''} noun="رویداد" />

        <div className="space-y-2 rounded-2xl bg-[#FDFBF7] border border-[#E6E0D5] p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-red-700 mt-0.5" />
            <span>
              <span className="block text-xs font-bold">به مخاطبان اعلان بده و یک روز قبل یادآوری کن</span>
              <span className="block text-[11px] text-[#6E6A60] leading-relaxed">
                مخاطبان وقتی رویداد ثبت، جابه‌جا یا لغو شود خبردار می‌شوند و روز قبل از آن، ساعت ۸ صبح، یادآوری می‌گیرند.
              </span>
            </span>
          </label>
          {canAskAttendance && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={rsvp} onChange={(e) => setRsvp(e.target.checked)} className="accent-red-700 mt-0.5" />
              <span>
                <span className="block text-xs font-bold">از مخاطبان بپرس «شرکت می‌کنم / نمی‌کنم»</span>
                <span className="block text-[11px] text-[#6E6A60] leading-relaxed">
                  تعداد شرکت‌کننده‌ها را همه می‌بینند و فهرست نام‌ها را مدیران تقویم. به کسانی که گفته‌اند نمی‌آیند یادآوری فرستاده نمی‌شود.
                </span>
              </span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
};
