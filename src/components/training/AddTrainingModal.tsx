import React, { useState } from 'react';
import { CheckCircle2, GraduationCap } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { TrainingProgram } from '../../types';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface AddTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TrainingInput = Omit<TrainingProgram, 'id' | 'enrolledUserIds'>;

const emptyForm = (category: string): TrainingInput => ({
  title: '',
  instructor: '',
  instructorRole: '',
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

export const AddTrainingModal: React.FC<AddTrainingModalProps> = ({ isOpen, onClose }) => {
  const { addTraining, appSettings } = usePortal();
  const categories = appSettings?.trainingCategories ?? [];
  const [form, setForm] = useState<TrainingInput>(() => emptyForm(categories[0] ?? ''));
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const set = <K extends keyof TrainingInput>(key: K, value: TrainingInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await addTraining({ ...form, category: form.category || categories[0] || 'عمومی' });
    setBusy(false);
    if (ok) {
      setForm(emptyForm(categories[0] ?? ''));
      onClose();
    }
  };

  const textField = (id: string, label: string, key: 'title' | 'instructor' | 'instructorRole' | 'time' | 'duration' | 'location' | 'prerequisites', opts: { required?: boolean; placeholder?: string } = {}) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}{opts.required && ' *'}</label>
      <input id={id} required={opts.required} placeholder={opts.placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClass} />
    </div>
  );

  return (
    <Modal
      title="تعریف دوره یا کارگاه آموزشی"
      subtitle="به همهٔ همکاران اعلان داده می‌شود و در تقویم سازمان ثبت می‌شود"
      icon={<GraduationCap className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="add-training" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'در حال ثبت...' : 'انتشار دوره'}
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
            <input id="tr-capacity" type="number" min={1} max={1000} required value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} className={inputClass} />
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
      </form>
    </Modal>
  );
};
