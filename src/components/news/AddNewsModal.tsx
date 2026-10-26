import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, FileText, Image as ImageIcon, Newspaper, Paperclip, Trash2, Users } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { Attachment, NewsInput, NewsItem } from '../../types';
import { toJalali, formatFileSize } from '../../lib/jalali';
import { DOCUMENT_ACCEPT, FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface NewsEditorModalProps {
  onClose: () => void;
  /** When given, the modal edits this item instead of creating a new one. */
  item?: NewsItem;
}

function initialState(item: NewsItem | undefined, defaultCategory: string): NewsInput {
  if (!item) {
    return {
      title: '',
      summary: '',
      content: '',
      category: defaultCategory,
      image: '',
      isPinned: false,
      isUrgent: false,
      requiresAck: false,
      tags: [],
      targetDepartments: [],
      attachments: [],
      publishDate: '',
      publishTime: '',
      expiresDate: '',
    };
  }
  const scheduled = new Date(item.publishAt) > new Date();
  return {
    title: item.title,
    summary: item.summary,
    content: item.content,
    category: item.category,
    image: item.image,
    isPinned: item.isPinned,
    isUrgent: item.isUrgent,
    requiresAck: item.requiresAck,
    tags: item.tags,
    targetDepartments: item.targetDepartments,
    attachments: item.attachments,
    publishDate: scheduled ? toJalali(item.publishAt) : '',
    publishTime: scheduled ? toJalali(item.publishAt, 'HH:mm') : '',
    expiresDate: item.expiresAt ? toJalali(item.expiresAt) : '',
  };
}

export const AddNewsModal: React.FC<NewsEditorModalProps> = ({ onClose, item }) => {
  const { saveNews, appSettings } = usePortal();
  const categories = appSettings?.newsCategories ?? [];
  const departments = appSettings?.departments ?? [];
  const [form, setForm] = useState<NewsInput>(() => initialState(item, categories[0] ?? 'اخبار سازمان'));
  const [tagsText, setTagsText] = useState(form.tags.join('، '));
  const [scheduleOpen, setScheduleOpen] = useState(Boolean(form.publishDate || form.expiresDate));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof NewsInput>(key: K, value: NewsInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const toggleDepartment = (dep: string) =>
    set('targetDepartments', form.targetDepartments.includes(dep) ? form.targetDepartments.filter((d) => d !== dep) : [...form.targetDepartments, dep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const tags = tagsText.split(/[,،]/).map((t) => t.trim()).filter(Boolean);
    const ok = await saveNews({ ...form, tags, publishTime: form.publishDate ? form.publishTime || '08:00' : '' }, item?.id);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={item ? 'ویرایش خبر یا اطلاعیه' : 'انتشار خبر یا اطلاعیهٔ جدید'}
      subtitle="اطلاعیه‌های اداری، بخشنامه‌ها، رویدادها و اخبار سازمانی"
      icon={<Newspaper className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="news-editor" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" />
            <span>{busy ? 'در حال ذخیره...' : item ? 'ذخیرهٔ تغییرات' : form.publishDate ? 'زمان‌بندی انتشار' : 'انتشار'}</span>
          </button>
        </>
      }
    >
      <form id="news-editor" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="news-title" className={labelClass}>عنوان *</label>
            <input id="news-title" required maxLength={200} value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="news-category" className={labelClass}>دسته‌بندی *</label>
            <select id="news-category" value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="news-summary" className={labelClass}>خلاصه (در فهرست و اعلان نمایش داده می‌شود) *</label>
          <textarea id="news-summary" required rows={2} maxLength={500} value={form.summary} onChange={(e) => set('summary', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="news-content" className={labelClass}>متن کامل *</label>
          <textarea id="news-content" required rows={8} maxLength={20000} value={form.content} onChange={(e) => set('content', e.target.value)} className={`${inputClass} leading-loose`} />
        </div>

        {/* Delivery options: these decide who is notified and how. */}
        <fieldset className="p-4 bg-[#F5F2ED] rounded-2xl border border-[#E6E0D5] space-y-3">
          <legend className="text-xs font-black text-[#2D2D2D] px-1">نحوهٔ اطلاع‌رسانی</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.requiresAck} onChange={(e) => set('requiresAck', e.target.checked)} className="mt-0.5 accent-red-700" />
            <span>
              <strong>بخشنامه: نیاز به تأیید مطالعه دارد</strong>
              <span className="block text-[11px] text-[#6E6A60]">هر همکار باید روی «مطالعه کردم» بزند و شما فهرست خوانده‌ها و نخوانده‌ها را می‌بینید.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isUrgent} onChange={(e) => set('isUrgent', e.target.checked)} className="mt-0.5 accent-red-700" />
            <span>
              <strong>فوری</strong>
              <span className="block text-[11px] text-[#6E6A60]">با نشان قرمز نمایش داده می‌شود و اگر ایمیل سازمانی تنظیم شده باشد، ایمیل هم ارسال می‌شود.</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isPinned} onChange={(e) => set('isPinned', e.target.checked)} className="accent-red-700" />
            <strong>سنجاق در بالای فهرست اخبار</strong>
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={`${labelClass} flex items-center gap-1.5`}>
            <Users className="w-4 h-4" /> مخاطبان
          </legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => set('targetDepartments', [])}
              aria-pressed={form.targetDepartments.length === 0}
              className={`px-3 py-1.5 rounded-xl font-bold border ${form.targetDepartments.length === 0 ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB]'}`}
            >
              همهٔ سازمان
            </button>
            {departments.map((dep) => {
              const active = form.targetDepartments.includes(dep);
              return (
                <button
                  key={dep}
                  type="button"
                  onClick={() => toggleDepartment(dep)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-xl font-bold border ${active ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB]'}`}
                >
                  {dep}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className={`${labelClass} flex items-center gap-1.5`}><ImageIcon className="w-4 h-4" /> تصویر شاخص (اختیاری)</span>
            {form.image ? (
              <div className="relative">
                <img src={form.image} alt="" className="w-full h-32 object-cover rounded-xl border border-[#E6E0D5]" />
                <button type="button" onClick={() => set('image', '')} aria-label="حذف تصویر" className="absolute top-2 left-2 p-1.5 bg-white/90 rounded-lg text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <FileUpload accept={IMAGE_ACCEPT} label="بارگذاری تصویر" onUploaded={(f) => set('image', f.url)} />
            )}
          </div>

          <div className="space-y-2">
            <span className={`${labelClass} flex items-center gap-1.5`}><Paperclip className="w-4 h-4" /> پیوست‌ها (PDF، Word، Excel…)</span>
            {form.attachments.map((a: Attachment) => (
              <div key={a.url} className="flex items-center justify-between gap-2 p-2 bg-[#F5F2ED] rounded-xl">
                <span className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-4 h-4 shrink-0 text-red-700" />
                  <span className="truncate">{a.name}</span>
                  <span className="text-[10px] text-[#8C867A] whitespace-nowrap">{formatFileSize(a.size)}</span>
                </span>
                <button type="button" aria-label={`حذف ${a.name}`} onClick={() => set('attachments', form.attachments.filter((x) => x.url !== a.url))} className="p-1 text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {form.attachments.length < 10 && (
              <FileUpload accept={DOCUMENT_ACCEPT} label="افزودن پیوست" onUploaded={(f) => set('attachments', [...form.attachments, f])} />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="news-tags" className={labelClass}>برچسب‌ها (با ویرگول جدا کنید)</label>
          <input id="news-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={inputClass} />
        </div>

        <div className="border-t border-[#E6E0D5] pt-4">
          <button type="button" onClick={() => setScheduleOpen((o) => !o)} aria-expanded={scheduleOpen} className="flex items-center gap-1.5 font-bold text-red-700">
            <CalendarClock className="w-4 h-4" />
            زمان‌بندی انتشار و تاریخ انقضا
          </button>
          {scheduleOpen && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <div>
                <label htmlFor="news-publish-date" className={labelClass}>تاریخ انتشار (خالی = همین حالا)</label>
                <JalaliDateInput id="news-publish-date" value={form.publishDate} onChange={(v) => set('publishDate', v)} />
              </div>
              <div>
                <label htmlFor="news-publish-time" className={labelClass}>ساعت انتشار</label>
                <input id="news-publish-time" type="time" dir="ltr" value={form.publishTime} onChange={(e) => set('publishTime', e.target.value)} disabled={!form.publishDate} className={inputClass} />
              </div>
              <div>
                <label htmlFor="news-expires-date" className={labelClass}>نمایش تا پایان روز (اختیاری)</label>
                <JalaliDateInput id="news-expires-date" value={form.expiresDate} onChange={(v) => set('expiresDate', v)} />
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};
