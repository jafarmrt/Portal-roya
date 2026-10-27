import React, { lazy, Suspense, useState } from 'react';
import { CalendarCheck2, LifeBuoy, MessageCircleQuestion, Pencil, Phone, ThumbsDown, ThumbsUp, Trash2, UserRound } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { formatDate, toJalali, toPersianDigits } from '../../lib/jalali';
import type { Guide, GuideInput } from '../../types';
import { loadModule } from '../common/ErrorBoundary';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { OwnerSelect } from '../documents/DocumentModals';
import { NewsContent } from '../news/NewsBody';

const RichTextEditor = lazy(loadModule(() => import('../news/RichTextEditor')));

/** Suggested headings for a portal that has no guides yet. */
const STARTER_CATEGORIES = ['پرسش‌های رایج', 'منابع انسانی و اداری', 'مالی', 'فناوری اطلاعات', 'ایمنی و انبار'];

/** The owner and document managers keep a guide current. */
export function useLooksAfter() {
  const { can, currentUser } = usePortal();
  return (guide: Guide) => can('documents.manage') || (Boolean(currentUser) && guide.ownerId === currentUser?.id);
}

const inputOf = (guide: Guide | undefined): GuideInput => ({
  title: guide?.title ?? '',
  category: guide?.category ?? '',
  summary: guide?.summary ?? '',
  content: guide?.content ?? '',
  department: guide?.department ?? '',
  ownerId: guide?.ownerId ?? null,
  reviewDate: guide?.reviewAt ? toJalali(guide.reviewAt) : '',
});

/** Writes a guide, or (with `guide`) edits it. Owners keep the text current; managers also choose the owner and department. */
export const GuideFormModal: React.FC<{ guide?: Guide; onClose: () => void }> = ({ guide, onClose }) => {
  const { saveGuide, guides, appSettings, can } = usePortal();
  const isManager = can('documents.manage');
  const [form, setForm] = useState<GuideInput>(() => inputOf(guide));
  const [isEmpty, setIsEmpty] = useState(() => !guide);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GuideInput>(key: K, value: GuideInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const used = [...new Set(guides.map((g) => g.category))];
  const categories = used.length > 0 ? used : STARTER_CATEGORIES;
  const departments = [...new Set([...(appSettings?.departments ?? []), ...(form.department ? [form.department] : [])])];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty) return;
    setBusy(true);
    const ok = await saveGuide(form, guide?.id);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={guide ? 'ویرایش راهنما' : 'نوشتن راهنما'}
      subtitle={guide ? guide.title : 'پاسخ یک پرسش رایج یا مراحل انجام یک کار، به زبان ساده'}
      icon={guide ? <Pencil className="w-5 h-5" /> : <LifeBuoy className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="guide-form" disabled={busy || isEmpty} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : guide ? 'ذخیرهٔ تغییرات' : 'انتشار راهنما'}
          </button>
        </>
      }
    >
      <form id="guide-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="guide-title" className={labelClass}>عنوان یا پرسش *</label>
          <input
            id="guide-title"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="مثلاً: چطور درخواست مرخصی ثبت کنم؟"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="guide-category" className={labelClass}>دسته *</label>
            <input id="guide-category" required maxLength={100} list="guide-categories" value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass} />
            <datalist id="guide-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="guide-department" className={labelClass}>واحد مربوط</label>
            <select id="guide-department" value={form.department} disabled={!isManager} onChange={(e) => set('department', e.target.value)} className={inputClass}>
              <option value="">همهٔ واحدها</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="guide-owner" className={labelClass}>مسئول راهنما</label>
            <OwnerSelect id="guide-owner" value={form.ownerId} disabled={!isManager} onChange={(id) => set('ownerId', id)} />
          </div>
        </div>
        <div>
          <label htmlFor="guide-summary" className={labelClass}>پاسخ کوتاه</label>
          <input
            id="guide-summary"
            maxLength={500}
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
            placeholder="یک جمله که در فهرست دیده می‌شود، مثلاً: از سامانهٔ حضور و غیاب، منوی درخواست‌ها"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="guide-content" className={labelClass}>متن کامل *</label>
          <Suspense fallback={<div className="h-64 rounded-xl border border-[#D9D4CB] bg-[#F5F2ED] animate-pulse" />}>
            <RichTextEditor
              id="guide-content"
              value={form.content}
              placeholder="مراحل را شماره‌دار بنویسید؛ فرم یا سند لازم را با دکمهٔ پیوند وصل کنید."
              onChange={(html, empty) => {
                set('content', html);
                setIsEmpty(empty);
              }}
            />
          </Suspense>
        </div>
        <div>
          <label htmlFor="guide-review" className={labelClass}>تاریخ بازبینی</label>
          <JalaliDateInput id="guide-review" value={form.reviewDate} onChange={(v) => set('reviewDate', v)} placeholder="مثلاً شش ماه بعد" />
          <p className="text-[11px] text-[#6E6A60] mt-1">در این روز به مسئول راهنما یادآوری می‌شود که متن هنوز درست است یا نه.</p>
        </div>
      </form>
    </Modal>
  );
};

/** "Reviewed, still correct": the next review date, or on to editing the text. */
export const GuideReviewModal: React.FC<{ guide: Guide; onClose: () => void; onEdit: () => void }> = ({ guide, onClose, onEdit }) => {
  const { markGuideReviewed } = usePortal();
  const [reviewDate, setReviewDate] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await markGuideReviewed(guide.id, reviewDate);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="بازبینی راهنما"
      subtitle={guide.title}
      icon={<CalendarCheck2 className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onEdit} className={secondaryButtonClass}>
            <Pencil className="w-4 h-4" /> متن را به‌روز می‌کنم
          </button>
          <button type="submit" form="guide-review-form" disabled={busy} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'هنوز درست است'}
          </button>
        </>
      }
    >
      <form id="guide-review-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="leading-relaxed">راهنما را بخوانید. اگر هنوز درست است، تاریخ بازبینی بعدی را بگذارید؛ وگرنه متن را به‌روز کنید.</p>
        {guide.feedback && (guide.feedback.helpful > 0 || guide.feedback.notHelpful > 0) && (
          <p className="text-[#4B4740]">
            نظر همکاران تا امروز: {toPersianDigits(guide.feedback.helpful)} نفر مفید و {toPersianDigits(guide.feedback.notHelpful)} نفر نامفید دانسته‌اند.
          </p>
        )}
        <div>
          <label htmlFor="guide-review-next" className={labelClass}>بازبینی بعدی</label>
          <JalaliDateInput id="guide-review-next" value={reviewDate} onChange={setReviewDate} placeholder="خالی: یادآوری دیگری نمی‌آید" />
        </div>
      </form>
    </Modal>
  );
};

/** "Was this helpful?" and, when it was not, a question that goes straight to the guide's owner. */
const FeedbackBox: React.FC<{ guide: Guide }> = ({ guide }) => {
  const { currentUser, requestLogin, sendGuideFeedback, askGuideQuestion } = usePortal();
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);

  const answer = async (helpful: boolean) => {
    if (!currentUser) {
      requestLogin('برای ثبت نظر دربارهٔ راهنما وارد حساب کاربری خود شوید.');
      return;
    }
    if (helpful) {
      setAsking(false);
      await sendGuideFeedback(guide.id, true);
    } else {
      setAsking(true);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const to = await askGuideQuestion(guide.id, question);
    setBusy(false);
    if (to) {
      setSentTo(to);
      setQuestion('');
      setAsking(false);
    }
  };

  const choice = (helpful: boolean, active: boolean) =>
    `px-4 py-2 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
      !active ? 'text-[#2D2D2D] bg-white hover:bg-[#F5F2ED] border-[#D9D4CB]' : helpful ? 'text-white bg-emerald-600 border-emerald-600' : 'text-white bg-red-700 border-red-700'
    }`;

  return (
    <div className="p-4 rounded-2xl bg-[#F9F7F4] border border-[#E6E0D5] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-[#2D2D2D]">
          {guide.myFeedback === true ? 'ممنون که نظر دادید. این راهنما به کارتان آمد.' : 'این راهنما به کارتان آمد؟'}
        </p>
        <div className="flex gap-2">
          <button type="button" aria-pressed={guide.myFeedback === true} onClick={() => answer(true)} className={choice(true, guide.myFeedback === true)}>
            <ThumbsUp className="w-4 h-4" /> بله
          </button>
          <button type="button" aria-pressed={asking || guide.myFeedback === false} onClick={() => answer(false)} className={choice(false, asking || guide.myFeedback === false)}>
            <ThumbsDown className="w-4 h-4" /> جوابم را پیدا نکردم
          </button>
        </div>
      </div>
      {sentTo && !asking && <p className="text-emerald-800 font-bold">پرسش شما برای {sentTo} فرستاده شد و پاسخ را مستقیم از ایشان می‌گیرید.</p>}
      {asking && (
        <form onSubmit={send} className="space-y-2">
          <label htmlFor={`guide-question-${guide.id}`} className={labelClass}>
            چه چیزی را پیدا نکردید؟ پرسش شما برای مسئول این راهنما فرستاده می‌شود.
          </label>
          <textarea
            id={`guide-question-${guide.id}`}
            required
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className={inputClass}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAsking(false)} className={secondaryButtonClass}>انصراف</button>
            <button type="submit" disabled={busy || !question.trim()} className={primaryButtonClass}>
              <MessageCircleQuestion className="w-4 h-4" /> {busy ? 'در حال ارسال...' : 'فرستادن پرسش'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

/** A guide to read, with who to call and whether it helped. */
export const GuideViewModal: React.FC<{
  guide: Guide;
  onClose: () => void;
  onEdit: () => void;
  onReview: () => void;
  onDelete: () => void;
}> = ({ guide, onClose, onEdit, onReview, onDelete }) => {
  const { can, setActiveTab } = usePortal();
  const looksAfter = useLooksAfter()(guide);

  return (
    <Modal
      title={guide.title}
      subtitle={[guide.category, guide.department].filter(Boolean).join(' · ')}
      icon={<LifeBuoy className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        looksAfter ? (
          <>
            {can('documents.manage') && (
              <button type="button" onClick={onDelete} className={secondaryButtonClass}>
                <Trash2 className="w-4 h-4" /> حذف
              </button>
            )}
            {(guide.needsReview || guide.reviewAt) && (
              <button type="button" onClick={onReview} className={secondaryButtonClass}>
                <CalendarCheck2 className="w-4 h-4" /> بازبینی
              </button>
            )}
            <button type="button" onClick={onEdit} className={primaryButtonClass}>
              <Pencil className="w-4 h-4" /> ویرایش
            </button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {guide.summary && <p className="p-3 rounded-xl bg-red-50 text-red-950 font-bold leading-relaxed">{guide.summary}</p>}
        <NewsContent content={guide.content} format="html" className="text-sm" />
        <div className="pt-3 border-t border-[#E6E0D5] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6E6A60]">
          {guide.owner && (
            <span className="flex items-center gap-1">
              <UserRound className="w-3.5 h-3.5" /> مسئول: <strong className="text-[#2D2D2D]">{guide.owner}</strong>
              {guide.ownerExtension && (
                <span className="flex items-center gap-1 mr-1">
                  <Phone className="w-3.5 h-3.5" /> داخلی {toPersianDigits(guide.ownerExtension)}
                </span>
              )}
            </span>
          )}
          <span>آخرین به‌روزرسانی {formatDate(guide.updatedAt)}{guide.updatedBy && ` · ${guide.updatedBy}`}</span>
          {guide.department && (
            <button type="button" onClick={() => setActiveTab('departments', guide.department)} className="text-red-700 font-bold hover:underline">
              صفحهٔ واحد {guide.department}
            </button>
          )}
        </div>
        {looksAfter && (
          <p className="text-[11px] text-[#4B4740] bg-[#F5F2ED] rounded-xl p-2.5">
            {guide.feedback &&
              (guide.feedback.helpful + guide.feedback.notHelpful > 0
                ? `${toPersianDigits(guide.feedback.helpful)} نفر مفید و ${toPersianDigits(guide.feedback.notHelpful)} نفر نامفید دانسته‌اند.`
                : 'هنوز کسی نظر نداده است.')}
            {guide.reviewAt ? ` بازبینی: ${formatDate(guide.reviewAt)}${guide.needsReview ? ' (رسیده است)' : ''}.` : ' تاریخ بازبینی ندارد.'}
          </p>
        )}
        <FeedbackBox guide={guide} />
      </div>
    </Modal>
  );
};
