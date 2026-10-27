import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, LifeBuoy, Plus, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import { htmlToText, matches } from '../../lib/search';
import type { Guide } from '../../types';
import { inputClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { GuideFormModal, GuideReviewModal, GuideViewModal, useLooksAfter } from './GuideModals';

type Dialog = { kind: 'view' | 'edit' | 'review' | 'delete'; id: string };

const GuideRow: React.FC<{ guide: Guide; onOpen: () => void }> = ({ guide, onOpen }) => {
  const looksAfter = useLooksAfter()(guide);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full h-full text-right bg-white p-4 rounded-2xl border flex items-start gap-3 hover:border-red-400 hover:shadow-sm transition-all ${
          guide.needsReview ? 'border-red-300' : 'border-[#E6E0D5]'
        }`}
      >
        <span className="flex-1 min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-[#2D2D2D]">{guide.title}</span>
            {guide.needsReview && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-700 text-white flex items-center gap-1">
                <CalendarClock className="w-3 h-3" /> زمان بازبینی
              </span>
            )}
          </span>
          {guide.summary && <span className="block text-xs text-[#4B4740] leading-relaxed">{guide.summary}</span>}
          <span className="block text-[11px] text-[#8C867A]">
            {[guide.department, guide.owner && `مسئول: ${guide.owner}`, `به‌روز شده ${formatDate(guide.updatedAt)}`].filter(Boolean).join(' · ')}
          </span>
          {looksAfter && guide.feedback && (guide.feedback.helpful > 0 || guide.feedback.notHelpful > 0) && (
            <span className="flex items-center gap-3 text-[11px] text-[#6E6A60]">
              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3 text-emerald-700" /> {toPersianDigits(guide.feedback.helpful)}</span>
              <span className="flex items-center gap-1"><ThumbsDown className="w-3 h-3 text-red-700" /> {toPersianDigits(guide.feedback.notHelpful)}</span>
            </span>
          )}
        </span>
        <ChevronLeft className="w-4 h-4 text-[#A8A295] shrink-0 mt-1" />
      </button>
    </li>
  );
};

/** How-to guides and answers to common questions, each kept current by its owner. */
export const GuidesModule: React.FC = () => {
  const { guides, can, focusId, deleteGuide } = usePortal();
  const isManager = can('documents.manage');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [writing, setWriting] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(() => (focusId ? { kind: 'view', id: focusId } : null));

  // A link from search, a notification or a news text opens that guide.
  useEffect(() => {
    if (focusId) setDialog({ kind: 'view', id: focusId });
  }, [focusId]);

  const categories = useMemo(() => [...new Set(guides.map((g) => g.category))], [guides]);
  const texts = useMemo(() => new Map(guides.map((g) => [g.id, htmlToText(g.content)])), [guides]);
  const dueReview = guides.filter((g) => g.needsReview).length;

  const visible = guides.filter(
    (g) =>
      (category === 'all' ? true : category === 'review' ? g.needsReview : g.category === category) &&
      (!query.trim() || matches(query, g.title, g.summary, g.category, g.department, g.owner, texts.get(g.id))),
  );
  const grouped = categories.map((c) => ({ category: c, items: visible.filter((g) => g.category === c) })).filter((g) => g.items.length > 0);

  const current = dialog ? guides.find((g) => g.id === dialog.id) : undefined;
  const close = () => setDialog(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#7f1d1d] text-white rounded-2xl shadow-lg">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#2D2D2D]">راهنماها و پرسش‌های رایج</h2>
            <p className="text-sm text-[#6E6A60]">چطور انجامش بدهم؟ کدام فرم؟ با چه کسی تماس بگیرم؟</p>
          </div>
        </div>
        {isManager && (
          <button onClick={() => setWriting(true)} className={primaryButtonClass}>
            <Plus className="w-4 h-4" /> نوشتن راهنما
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C867A]" />
          <input
            type="search"
            aria-label="جستجو در راهنماها"
            placeholder="پرسش خود را بنویسید، مثلاً: مرخصی، تنخواه، رمز ایمیل..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pr-9`}
          />
        </div>
        {(categories.length > 1 || dueReview > 0) && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="دسته‌ها">
            {[
              { id: 'all', label: 'همه' },
              ...categories.map((c) => ({ id: c, label: c })),
              ...(dueReview > 0 ? [{ id: 'review', label: `زمان بازبینی (${toPersianDigits(dueReview)})` }] : []),
            ].map((f) => (
              <button
                key={f.id}
                aria-pressed={category === f.id}
                onClick={() => setCategory(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${category === f.id ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB]'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5] space-y-2">
          <LifeBuoy className="w-10 h-10 text-[#8C867A] mx-auto" />
          <p className="text-sm font-bold text-[#6E6A60]">
            {guides.length === 0 ? 'هنوز راهنمایی نوشته نشده است.' : 'راهنمایی با این عبارت پیدا نشد.'}
          </p>
          {guides.length === 0 && isManager && (
            <p className="text-xs text-[#8C867A] max-w-md mx-auto leading-relaxed">
              از پرسش‌هایی شروع کنید که همکاران بیشتر تلفنی می‌پرسند. گزارش «جستجوهای بی‌نتیجه» هم نشان می‌دهد همکاران دنبال چه چیزی بوده‌اند.
            </p>
          )}
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="space-y-3">
            <h3 className="text-sm font-black text-[#2D2D2D]">
              {group.category} <span className="text-[#8C867A] font-bold">({toPersianDigits(group.items.length)})</span>
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((g) => (
                <GuideRow key={g.id} guide={g} onOpen={() => setDialog({ kind: 'view', id: g.id })} />
              ))}
            </ul>
          </section>
        ))
      )}

      {writing && <GuideFormModal onClose={() => setWriting(false)} />}
      {dialog && current && (
        <>
          {dialog.kind === 'view' && (
            <GuideViewModal
              guide={current}
              onClose={close}
              onEdit={() => setDialog({ kind: 'edit', id: current.id })}
              onReview={() => setDialog({ kind: 'review', id: current.id })}
              onDelete={() => setDialog({ kind: 'delete', id: current.id })}
            />
          )}
          {dialog.kind === 'edit' && <GuideFormModal key={current.id} guide={current} onClose={() => setDialog({ kind: 'view', id: current.id })} />}
          {dialog.kind === 'review' && (
            <GuideReviewModal guide={current} onClose={() => setDialog({ kind: 'view', id: current.id })} onEdit={() => setDialog({ kind: 'edit', id: current.id })} />
          )}
          {dialog.kind === 'delete' && (
            <Modal
              title="حذف راهنما"
              icon={<Trash2 className="w-5 h-5" />}
              onClose={() => setDialog({ kind: 'view', id: current.id })}
              size="md"
              footer={
                <>
                  <button onClick={() => setDialog({ kind: 'view', id: current.id })} className={secondaryButtonClass}>انصراف</button>
                  <button
                    onClick={async () => {
                      if (await deleteGuide(current.id)) close();
                    }}
                    className={primaryButtonClass}
                  >
                    حذف
                  </button>
                </>
              }
            >
              <p>راهنمای «{current.title}» و نظرهای ثبت‌شده برای آن حذف می‌شود. پیوندهایی که در اخبار به آن داده شده دیگر کار نمی‌کنند. ادامه می‌دهید؟</p>
            </Modal>
          )}
        </>
      )}
    </div>
  );
};
