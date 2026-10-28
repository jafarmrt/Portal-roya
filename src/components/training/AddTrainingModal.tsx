import React, { useState } from 'react';
import { CheckCircle2, GraduationCap, Pencil } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { TrainingInput, TrainingProgram } from '../../types';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { toPersianDigits } from '../../lib/jalali';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface AddTrainingModalProps {
  /** The training to edit; a new one is created when omitted. */
  training?: TrainingProgram;
  onClose: () => void;
}

const emptyForm = (category: string): TrainingInput => ({
  title: '',
  instructor: '',
  instructorRole: '',
  instructorId: null,
  date: '',
  time: '',
  duration: '',
  location: '',
  capacity: 25,
  description: '',
  category,
  prerequisites: '',
  coverImage: '',
});

const pick = (t: TrainingProgram): TrainingInput => ({
  title: t.title,
  instructor: t.instructor,
  instructorRole: t.instructorRole,
  instructorId: t.instructorId,
  date: t.date,
  time: t.time,
  duration: t.duration,
  location: t.location,
  capacity: t.capacity,
  description: t.description,
  coverImage: t.coverImage,
  category: t.category,
  prerequisites: t.prerequisites,
});

export const AddTrainingModal: React.FC<AddTrainingModalProps> = ({ training, onClose }) => {
  const { addTraining, updateTraining, appSettings, employees } = usePortal();
  const categories = appSettings?.trainingCategories ?? [];
  const [form, setForm] = useState<TrainingInput>(() => (training ? pick(training) : emptyForm(categories[0] ?? '')));
  // Colleagues who can sign in, for an instructor from inside the company.
  const colleagues = employees
    .filter((e) => e.isActive && e.hasAccount)
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fa'));
  const enrolledCount = training?.enrolledCount ?? 0;
  // Changes are also sent to the people on the waitlist.
  const signedUpCount = enrolledCount + (training?.waitlistCount ?? 0);
  const [notifyEnrolled, setNotifyEnrolled] = useState(true);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof TrainingInput>(key: K, value: TrainingInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const input = { ...form, category: form.category || categories[0] || 'عمومی' };
    const ok = training ? await updateTraining(training.id, input, notifyEnrolled && signedUpCount > 0) : await addTraining(input);
    setBusy(false);
    if (ok) onClose();
  };

  const textField = (id: string, label: string, key: 'title' | 'instructor' | 'instructorRole' | 'time' | 'duration' | 'location' | 'prerequisites', opts: { required?: boolean; placeholder?: string } = {}) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}{opts.required && ' *'}</label>
      <input id={id} required={opts.required} placeholder={opts.placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClass} />
    </div>
  );

  return (
    <Modal
      title={training ? 'ویرایش دورهٔ آموزشی' : 'تعریف دوره یا کارگاه آموزشی'}
      subtitle={training ? 'ثبت‌نام‌ها حفظ می‌شوند و رویداد تقویم هم به‌روز می‌شود' : 'به همهٔ همکاران اعلان داده می‌شود و در تقویم سازمان ثبت می‌شود'}
      icon={training ? <Pencil className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="add-training" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'در حال ثبت...' : training ? 'ذخیرهٔ تغییرات' : 'انتشار دوره'}
          </button>
        </>
      }
    >
      <form id="add-training" onSubmit={handleSubmit} className="space-y-4">
        {textField('tr-title', 'عنوان دوره', 'title', { required: true })}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {textField('tr-instructor', 'نام مدرس', 'instructor', { required: true })}
          {textField('tr-instructor-role', 'سمت یا تخصص مدرس', 'instructorRole')}
          <div>
            <label htmlFor="tr-instructor-id" className={labelClass}>مدرس در پرتال</label>
            <select
              id="tr-instructor-id"
              value={form.instructorId ?? ''}
              onChange={(e) => {
                const person = colleagues.find((c) => c.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  instructorId: person?.id ?? null,
                  instructor: person && !f.instructor.trim() ? `${person.firstName} ${person.lastName}` : f.instructor,
                }));
              }}
              className={inputClass}
            >
              <option value="">مدرس بیرون از شرکت</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.department ? ` (${c.department})` : ''}</option>
              ))}
            </select>
            <p className="text-[11px] text-[#6E6A60] mt-1">مدرس همکار، حضور و غیاب را ثبت می‌کند، جزوه می‌گذارد و نظر شرکت‌کننده‌ها را می‌بیند.</p>
          </div>
          <div>
            <label htmlFor="tr-category" className={labelClass}>دسته‌بندی</label>
            <select id="tr-category" value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tr-date" className={labelClass}>تاریخ برگزاری *</label>
            <JalaliDateInput id="tr-date" required value={form.date} onChange={(v) => set('date', v)} />
          </div>
          {textField('tr-time', 'ساعت برگزاری', 'time', { placeholder: '۹ تا ۱۲' })}
          {textField('tr-duration', 'مدت', 'duration', { placeholder: '۳ ساعت' })}
          {textField('tr-location', 'محل برگزاری', 'location')}
          <div>
            <label htmlFor="tr-capacity" className={labelClass}>ظرفیت *</label>
            <input id="tr-capacity" type="number" min={Math.max(1, enrolledCount)} max={1000} required value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} className={inputClass} />
            {training?.waitlistCount ? (
              <p className="text-[11px] text-[#6E6A60] mt-1">{toPersianDigits(training.waitlistCount)} نفر در لیست انتظارند؛ با بیشتر کردن ظرفیت به ترتیب ثبت‌نام می‌شوند.</p>
            ) : null}
          </div>
        </div>
        <div>
          <label htmlFor="tr-description" className={labelClass}>توضیحات و سرفصل‌ها *</label>
          <textarea id="tr-description" rows={4} required value={form.description} onChange={(e) => set('description', e.target.value)} className={inputClass} />
        </div>
        {textField('tr-prereq', 'پیش‌نیازها و مخاطبان', 'prerequisites')}
        <div className="flex items-center gap-3">
          {form.coverImage && <img src={form.coverImage} alt="" className="w-24 h-14 object-cover rounded-xl border border-[#E6E0D5]" />}
          <FileUpload accept={IMAGE_ACCEPT} label={form.coverImage ? 'تغییر تصویر' : 'تصویر جلد (اختیاری)'} onUploaded={(f) => set('coverImage', f.url)} />
          {form.coverImage && <button type="button" onClick={() => set('coverImage', '')} className="text-red-700 font-bold">حذف تصویر</button>}
        </div>
        {signedUpCount > 0 && (
          <label className="flex items-start gap-2 p-3 bg-[#F5F2ED] rounded-xl cursor-pointer">
            <input type="checkbox" checked={notifyEnrolled} onChange={(e) => setNotifyEnrolled(e.target.checked)} className="mt-1 accent-[#991b1b]" />
            <span>
              به {toPersianDigits(signedUpCount)} نفر ثبت‌نام‌شده{training?.waitlistCount ? ' و لیست انتظار' : ''} اطلاع داده شود
              <span className="block text-[11px] text-[#6E6A60]">مثلاً وقتی تاریخ، ساعت یا محل دوره عوض شده است. برای اصلاح غلط تایپی لازم نیست.</span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
};
