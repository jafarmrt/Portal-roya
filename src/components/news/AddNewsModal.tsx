import React, { lazy, Suspense, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, CheckCircle2, Eye, FileText, Image as ImageIcon, Newspaper, Paperclip, PenLine, Save, Trash2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { Attachment, NewsInput, NewsItem } from '../../types';
import { toJalali, formatFileSize } from '../../lib/jalali';
import { loadModule } from '../common/ErrorBoundary';
import { DOCUMENT_ACCEPT, FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AudiencePicker } from './AudiencePicker';
import { NewsContent, plainTextToHtml } from './NewsBody';
import { PlaceholderPanel, SaveAsTemplate, TemplatePicker } from './NewsTemplates';

// The editor is only downloaded by people who write news.
const RichTextEditor = lazy(loadModule(() => import('./RichTextEditor')));

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
      targetLocations: [],
      targetRoles: [],
      targetUserIds: [],
      contentFormat: 'html',
      attachments: [],
      ackDate: '',
      publishDate: '',
      publishTime: '',
      expiresDate: '',
    };
  }
  const scheduled = new Date(item.publishAt) > new Date();
  return {
    title: item.title,
    summary: item.summary,
    // Older items are plain text; they are opened in the editor as paragraphs.
    content: item.contentFormat === 'html' ? item.content : plainTextToHtml(item.content),
    contentFormat: 'html',
    // A draft may have been saved before a category was chosen.
    category: item.category || defaultCategory,
    image: item.image,
    isPinned: item.isPinned,
    isUrgent: item.isUrgent,
    requiresAck: item.requiresAck,
    tags: item.tags,
    targetDepartments: item.targetDepartments,
    targetLocations: item.targetLocations,
    targetRoles: item.targetRoles,
    targetUserIds: item.targetUserIds,
    attachments: item.attachments,
    ackDate: item.ackDeadline ? toJalali(item.ackDeadline) : '',
    publishDate: scheduled ? toJalali(item.publishAt) : '',
    publishTime: scheduled ? toJalali(item.publishAt, 'HH:mm') : '',
    expiresDate: item.expiresAt ? toJalali(item.expiresAt) : '',
  };
}

export const AddNewsModal: React.FC<NewsEditorModalProps> = ({ onClose, item }) => {
  const { saveNews, appSettings, currentUser } = usePortal();
  const categories = appSettings?.newsCategories ?? [];
  const [form, setForm] = useState<NewsInput>(() => initialState(item, categories[0] ?? 'اخبار سازمان'));
  const isDraft = !item || item.status === 'draft';
  // The editor reads its text once; a new key reloads it after a template or the blanks change the text.
  const [editorKey, setEditorKey] = useState(0);
  const [templateName, setTemplateName] = useState('');
  const [contentEmpty, setContentEmpty] = useState(() => !form.content.replace(/<[^>]*>/g, '').trim() && !form.content.includes('<img'));
  const [preview, setPreview] = useState(false);
  const [tagsText, setTagsText] = useState(form.tags.join('، '));
  const [scheduleOpen, setScheduleOpen] = useState(Boolean(form.publishDate || form.expiresDate));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof NewsInput>(key: K, value: NewsInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const tagsOf = (text: string) => text.split(/[,،]/).map((t) => t.trim()).filter(Boolean);

  const save = async (draft: boolean) => {
    setBusy(true);
    const data = { ...form, tags: tagsOf(tagsText), publishTime: form.publishDate ? form.publishTime || '08:00' : '', ackDate: form.requiresAck ? form.ackDate : '', draft };
    const message = draft ? 'پیش‌نویس ذخیره شد.' : !isDraft ? 'تغییرات ذخیره شد.' : form.publishDate ? 'انتشار خبر زمان‌بندی شد.' : 'خبر منتشر شد.';
    const ok = await saveNews(data, item?.id, message);
    setBusy(false);
    if (ok) onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  const saveDraft = () => {
    if (!form.title.trim()) {
      toast.error('برای ذخیرهٔ پیش‌نویس دست‌کم عنوان را بنویسید.');
      return;
    }
    void save(true);
  };

  /** Replaces parts of the form, e.g. with a template or with the blanks filled in. */
  const fillFrom = (next: Partial<NewsInput>) => {
    setForm((f) => ({ ...f, ...next }));
    if (next.tags) setTagsText(next.tags.join('، '));
    if (next.content !== undefined) {
      setContentEmpty(!next.content.replace(/<[^>]*>/g, '').trim());
      setEditorKey((k) => k + 1);
    }
  };

  return (
    <Modal
      title={!item ? 'انتشار خبر یا اطلاعیهٔ جدید' : item.status === 'draft' ? 'ادامهٔ پیش‌نویس' : 'ویرایش خبر یا اطلاعیه'}
      subtitle="اطلاعیه‌های اداری، بخشنامه‌ها، رویدادها و اخبار سازمانی"
      icon={<Newspaper className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="button" onClick={() => setPreview((p) => !p)} className={`${secondaryButtonClass} ml-auto`}>
            {preview ? <PenLine className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {preview ? 'بازگشت به ویرایش' : 'پیش‌نمایش'}
          </button>
          {isDraft && (
            <button type="button" onClick={saveDraft} disabled={busy} className={secondaryButtonClass} title="بدون اعلان به همکاران ذخیره می‌شود و بعداً کاملش می‌کنید">
              <Save className="w-4 h-4" /> ذخیرهٔ پیش‌نویس
            </button>
          )}
          <button type="submit" form="news-editor" disabled={busy || contentEmpty} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" />
            <span>{busy ? 'در حال ذخیره...' : !isDraft ? 'ذخیرهٔ تغییرات' : form.publishDate ? 'زمان‌بندی انتشار' : 'انتشار'}</span>
          </button>
        </>
      }
    >
      {preview && (
        <div className="space-y-4 text-sm leading-loose" aria-label="پیش‌نمایش">
          <p className="text-[11px] text-[#8C867A]">همکاران خبر را این‌طور می‌بینند:</p>
          <h2 className="text-lg font-black text-[#2D2D2D]">{form.title || 'بدون عنوان'}</h2>
          {form.image && <img src={form.image} alt="" className="w-full max-h-80 object-cover rounded-2xl" />}
          {form.summary && <div className="p-4 bg-[#F5F2ED] rounded-2xl border-r-4 border-[#dc2626] font-semibold">{form.summary}</div>}
          <NewsContent content={form.content} format="html" />
          {form.attachments.length > 0 && (
            <ul className="pt-4 border-t border-[#E6E0D5] space-y-1 text-xs">
              {form.attachments.map((a) => <li key={a.url} className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" />{a.name}</li>)}
            </ul>
          )}
        </div>
      )}
      <form id="news-editor" onSubmit={handleSubmit} className={`space-y-5 ${preview ? 'hidden' : ''}`}>
        {!item && (
          <TemplatePicker
            onPick={(t) => {
              setTemplateName(t.name);
              fillFrom({
                title: t.title,
                summary: t.summary,
                content: t.content,
                category: categories.includes(t.category) ? t.category : form.category,
                isUrgent: t.isUrgent,
                requiresAck: t.requiresAck,
                tags: t.tags,
              });
            }}
          />
        )}
        <PlaceholderPanel form={form} onFill={fillFrom} />
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
          <Suspense fallback={<div className="h-64 rounded-xl border border-[#D9D4CB] bg-[#F5F2ED] animate-pulse" />}>
            <RichTextEditor
              key={editorKey}
              id="news-content"
              value={form.content}
              onChange={(html, isEmpty) => {
                set('content', html);
                setContentEmpty(isEmpty);
              }}
            />
          </Suspense>
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
          {form.requiresAck && (
            <div className="mr-6 max-w-xs">
              <label htmlFor="news-ack-date" className={labelClass}>مهلت تأیید (اختیاری)</label>
              <JalaliDateInput id="news-ack-date" value={form.ackDate} onChange={(v) => set('ackDate', v)} />
              <p className="text-[11px] text-[#6E6A60] mt-1 leading-relaxed">
                یک روز پیش از مهلت به کسانی که تأیید نکرده‌اند یادآوری می‌شود. بعد از مهلت، فهرست آن‌ها به تفکیک واحد برای شما و برای مدیر مستقیم هر نفر فرستاده می‌شود.
              </p>
            </div>
          )}
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

        <AudiencePicker
          authorId={item?.authorId ?? currentUser?.id ?? ''}
          value={{ departments: form.targetDepartments, locations: form.targetLocations, roles: form.targetRoles, userIds: form.targetUserIds }}
          onChange={(a) => setForm((f) => ({ ...f, targetDepartments: a.departments, targetLocations: a.locations, targetRoles: a.roles, targetUserIds: a.userIds }))}
        />

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

        <SaveAsTemplate form={{ ...form, tags: tagsOf(tagsText) }} suggestedName={templateName} />

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
