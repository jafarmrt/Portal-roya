import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { CalendarCheck2, Download, FilePlus2, History, Pencil, Trash2, Upload } from 'lucide-react';
import type { Audience } from '../../../shared/audience';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage, type UploadedFile } from '../../lib/api';
import { formatDate, formatFileSize, toJalali, toPersianDigits } from '../../lib/jalali';
import type { DocumentDetails, DocumentVersion, PortalDocument } from '../../types';
import { DOCUMENT_ACCEPT, FileUpload } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AudiencePicker } from '../news/AudiencePicker';

const checkboxRow = 'flex items-start gap-2 cursor-pointer';

/** The chosen file, with a button to choose another. */
const ChosenFile: React.FC<{ file: UploadedFile; onClear: () => void }> = ({ file, onClear }) => (
  <div className="flex items-center justify-between gap-2 p-2.5 bg-[#F5F2ED] rounded-xl">
    <span className="truncate">{file.name}</span>
    <span className="text-[10px] text-[#8C867A] whitespace-nowrap">{formatFileSize(file.size)}</span>
    <button type="button" onClick={onClear} aria-label="حذف فایل" className="text-red-700"><Trash2 className="w-4 h-4" /></button>
  </div>
);

/** Colleagues with a portal account who can look after something (a document, a guide, a department), by department. */
export const OwnerSelect: React.FC<{ id: string; value: string | null; onChange: (id: string | null) => void; emptyLabel?: string; disabled?: boolean }> = ({
  id,
  value,
  onChange,
  emptyLabel = 'بدون مسئول',
  disabled,
}) => {
  const { employees, appSettings } = usePortal();
  const groups = useMemo(() => {
    const people = employees.filter((e) => e.isActive && e.hasAccount);
    const departments = [...new Set([...(appSettings?.departments ?? []), ...people.map((p) => p.department)])];
    return departments
      .map((d) => ({
        department: d,
        people: people.filter((p) => p.department === d).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fa')),
      }))
      .filter((g) => g.people.length > 0);
  }, [employees, appSettings]);
  return (
    <SearchableSelect id={id} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">{emptyLabel}</option>
      {groups.map((g) => (
        <optgroup key={g.department} label={g.department}>
          {g.people.map((p) => (
            <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.position}</option>
          ))}
        </optgroup>
      ))}
    </SearchableSelect>
  );
};

const detailsOf = (doc: PortalDocument | undefined, category: string): DocumentDetails => ({
  title: doc?.title ?? '',
  description: doc?.description ?? '',
  category: doc?.category ?? category,
  requiresAck: doc?.requiresAck ?? false,
  ownerId: doc?.ownerId ?? null,
  reviewDate: doc?.reviewAt ? toJalali(doc.reviewAt) : '',
  targetDepartments: doc?.targetDepartments ?? [],
  targetLocations: doc?.targetLocations ?? [],
  targetRoles: doc?.targetRoles ?? [],
  targetUserIds: doc?.targetUserIds ?? [],
});

/** Adds a document, or (with `doc`) changes its details without uploading it again. */
export const DocumentFormModal: React.FC<{ doc?: PortalDocument; onClose: () => void }> = ({ doc, onClose }) => {
  const { addDocument, updateDocument, appSettings } = usePortal();
  const categories = [...new Set([...(appSettings?.documentCategories ?? []), ...(doc ? [doc.category] : [])])];
  const [form, setForm] = useState<DocumentDetails>(() => detailsOf(doc, categories[0] ?? 'عمومی'));
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DocumentDetails>(key: K, value: DocumentDetails[K]) => setForm((f) => ({ ...f, [key]: value }));
  const audience: Audience = { departments: form.targetDepartments, locations: form.targetLocations, roles: form.targetRoles, userIds: form.targetUserIds };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc && !file) return;
    setBusy(true);
    const ok = doc ? await updateDocument(doc.id, form) : await addDocument({ ...form, file: file!, notify });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={doc ? 'ویرایش مشخصات سند' : 'افزودن سند یا فرم'}
      subtitle={doc ? doc.fileName : 'آیین‌نامه، دستورالعمل، فرم یا هر فایلی که همکاران باید به آن دسترسی داشته باشند'}
      icon={doc ? <Pencil className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="document-form" disabled={busy || (!doc && !file)} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : doc ? 'ذخیرهٔ تغییرات' : 'افزودن به کتابخانه'}
          </button>
        </>
      }
    >
      <form id="document-form" onSubmit={handleSubmit} className="space-y-4">
        {!doc && (
          <div>
            <span className={labelClass}>فایل *</span>
            {file ? (
              <ChosenFile file={file} onClear={() => setFile(null)} />
            ) : (
              <FileUpload
                accept={DOCUMENT_ACCEPT}
                label="انتخاب فایل (PDF، Word، Excel، ZIP…)"
                onUploaded={(f) => {
                  setFile(f);
                  // The file name is only a suggestion: keep a title typed while the file was uploading.
                  setForm((current) => (current.title ? current : { ...current, title: f.name.replace(/\.[^.]+$/, '') }));
                }}
              />
            )}
          </div>
        )}
        <div>
          <label htmlFor="doc-title" className={labelClass}>عنوان *</label>
          <input id="doc-title" required maxLength={200} value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="doc-category" className={labelClass}>دسته‌بندی</label>
            <SearchableSelect id="doc-category" value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </SearchableSelect>
          </div>
          <div>
            <label htmlFor="doc-owner" className={labelClass}>مسئول سند</label>
            <OwnerSelect id="doc-owner" value={form.ownerId} onChange={(id) => set('ownerId', id)} />
          </div>
        </div>
        <div>
          <label htmlFor="doc-description" className={labelClass}>توضیح کوتاه</label>
          <textarea id="doc-description" rows={2} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="doc-review" className={labelClass}>تاریخ بازبینی</label>
          <JalaliDateInput id="doc-review" value={form.reviewDate} onChange={(v) => set('reviewDate', v)} placeholder="مثلاً یک سال بعد" />
          <p className="text-[11px] text-[#6E6A60] mt-1">در این روز به مسئول سند (یا اگر مسئول ندارد، به بارگذاری‌کننده) یادآوری می‌شود که سند هنوز درست است یا نه.</p>
        </div>
        <label className={checkboxRow}>
          <input type="checkbox" checked={form.requiresAck} onChange={(e) => set('requiresAck', e.target.checked)} className="accent-red-700 mt-1" />
          <span>
            <span className="font-bold">لازم‌الاجرا</span>
            <span className="block text-[11px] text-[#6E6A60]">مثل بخشنامه، مخاطبان باید مطالعه را تأیید کنند و آمار تأییدها دیده می‌شود. با نسخهٔ جدید می‌شود دوباره تأیید خواست.</span>
          </span>
        </label>
        <AudiencePicker
          value={audience}
          onChange={(a) => setForm((f) => ({ ...f, targetDepartments: a.departments, targetLocations: a.locations, targetRoles: a.roles, targetUserIds: a.userIds }))}
          authorId={form.ownerId ?? ''}
          noun="سند"
        />
        {!doc && !form.requiresAck && (
          <label className={checkboxRow}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-red-700 mt-1" />
            <span className="font-bold">به مخاطبان اعلان بده</span>
          </label>
        )}
        {form.requiresAck && (!doc || !doc.requiresAck) && (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-2.5">به مخاطبان اعلان می‌رود که سند را مطالعه و تأیید کنند.</p>
        )}
      </form>
    </Modal>
  );
};

/** Replaces a document's file; the earlier one stays in the history and links to the document keep working. */
export const NewVersionModal: React.FC<{ doc: PortalDocument; onClose: () => void }> = ({ doc, onClose }) => {
  const { addDocumentVersion } = usePortal();
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [note, setNote] = useState('');
  const [reAck, setReAck] = useState(true);
  const [notify, setNotify] = useState(true);
  const [reviewDate, setReviewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const asksAgain = doc.requiresAck && reAck;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const ok = await addDocumentVersion(doc.id, { file, note, reAck: doc.requiresAck && reAck, notify, reviewDate });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="بارگذاری نسخهٔ جدید"
      subtitle={`${doc.title} · نسخهٔ فعلی ${toPersianDigits(doc.version)}`}
      icon={<FilePlus2 className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="document-version" disabled={busy || !file} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : `جایگزینی با نسخهٔ ${toPersianDigits(doc.version + 1)}`}
          </button>
        </>
      }
    >
      <form id="document-version" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[11px] text-[#6E6A60] leading-relaxed">
          فایل جدید جای فایل فعلی را می‌گیرد. نسخهٔ قبلی در «تاریخچه» می‌ماند و پیوندهایی که به این سند داده شده همچنان کار می‌کنند.
        </p>
        <div>
          <span className={labelClass}>فایل نسخهٔ جدید *</span>
          {file ? <ChosenFile file={file} onClear={() => setFile(null)} /> : <FileUpload accept={DOCUMENT_ACCEPT} label="انتخاب فایل" onUploaded={setFile} />}
        </div>
        <div>
          <label htmlFor="version-note" className={labelClass}>چه چیزی تغییر کرده است؟</label>
          <textarea id="version-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: بند ۴ (ساعت ورود) اصلاح شد" className={inputClass} />
        </div>
        <div>
          <label htmlFor="version-review" className={labelClass}>تاریخ بازبینی بعدی</label>
          <JalaliDateInput id="version-review" value={reviewDate} onChange={setReviewDate} placeholder={doc.reviewAt ? `بدون تغییر (${formatDate(doc.reviewAt)})` : 'اختیاری'} />
        </div>
        {doc.requiresAck && (
          <label className={checkboxRow}>
            <input type="checkbox" checked={reAck} onChange={(e) => setReAck(e.target.checked)} className="accent-red-700 mt-1" />
            <span>
              <span className="font-bold">همه دوباره مطالعه و تأیید کنند</span>
              <span className="block text-[11px] text-[#6E6A60]">برای اصلاح غلط تایپی یا تغییر جزئی این را بردارید تا تأییدهای قبلی معتبر بمانند.</span>
            </span>
          </label>
        )}
        {!asksAgain && (
          <label className={checkboxRow}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-red-700 mt-1" />
            <span className="font-bold">به مخاطبان اعلان بده</span>
          </label>
        )}
      </form>
    </Modal>
  );
};

/** "Reviewed, still correct": the owner sets the next review date, or goes on to upload a new version. */
export const ReviewModal: React.FC<{ doc: PortalDocument; onClose: () => void; onNewVersion: () => void }> = ({ doc, onClose, onNewVersion }) => {
  const { markDocumentReviewed } = usePortal();
  const [reviewDate, setReviewDate] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await markDocumentReviewed(doc.id, reviewDate);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="بازبینی سند"
      subtitle={doc.title}
      icon={<CalendarCheck2 className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onNewVersion} className={secondaryButtonClass}>
            <FilePlus2 className="w-4 h-4" /> نسخهٔ جدید دارم
          </button>
          <button type="submit" form="document-review" disabled={busy} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'هنوز درست است'}
          </button>
        </>
      }
    >
      <form id="document-review" onSubmit={handleSubmit} className="space-y-4">
        <p className="leading-relaxed">
          سند را بخوانید. اگر هنوز درست و به‌روز است، تاریخ بازبینی بعدی را بگذارید و «هنوز درست است» را بزنید. اگر باید تغییر کند، نسخهٔ جدید را بارگذاری کنید.
        </p>
        <a href={doc.fileUrl} download={doc.fileName} className={`${secondaryButtonClass} w-fit`}>
          <Download className="w-4 h-4" /> دریافت نسخهٔ فعلی
        </a>
        <div>
          <label htmlFor="review-next" className={labelClass}>بازبینی بعدی</label>
          <JalaliDateInput id="review-next" value={reviewDate} onChange={setReviewDate} placeholder="خالی: یادآوری دیگری نمی‌آید" />
        </div>
      </form>
    </Modal>
  );
};

/** Every version of a document, newest first, each with its file. */
export const VersionsModal: React.FC<{ doc: PortalDocument; onClose: () => void }> = ({ doc, onClose }) => {
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<DocumentVersion[]>(`/api/documents/${doc.id}/versions`).then(setVersions).catch((err) => setError(errorMessage(err)));
  }, [doc.id, doc.version]);

  return (
    <Modal title="تاریخچهٔ نسخه‌ها" subtitle={doc.title} icon={<History className="w-5 h-5" />} onClose={onClose} size="md">
      {error && <p role="alert" className="text-red-700 font-bold">{error}</p>}
      {!versions && !error && <p>در حال دریافت...</p>}
      {versions && (
        <ol className="space-y-2">
          {versions.map((v) => (
            <li key={v.version} className={`p-3 rounded-2xl border flex items-start gap-3 ${v.current ? 'border-emerald-300 bg-emerald-50' : 'border-[#E6E0D5]'}`}>
              <span className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-black ${v.current ? 'bg-emerald-600 text-white' : 'bg-[#F5F2ED]'}`}>
                نسخهٔ {toPersianDigits(v.version)}
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                {v.current && <span className="text-[11px] font-bold text-emerald-800">نسخهٔ فعلی</span>}
                {v.note && <p className="text-xs text-[#2D2D2D] leading-relaxed">{v.note}</p>}
                <p className="text-[11px] text-[#8C867A]">
                  {formatDate(v.createdAt)}{v.uploadedBy && ` · ${v.uploadedBy}`} · {formatFileSize(v.fileSize)}
                </p>
              </div>
              <a href={v.fileUrl} download={v.fileName} className="p-2 rounded-xl text-[#2D2D2D] hover:bg-white" aria-label={`دریافت نسخهٔ ${toPersianDigits(v.version)}`} title="دریافت فایل">
                <Download className="w-4 h-4" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
};
