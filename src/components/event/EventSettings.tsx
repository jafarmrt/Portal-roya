import React, { useEffect, useId, useState } from 'react';
import { Camera, Eye, EyeOff, Gavel, Power, Save, Trash2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { ApiError } from '../../lib/api';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { PeoplePicker } from './PeoplePicker';
import { PersonAvatar, api, useEventAction } from './eventUi';
import {
  EVENT_PHASES,
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  MIN_SIGNUP_WORKDAYS,
  PLACE_MAX,
  datesProblem,
  juryProblem,
  suggestedDates,
  workdaysBetween,
  type EventPhase,
} from '../../../shared/specialEvents';
import { currentJalaliYear, isValidJalaliDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import type { EventView } from './types';

const card = 'bg-white border border-line rounded-3xl p-4 sm:p-5 space-y-4';

interface DatesForm {
  title: string;
  intro: string;
  programDate: string;
  programTime: string;
  programPlace: string;
  signupEnd: string;
  showUntil: string;
}

/** Title, day, time and place of the program and the signup window, with the suggested dates one tap away. */
const DatesFields: React.FC<{ value: DatesForm; onChange: (v: DatesForm) => void }> = ({ value, onChange }) => {
  const id = useId();
  const set = <K extends keyof DatesForm>(key: K, v: DatesForm[K]) => onChange({ ...value, [key]: v });
  const suggested = isValidJalaliDate(value.programDate) ? suggestedDates(value.programDate) : null;
  const today = todayJalali();
  const workdays = isValidJalaliDate(value.signupEnd) && today <= value.signupEnd ? workdaysBetween(today, value.signupEnd) : 0;
  const problem = isValidJalaliDate(value.programDate) && isValidJalaliDate(value.signupEnd) && isValidJalaliDate(value.showUntil) ? datesProblem(value) : null;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-title`} className={labelClass}>
          عنوان رویداد
        </label>
        <input id={`${id}-title`} value={value.title} maxLength={EVENT_TITLE_MAX} onChange={(e) => set('title', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-day`} className={labelClass}>
          روز برنامه
        </label>
        <JalaliDateInput id={`${id}-day`} value={value.programDate} onChange={(v) => set('programDate', v)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-time`} className={labelClass}>
            ساعت شروع
          </label>
          <input id={`${id}-time`} type="time" value={value.programTime} onChange={(e) => set('programTime', e.target.value)} className={inputClass} dir="ltr" />
        </div>
        <div>
          <label htmlFor={`${id}-place`} className={labelClass}>
            محل برنامه
          </label>
          <input id={`${id}-place`} value={value.programPlace} maxLength={PLACE_MAX} onChange={(e) => set('programPlace', e.target.value)} placeholder="سالن اجتماعات" className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-signup`} className={labelClass}>
          آخرین روز ثبت‌نام
        </label>
        <JalaliDateInput id={`${id}-signup`} value={value.signupEnd} onChange={(v) => set('signupEnd', v)} />
      </div>
      <div>
        <label htmlFor={`${id}-until`} className={labelClass}>
          صفحه تا این روز در منو بماند
        </label>
        <JalaliDateInput id={`${id}-until`} value={value.showUntil} onChange={(v) => set('showUntil', v)} />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {suggested && (suggested.signupEnd !== value.signupEnd || suggested.showUntil !== value.showUntil) && (
          <button type="button" onClick={() => onChange({ ...value, ...suggested })} className={`${secondaryButtonClass} text-[11px]`}>
            تاریخ‌های پیشنهادی: ثبت‌نام تا {toPersianDigits(suggested.signupEnd)}، نمایش تا {toPersianDigits(suggested.showUntil)}
          </button>
        )}
        {isValidJalaliDate(value.signupEnd) && <span>از امروز تا پایان ثبت‌نام {toPersianDigits(workdays)} روز کاری است.</span>}
      </div>
      {problem && <p className="sm:col-span-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-2.5">{problem}</p>}
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-intro`} className={labelClass}>
          چند خط دربارهٔ برنامه (بالای صفحه)
        </label>
        <textarea id={`${id}-intro`} value={value.intro} maxLength={EVENT_TEXT_MAX} rows={3} onChange={(e) => set('intro', e.target.value)} className={inputClass} placeholder="بلندترین شب سال را کنار هم جشن می‌گیریم: انار، هندوانه، فال حافظ و مسابقه!" />
      </div>
    </div>
  );
};

/** For those who manage events, when there is none yet: one short form. */
export const CreateEventForm: React.FC = () => {
  const run = useEventAction();
  const year = currentJalaliYear();
  const programDate = `${year}/09/30`;
  const [form, setForm] = useState<DatesForm>({
    title: `شب یلدا ${toPersianDigits(year)}`,
    intro: '',
    programDate,
    programTime: '15:00',
    programPlace: '',
    ...suggestedDates(programDate),
  });
  const [saving, setSaving] = useState(false);
  const ready = form.title.trim() && isValidJalaliDate(form.programDate) && !datesProblem(form) && !saving;
  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    await run(() => api.post('/api/special_events', { ...form, title: form.title.trim(), intro: form.intro.trim(), programPlace: form.programPlace.trim() }), 'رویداد به‌صورت پیش‌نویس ساخته شد؛ فقط شما و برگزارکنندگان آن را می‌بینید.');
    setSaving(false);
  };
  return (
    <section className={card}>
      <div>
        <h2 className="text-sm font-black text-ink">رویداد ویژهٔ تازه</h2>
        <p className="text-xs text-muted mt-1">
          رویداد اول پیش‌نویس است: مسابقه‌ها را بسازید، برگزارکننده و داوران را بگذارید و صفحه را امتحان کنید. هر وقت آماده بود «فعال کن» را بزنید تا برای همه باز شود.
        </p>
      </div>
      <DatesFields value={form} onChange={setForm} />
      <div className="flex justify-end">
        <button type="button" onClick={() => void submit()} disabled={!ready} className={primaryButtonClass}>
          ساختن پیش‌نویس
        </button>
      </div>
    </section>
  );
};

/** Settings of the event (those who manage events): dates, organizers, jury, trying it out, switching it on. */
export const EventSettings: React.FC<{ view: EventView }> = ({ view }) => {
  const { reloadSpecialEvent } = usePortal();
  const run = useEventAction();
  const id = useId();
  const { event } = view;
  const [form, setForm] = useState<DatesForm>(() => ({ ...event }));
  const [organizerIds, setOrganizerIds] = useState(event.organizerIds);
  const [juryIds, setJuryIds] = useState(event.juryIds);
  const [headId, setHeadId] = useState<string | null>(event.juryHeadId);
  const [saving, setSaving] = useState(false);

  // Someone else saved meanwhile: start from what is saved now.
  useEffect(() => setForm({ ...event }), [event.title, event.intro, event.programDate, event.programTime, event.programPlace, event.signupEnd, event.showUntil]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setOrganizerIds(event.organizerIds), [event.organizerIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setJuryIds(event.juryIds);
    setHeadId(event.juryHeadId);
  }, [event.juryIds.join(), event.juryHeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const datesChanged = (['title', 'intro', 'programDate', 'programTime', 'programPlace', 'signupEnd', 'showUntil'] as const).some((k) => form[k] !== event[k]);
  const saveDates = async () => {
    setSaving(true);
    await run(() => api.patch(`/api/special_events/${event.id}`, { ...form, title: form.title.trim(), intro: form.intro.trim(), programPlace: form.programPlace.trim() }), 'ذخیره شد.');
    setSaving(false);
  };

  // People already playing cannot judge.
  const playing = new Map<string, string>();
  for (const c of view.competitions) for (const e of c.entries) for (const pid of e.members) playing.set(pid, `در «${c.title}» ثبت‌نام کرده`);
  const juryIssue = juryProblem(juryIds, headId);
  const juryChanged = juryIds.join() !== event.juryIds.join() || headId !== event.juryHeadId;
  const saveJury = () => run(() => api.patch(`/api/special_events/${event.id}`, { juryIds, juryHeadId: juryIds.length > 0 ? headId : null }), 'هیئت داوران ذخیره شد.');

  const activate = async (force = false) => {
    try {
      await run(() => api.post(`/api/special_events/${event.id}/activate`, force ? { force: true } : {}), 'رویداد برای همه فعال شد.', { quiet409: true });
    } catch (err) {
      if (err instanceof ApiError && window.confirm(`${err.message}\n\nبا همین تاریخ‌ها فعال شود؟`)) await activate(true);
    }
  };

  const remove = async () => {
    if (!window.confirm(`پیش‌نویس «${event.title}» با همهٔ مسابقه‌ها و ثبت‌نام‌هایش حذف شود؟`)) return;
    const ok = await run(() => api.delete(`/api/special_events/${event.id}`).then(() => true), 'پیش‌نویس حذف شد.');
    if (ok) await reloadSpecialEvent();
  };

  const draft = event.status === 'draft';
  const workdays = todayJalali() <= event.signupEnd ? workdaysBetween(todayJalali(), event.signupEnd) : 0;

  return (
    <div className="space-y-4">
      <section className={`${card} ${draft ? 'border-amber-300' : 'border-emerald-300'}`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-ink">{draft ? 'پیش‌نویس: فقط شما، برگزارکنندگان و داوران می‌بینید' : 'فعال: همه می‌بینند'}</h2>
            <p className="text-xs text-muted mt-1">
              {draft
                ? `با «فعال کن» صفحه در منوی همه می‌آید و ثبت‌نام اعلان می‌شود. ${workdays < MIN_SIGNUP_WORKDAYS ? `هشدار: الان فقط ${toPersianDigits(workdays)} روز کاری تا پایان ثبت‌نام مانده است.` : `تا پایان ثبت‌نام ${toPersianDigits(workdays)} روز کاری مانده است.`}`
                : 'اگر چیزی را باید درست کنید می‌توانید آن را موقتاً به پیش‌نویس برگردانید؛ دوباره فعال کردن، اعلان تکراری نمی‌فرستد.'}
            </p>
          </div>
          {draft ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => void remove()} className={secondaryButtonClass}>
                <Trash2 className="w-4 h-4" /> حذف پیش‌نویس
              </button>
              <button type="button" onClick={() => void activate()} className={primaryButtonClass}>
                <Power className="w-4 h-4" /> فعال کن
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('صفحه از منوی همکاران برداشته شود و به پیش‌نویس برگردد؟')) void run(() => api.post(`/api/special_events/${event.id}/deactivate`), 'به پیش‌نویس برگشت.');
              }}
              className={secondaryButtonClass}
            >
              <EyeOff className="w-4 h-4" /> برگرداندن به پیش‌نویس
            </button>
          )}
        </div>
        {draft && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line">
            <label htmlFor={`${id}-test`} className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> امتحان صفحه در مرحلهٔ
            </label>
            <select
              id={`${id}-test`}
              value={event.testPhase ?? ''}
              onChange={(e) => void run(() => api.patch(`/api/special_events/${event.id}`, { testPhase: (e.target.value || null) as EventPhase | null }))}
              className={`${inputClass} w-auto`}
            >
              <option value="">طبق تاریخ‌ها (الان: {EVENT_PHASES.find((p) => p.id === event.realPhase)?.label})</option>
              {EVENT_PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">فقط در پیش‌نویس؛ با فعال کردن خودش برمی‌گردد.</span>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-black text-ink">تاریخ‌ها و برنامه</h2>
        <DatesFields value={form} onChange={setForm} />
        <div className="flex justify-end">
          <button type="button" onClick={() => void saveDates()} disabled={!datesChanged || saving || Boolean(datesProblem(form))} className={primaryButtonClass}>
            <Save className="w-4 h-4" /> ذخیره
          </button>
        </div>
      </section>

      <section className={card}>
        <div>
          <h2 className="text-sm font-black text-ink">برگزارکنندگان</h2>
          <p className="text-xs text-muted mt-1">مسابقه می‌سازند، قرعه می‌کشند، ساعت بازی‌ها را جابه‌جا می‌کنند، صفحهٔ بزرگ را می‌گردانند و اگر داوری نباشد نتیجه ثبت می‌کنند.</p>
        </div>
        <PeoplePicker label="برگزارکنندگان" value={organizerIds} onChange={setOrganizerIds} max={20} accountsOnly />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={organizerIds.join() === event.organizerIds.join()}
            onClick={() => void run(() => api.patch(`/api/special_events/${event.id}`, { organizerIds }), 'برگزارکنندگان ذخیره شدند.')}
            className={primaryButtonClass}
          >
            <Save className="w-4 h-4" /> ذخیره
          </button>
        </div>
      </section>

      <section className={card}>
        <div>
          <h2 className="text-sm font-black text-ink flex items-center gap-1.5">
            <Gavel className="w-4 h-4 text-red-700" /> هیئت داوران
          </h2>
          <p className="text-xs text-muted mt-1">
            ۳ یا ۵ نفر با یک رئیس. نتیجه‌ها را ثبت و اصلاح می‌کنند و به اعتراض‌ها رأی می‌دهند. داوران در هیچ مسابقه‌ای شرکت نمی‌کنند و از قرعه به بعد عکسشان بالای صفحه می‌آید.
          </p>
        </div>
        <PeoplePicker label="داوران" value={juryIds} onChange={(ids) => setJuryIds(ids)} max={5} accountsOnly unavailable={playing} />
        {juryIds.length > 0 && (
          <fieldset>
            <legend className={labelClass}>رئیس هیئت و عکس هر داور (اگر عکس پروفایلش مناسب نیست)</legend>
            <ul className="grid sm:grid-cols-2 gap-2">
              {juryIds.map((pid) => {
                const person = view.people[pid];
                const photo = event.juryPhotos[pid];
                return (
                  <li key={pid} className="flex items-center gap-2 p-2 rounded-xl border border-line">
                    <PersonAvatar person={person} src={photo || person?.avatarUrl || undefined} className="w-10 h-10 rounded-full" />
                    <label className="flex-1 min-w-0 flex items-center gap-1.5 text-xs font-bold">
                      <input type="radio" name={`${id}-head`} checked={headId === pid} onChange={() => setHeadId(pid)} className="accent-red-700" />
                      <span className="truncate">{person?.name ?? 'همکار تازه'}</span>
                      {headId === pid && <span className="text-amber-700">(رئیس)</span>}
                    </label>
                    {event.juryIds.includes(pid) && (
                      <FileUpload
                        accept={IMAGE_ACCEPT}
                        label="عکس"
                        className="text-[11px]"
                        onUploaded={(file) => void run(() => api.patch(`/api/special_events/${event.id}`, { juryPhotos: { ...event.juryPhotos, [pid]: file.url } }), 'عکس ذخیره شد.')}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
        {juryIds.length > 0 && juryIssue && <p className="text-xs text-amber-800">{juryIssue}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted flex items-center gap-1">
            <Camera className="w-3.5 h-3.5" /> عکس را بعد از ذخیرهٔ داوران می‌توانید بگذارید.
          </p>
          <button type="button" onClick={() => void saveJury()} disabled={!juryChanged || Boolean(juryIds.length > 0 && juryIssue)} className={primaryButtonClass}>
            <Save className="w-4 h-4" /> ذخیرهٔ داوران
          </button>
        </div>
      </section>
    </div>
  );
};
