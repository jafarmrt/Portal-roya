import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Download,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { formatDate, formatFileSize, toPersianDigits } from '../../lib/jalali';
import { matches } from '../../lib/search';
import type { PortalDocument } from '../../types';
import { inputClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { ReceiptsModal } from '../common/ReceiptsModal';
import { audienceSummary } from '../news/NewsBody';
import { DocumentFormModal, NewVersionModal, ReviewModal, VersionsModal } from './DocumentModals';
import { AddToTodosButton } from '../todos/AddToTodosButton';

const fileIcon = (doc: PortalDocument) =>
  /sheet|excel|csv/.test(doc.mimeType) ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />;

/** A mandatory document this person still has to confirm. */
export const awaitsMyAck = (d: PortalDocument) => d.requiresAck && d.forMe && !d.acknowledgedAt;

type Filter = 'all' | 'mine' | 'mandatory' | 'review';
type Dialog = { kind: 'edit' | 'version' | 'review' | 'history' | 'receipts' | 'delete'; doc: PortalDocument };

const smallButton = (alert = false) =>
  `flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border bg-white ${alert ? 'border-red-300 text-red-800 hover:border-red-500' : 'border-[#E6E0D5] hover:border-red-300'}`;

const DocumentCard: React.FC<{ doc: PortalDocument; focused: boolean; open: (kind: Dialog['kind']) => void }> = ({ doc, focused, open }) => {
  const { can, currentUser, roleName, acknowledgeDocument } = usePortal();
  const isManager = can('documents.manage');
  const caretaker = isManager || (Boolean(currentUser) && doc.ownerId === currentUser?.id);
  const audience = audienceSummary(doc, roleName);
  const [acking, setAcking] = useState(false);

  return (
    <li
      id={`doc-${doc.id}`}
      className={`bg-white p-4 rounded-2xl border space-y-3 ${focused ? 'border-red-600 ring-2 ring-red-200' : awaitsMyAck(doc) ? 'border-amber-300' : 'border-[#E6E0D5]'}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-red-50 text-red-700 rounded-xl shrink-0">{fileIcon(doc)}</div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-[#2D2D2D]">{doc.title}</p>
            {doc.requiresAck && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 flex items-center gap-1">
                <FileCheck2 className="w-3 h-3" /> لازم‌الاجرا
              </span>
            )}
            {doc.version > 1 && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#F5F2ED] text-[#4B4740]">نسخهٔ {toPersianDigits(doc.version)}</span>}
            {doc.needsReview && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-700 text-white flex items-center gap-1">
                <CalendarClock className="w-3 h-3" /> زمان بازبینی
              </span>
            )}
          </div>
          {doc.description && <p className="text-xs text-[#6E6A60] leading-relaxed">{doc.description}</p>}
          {doc.version > 1 && doc.versionNote && <p className="text-[11px] text-[#4B4740]">تغییر نسخهٔ {toPersianDigits(doc.version)}: {doc.versionNote}</p>}
          <p className="text-[11px] text-[#8C867A]">
            {formatFileSize(doc.fileSize)} · {doc.version > 1 ? `به‌روز شده ${formatDate(doc.updatedAt)}` : formatDate(doc.createdAt)}
            {doc.owner ? ` · مسئول: ${doc.owner}` : doc.uploadedBy && ` · ${doc.uploadedBy}`}
            {caretaker && doc.reviewAt && ` · بازبینی: ${formatDate(doc.reviewAt)}`}
          </p>
          {audience && (
            <p className="text-[11px] text-[#6E6A60] flex items-center gap-1">
              <Users className="w-3.5 h-3.5 shrink-0" /> مخصوص {audience}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a href={doc.fileUrl} download={doc.fileName} className="p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED]" aria-label={`دریافت ${doc.title}`} title="دریافت فایل">
            <Download className="w-4 h-4" />
          </a>
          <AddToTodosButton
            type="document"
            id={doc.id}
            title={awaitsMyAck(doc) ? `مطالعه و تأیید: ${doc.title}` : doc.title}
            iconOnly
            className="p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED]"
          />
          {isManager && (
            <>
              <button onClick={() => open('edit')} className="p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED]" aria-label={`ویرایش ${doc.title}`} title="ویرایش مشخصات">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => open('delete')} className="p-2 rounded-xl text-red-700 hover:bg-red-50" aria-label={`حذف ${doc.title}`} title="حذف سند">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {doc.requiresAck && doc.forMe && (
        doc.acknowledgedAt ? (
          <p className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> مطالعه را {formatDate(doc.acknowledgedAt)} تأیید کرده‌اید.
          </p>
        ) : (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-amber-950 leading-relaxed">
              {doc.acknowledgedEarlier ? 'نسخهٔ جدید آمده است؛ لطفاً دوباره مطالعه و تأیید کنید.' : 'این سند لازم‌الاجراست؛ پس از مطالعه تأیید کنید.'}
            </p>
            <button
              disabled={acking}
              onClick={async () => {
                setAcking(true);
                await acknowledgeDocument(doc.id);
                setAcking(false);
              }}
              className={primaryButtonClass}
            >
              <FileCheck2 className="w-4 h-4" /> مطالعه کردم و رعایت می‌کنم
            </button>
          </div>
        )
      )}

      {(caretaker || doc.version > 1) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {doc.ackStats && (
            <button onClick={() => open('receipts')} className={smallButton()}>
              <BarChart3 className="w-3.5 h-3.5" />
              {toPersianDigits(doc.ackStats.acknowledged)} از {toPersianDigits(doc.ackStats.audience)} نفر تأیید کرده‌اند
            </button>
          )}
          {caretaker && (
            <button onClick={() => open('version')} className={smallButton()}>
              <FilePlus2 className="w-3.5 h-3.5" /> نسخهٔ جدید
            </button>
          )}
          {caretaker && (doc.needsReview || doc.reviewAt) && (
            <button onClick={() => open('review')} className={smallButton(doc.needsReview)}>
              <CalendarClock className="w-3.5 h-3.5" /> بازبینی
            </button>
          )}
          {doc.version > 1 && (
            <button onClick={() => open('history')} className={smallButton()}>
              <History className="w-3.5 h-3.5" /> تاریخچه ({toPersianDigits(doc.version)} نسخه)
            </button>
          )}
        </div>
      )}
    </li>
  );
};

export const DocumentsModule: React.FC = () => {
  const { documents, appSettings, can, currentUser, deleteDocument, focusId } = usePortal();
  const isManager = can('documents.manage');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Deep links from search, news text and notifications highlight one document.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`doc-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, documents]);

  const categories = useMemo(() => {
    const fromDocs = documents.map((d) => d.category);
    return [...new Set([...(appSettings?.documentCategories ?? []), ...fromDocs])].filter((c) => documents.some((d) => d.category === c));
  }, [documents, appSettings]);

  const pendingMine = documents.filter(awaitsMyAck).length;
  const mandatory = documents.filter((d) => d.requiresAck).length;
  const dueReview = documents.filter((d) => d.needsReview).length;
  const filters: { id: Filter; label: string; show: boolean }[] = [
    { id: 'all', label: 'همهٔ اسناد', show: true },
    { id: 'mine', label: `منتظر تأیید من (${toPersianDigits(pendingMine)})`, show: pendingMine > 0 },
    { id: 'mandatory', label: `لازم‌الاجرا (${toPersianDigits(mandatory)})`, show: mandatory > 0 },
    { id: 'review', label: `زمان بازبینی (${toPersianDigits(dueReview)})`, show: dueReview > 0 },
  ];
  const activeFilter = filters.find((f) => f.id === filter)?.show ? filter : 'all';

  const visible = documents.filter(
    (d) =>
      (category === 'all' || d.category === category) &&
      (activeFilter === 'all' || (activeFilter === 'mine' ? awaitsMyAck(d) : activeFilter === 'mandatory' ? d.requiresAck : d.needsReview)) &&
      (!query.trim() || matches(query, d.title, d.description, d.fileName, d.category, d.owner, d.versionNote)),
  );
  const grouped = categories
    .map((c) => ({ category: c, items: visible.filter((d) => d.category === c).sort((a, b) => Number(awaitsMyAck(b)) - Number(awaitsMyAck(a))) }))
    .filter((g) => g.items.length > 0);

  const open = (doc: PortalDocument) => (kind: Dialog['kind']) => setDialog({ kind, doc });
  // The dialog follows the live document, e.g. after a new version.
  const dialogDoc = dialog ? (documents.find((d) => d.id === dialog.doc.id) ?? dialog.doc) : null;
  const close = () => setDialog(null);

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

      {currentUser && pendingMine > 0 && activeFilter !== 'mine' && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-amber-950 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5" /> {toPersianDigits(pendingMine)} سند لازم‌الاجرا منتظر تأیید شماست.
          </p>
          <button onClick={() => setFilter('mine')} className={secondaryButtonClass}>نمایش</button>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C867A]" />
            <input
              type="search"
              aria-label="جستجو در اسناد"
              placeholder="جستجو در عنوان، توضیح، نام فایل یا مسئول..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClass} pr-9`}
            />
          </div>
          <SearchableSelect aria-label="دسته‌بندی" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} sm:w-56`}>
            <option value="all">همهٔ دسته‌ها</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </SearchableSelect>
        </div>
        {filters.filter((f) => f.show).length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="نمایش">
            {filters
              .filter((f) => f.show)
              .map((f) => (
                <button
                  key={f.id}
                  aria-pressed={activeFilter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${activeFilter === f.id ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB]'}`}
                >
                  {f.label}
                </button>
              ))}
          </div>
        )}
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
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {group.items.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} focused={focusId === doc.id} open={open(doc)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {uploadOpen && <DocumentFormModal onClose={() => setUploadOpen(false)} />}
      {dialog && dialogDoc && (
        <>
          {dialog.kind === 'edit' && <DocumentFormModal key={dialogDoc.id} doc={dialogDoc} onClose={close} />}
          {dialog.kind === 'version' && <NewVersionModal doc={dialogDoc} onClose={close} />}
          {dialog.kind === 'review' && <ReviewModal doc={dialogDoc} onClose={close} onNewVersion={() => setDialog({ kind: 'version', doc: dialogDoc })} />}
          {dialog.kind === 'history' && <VersionsModal doc={dialogDoc} onClose={close} />}
          {dialog.kind === 'receipts' && (
            <ReceiptsModal
              item={{
                title: dialogDoc.title,
                endpoint: `/api/documents/${dialogDoc.id}`,
                requiresAck: true,
                canRemind: true,
                ackRemindedAt: dialogDoc.ackRemindedAt,
                tracksReads: false,
                fileName: 'roya-portal-document-confirmations.csv',
              }}
              onClose={close}
            />
          )}
          {dialog.kind === 'delete' && (
            <Modal
              title="حذف سند"
              icon={<Trash2 className="w-5 h-5" />}
              onClose={close}
              size="md"
              footer={
                <>
                  <button onClick={close} className={secondaryButtonClass}>انصراف</button>
                  <button
                    onClick={async () => {
                      await deleteDocument(dialogDoc.id);
                      close();
                    }}
                    className={primaryButtonClass}
                  >
                    حذف
                  </button>
                </>
              }
            >
              <p>
                سند «{dialogDoc.title}»{dialogDoc.version > 1 ? ` با همهٔ ${toPersianDigits(dialogDoc.version)} نسخه‌اش` : ''}
                {dialogDoc.requiresAck ? ' و تأییدهای مطالعهٔ آن' : ''} از کتابخانه حذف می‌شود. ادامه می‌دهید؟
              </p>
            </Modal>
          )}
        </>
      )}
    </div>
  );
};
