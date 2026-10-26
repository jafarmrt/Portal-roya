import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, FolderOpen, Plus, Search, Trash2, Upload } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { UploadedFile } from '../../lib/api';
import { formatDate, formatFileSize, toPersianDigits } from '../../lib/jalali';
import { matches } from '../../lib/search';
import type { PortalDocument } from '../../types';
import { DOCUMENT_ACCEPT, FileUpload } from '../common/FileUpload';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

const fileIcon = (doc: PortalDocument) =>
  /sheet|excel|csv/.test(doc.mimeType) ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />;

const UploadDocumentModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addDocument, appSettings } = usePortal();
  const categories = appSettings?.documentCategories ?? [];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0] ?? '');
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const ok = await addDocument({ title, description, category: category || 'عمومی', file, notify });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="افزودن سند یا فرم"
      subtitle="آیین‌نامه، دستورالعمل، فرم یا هر فایلی که همکاران باید به آن دسترسی داشته باشند"
      icon={<Upload className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="upload-document" disabled={busy || !file} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'افزودن به کتابخانه'}
          </button>
        </>
      }
    >
      <form id="upload-document" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className={labelClass}>فایل *</span>
          {file ? (
            <div className="flex items-center justify-between gap-2 p-2.5 bg-[#F5F2ED] rounded-xl">
              <span className="truncate">{file.name}</span>
              <span className="text-[10px] text-[#8C867A] whitespace-nowrap">{formatFileSize(file.size)}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="حذف فایل" className="text-red-700"><Trash2 className="w-4 h-4" /></button>
            </div>
          ) : (
            <FileUpload
              accept={DOCUMENT_ACCEPT}
              label="انتخاب فایل (PDF، Word، Excel، ZIP…)"
              onUploaded={(f) => {
                setFile(f);
                if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          )}
        </div>
        <div>
          <label htmlFor="doc-title" className={labelClass}>عنوان *</label>
          <input id="doc-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="doc-category" className={labelClass}>دسته‌بندی</label>
          <select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="doc-description" className={labelClass}>توضیح کوتاه</label>
          <textarea id="doc-description" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 font-bold cursor-pointer">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-red-700" />
          به همهٔ همکاران اعلان بده
        </label>
      </form>
    </Modal>
  );
};

export const DocumentsModule: React.FC = () => {
  const { documents, appSettings, can, deleteDocument, focusId } = usePortal();
  const isManager = can('documents.manage');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PortalDocument | null>(null);

  // Deep links from search and notifications highlight one document.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`doc-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, documents]);

  const categories = useMemo(() => {
    const fromDocs = documents.map((d) => d.category);
    return [...new Set([...(appSettings?.documentCategories ?? []), ...fromDocs])].filter((c) => documents.some((d) => d.category === c));
  }, [documents, appSettings]);

  const visible = documents.filter(
    (d) => (category === 'all' || d.category === category) && (!query.trim() || matches(query, d.title, d.description, d.fileName, d.category)),
  );
  const grouped = categories
    .map((c) => ({ category: c, items: visible.filter((d) => d.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#7f1d1d] text-white rounded-2xl shadow-lg">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#2D2D2D]">اسناد و فرم‌ها</h2>
            <p className="text-sm text-[#6E6A60]">آخرین نسخهٔ آیین‌نامه‌ها، دستورالعمل‌ها و فرم‌های سازمان</p>
          </div>
        </div>
        {isManager && (
          <button onClick={() => setUploadOpen(true)} className={primaryButtonClass}>
            <Plus className="w-4 h-4" /> افزودن سند
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C867A]" />
          <input
            type="search"
            aria-label="جستجو در اسناد"
            placeholder="جستجو در عنوان، توضیح یا نام فایل..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pr-9`}
          />
        </div>
        <select aria-label="دسته‌بندی" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} sm:w-56`}>
          <option value="all">همهٔ دسته‌ها</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {grouped.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5]">
          <FolderOpen className="w-10 h-10 text-[#8C867A] mx-auto mb-2" />
          <p className="text-sm font-bold text-[#6E6A60]">
            {documents.length === 0 ? 'هنوز سندی بارگذاری نشده است.' : 'سندی با این مشخصات پیدا نشد.'}
          </p>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="space-y-3">
            <h3 className="text-sm font-black text-[#2D2D2D]">
              {group.category} <span className="text-[#8C867A] font-bold">({toPersianDigits(group.items.length)})</span>
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((doc) => (
                <li
                  key={doc.id}
                  id={`doc-${doc.id}`}
                  className={`bg-white p-4 rounded-2xl border flex items-start gap-3 ${focusId === doc.id ? 'border-red-600 ring-2 ring-red-200' : 'border-[#E6E0D5]'}`}
                >
                  <div className="p-2.5 bg-red-50 text-red-700 rounded-xl shrink-0">{fileIcon(doc)}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-bold text-[#2D2D2D]">{doc.title}</p>
                    {doc.description && <p className="text-xs text-[#6E6A60] leading-relaxed">{doc.description}</p>}
                    <p className="text-[11px] text-[#8C867A]">
                      {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}{doc.uploadedBy && ` · ${doc.uploadedBy}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={doc.fileUrl} download={doc.fileName} className="p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED]" aria-label={`دریافت ${doc.title}`} title="دریافت فایل">
                      <Download className="w-4 h-4" />
                    </a>
                    {isManager && (
                      <button onClick={() => setPendingDelete(doc)} className="p-2 rounded-xl text-red-700 hover:bg-red-50" aria-label={`حذف ${doc.title}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {uploadOpen && <UploadDocumentModal onClose={() => setUploadOpen(false)} />}
      {pendingDelete && (
        <Modal
          title="حذف سند"
          icon={<Trash2 className="w-5 h-5" />}
          onClose={() => setPendingDelete(null)}
          size="md"
          footer={
            <>
              <button onClick={() => setPendingDelete(null)} className={secondaryButtonClass}>انصراف</button>
              <button
                onClick={async () => {
                  await deleteDocument(pendingDelete.id);
                  setPendingDelete(null);
                }}
                className={primaryButtonClass}
              >
                حذف
              </button>
            </>
          }
        >
          <p>سند «{pendingDelete.title}» از کتابخانه حذف می‌شود. ادامه می‌دهید؟</p>
        </Modal>
      )}
    </div>
  );
};
