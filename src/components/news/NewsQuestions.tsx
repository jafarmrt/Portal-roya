import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageCircleQuestion, Send, Trash2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, toPersianDigits } from '../../lib/jalali';
import type { NewsItem, NewsQuestion } from '../../types';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface QuestionsData {
  canAnswer: boolean;
  items: NewsQuestion[];
}

const answerBox = 'p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs leading-relaxed whitespace-pre-line text-ink';

/**
 * Questions to the publisher under an item. Colleagues ask privately and see their own questions;
 * the publisher (and news managers) answer, each answer either only for the asker or added to the
 * item's questions and answers for everyone, without the asker's name.
 */
export const NewsQuestions: React.FC<{ article: NewsItem }> = ({ article }) => {
  const { currentUser, isGuest, news } = usePortal();
  const [data, setData] = useState<QuestionsData | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .get<QuestionsData>(`/api/news/${article.id}/questions`)
        .then(setData)
        .catch(() => setData({ canAnswer: false, items: [] })),
    [article.id],
  );
  // The news list reloads when a question is asked or answered anywhere, so this follows it.
  useEffect(() => {
    void load();
  }, [load, news]);

  if (!data) return null;
  const canAsk = Boolean(currentUser) && !isGuest && currentUser!.id !== article.authorId && !data.canAnswer;

  const ask = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/news/${article.id}/questions`, { question: text });
      toast.success('پرسش شما برای ناشر فرستاده شد.');
      setText('');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  };

  if (data.canAnswer) {
    const sorted = [...data.items].sort((a, b) => Number(Boolean(a.answer)) - Number(Boolean(b.answer)));
    return (
      <section aria-labelledby={`questions-${article.id}`} className="pt-4 border-t border-line space-y-3">
        <h4 id={`questions-${article.id}`} className="text-xs font-bold text-ink flex items-center gap-1.5">
          <MessageCircleQuestion className="w-4 h-4 text-red-700" /> پرسش‌های همکاران ({toPersianDigits(data.items.length)})
        </h4>
        {sorted.length === 0 ? (
          <p className="text-xs text-faint">هنوز کسی پرسشی نفرستاده است. همکاران زیر هر خبر می‌توانند خصوصی از شما بپرسند.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((q) => <QuestionToAnswer key={q.id} question={q} onChange={load} />)}
          </ul>
        )}
      </section>
    );
  }

  const shared = data.items.filter((q) => q.isPublic && q.answer && !q.mine);
  const mine = data.items.filter((q) => q.mine);
  if (!canAsk && shared.length === 0) return null;

  return (
    <section aria-labelledby={`questions-${article.id}`} className="pt-4 border-t border-line space-y-4">
      <h4 id={`questions-${article.id}`} className="text-xs font-bold text-ink flex items-center gap-1.5">
        <MessageCircleQuestion className="w-4 h-4 text-red-700" /> پرسش و پاسخ
      </h4>
      {shared.length > 0 && (
        <ul className="space-y-2" aria-label="پرسش‌ها و پاسخ‌های ناشر">
          {shared.map((q) => (
            <li key={q.id} className="space-y-1.5">
              <p className="text-xs font-bold text-ink whitespace-pre-line">پرسش: {q.question}</p>
              <div className={answerBox}>{q.answer}</div>
            </li>
          ))}
        </ul>
      )}
      {mine.length > 0 && (
        <ul className="space-y-2" aria-label="پرسش‌های شما">
          {mine.map((q) => (
            <li key={q.id} className="p-3 rounded-xl border border-line space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>پرسش شما، {formatDateTime(q.createdAt)}</span>
                {q.answer ? (
                  <span className="font-bold text-emerald-700">{q.isPublic ? 'پاسخ داده شد و برای همه هم آمد' : 'پاسخ داده شد'}</span>
                ) : (
                  <span className="font-bold text-amber-700">منتظر پاسخ</span>
                )}
              </div>
              <p className="text-xs whitespace-pre-line text-ink">{q.question}</p>
              {q.answer ? (
                <div className={answerBox}>{q.answer}</div>
              ) : (
                <WithdrawButton questionId={q.id} onDone={load} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canAsk && (
        <div className="space-y-2">
          <label htmlFor={`ask-${article.id}`} className={labelClass}>پرسشی دربارهٔ این خبر دارید؟ از {article.author} بپرسید</label>
          <textarea id={`ask-${article.id}`} rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted">پرسش فقط برای ناشر فرستاده می‌شود. اگر پاسخش به کار بقیه هم بیاید، ممکن است بدون نام شما اینجا بیاید.</p>
            <button type="button" onClick={ask} disabled={busy || !text.trim()} className={primaryButtonClass}>
              <Send className="w-4 h-4" /> ارسال پرسش
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

const WithdrawButton: React.FC<{ questionId: string; onDone: () => Promise<void> }> = ({ questionId, onDone }) => (
  <button
    type="button"
    onClick={async () => {
      try {
        await api.delete(`/api/news-questions/${questionId}`);
        toast.success('پرسش پس گرفته شد.');
        await onDone();
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }}
    className="text-xs font-bold text-red-700 hover:underline"
  >
    پس گرفتن پرسش
  </button>
);

/** One question in the publisher's list, with the form to answer it (or change the answer). */
const QuestionToAnswer: React.FC<{ question: NewsQuestion; onChange: () => Promise<void> }> = ({ question: q, onChange }) => {
  const [editing, setEditing] = useState(!q.answer);
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [isPublic, setIsPublic] = useState(q.isPublic);
  const [publicQuestion, setPublicQuestion] = useState(q.publicQuestion ?? q.question);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const asker = [q.askerName, q.askerDepartment].filter(Boolean).join('، ');

  const submit = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await api.put(`/api/news-questions/${q.id}`, { answer, isPublic, publicQuestion: isPublic ? publicQuestion : '' });
      toast.success(q.answer ? 'پاسخ به‌روز شد.' : 'پاسخ برای پرسنده فرستاده شد.');
      setEditing(false);
      await onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  };

  const remove = async () => {
    try {
      await api.delete(`/api/news-questions/${q.id}`);
      toast.success('پرسش حذف شد.');
      await onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <li aria-label={`پرسش ${asker}`} className={`p-3 rounded-xl border space-y-2 ${q.answer ? 'border-line' : 'border-amber-300 bg-amber-50/50'}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="font-bold text-ink">{asker}</span>
        <span className="flex items-center gap-2">
          {formatDateTime(q.createdAt)}
          {confirmDelete ? (
            <button type="button" onClick={remove} className="px-2 py-0.5 rounded-lg bg-red-700 text-white font-bold">حذف شود</button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} aria-label="حذف پرسش" className="p-0.5 hover:text-red-700">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
      <p className="text-xs whitespace-pre-line text-ink">{q.question}</p>
      {!editing && q.answer && (
        <div className="space-y-1">
          <div className={answerBox}>{q.answer}</div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>{q.isPublic ? 'در «پرسش و پاسخ» این خبر برای همه نمایش داده می‌شود' : 'فقط پرسنده پاسخ را می‌بیند'}</span>
            <button type="button" onClick={() => setEditing(true)} className="font-bold text-red-700 hover:underline">ویرایش پاسخ</button>
          </div>
        </div>
      )}
      {editing && (
        <div className="space-y-2">
          <label htmlFor={`answer-${q.id}`} className={labelClass}>پاسخ شما</label>
          <textarea id={`answer-${q.id}`} rows={3} maxLength={3000} value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputClass} />
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 accent-red-700" />
            <span>به «پرسش و پاسخ» این خبر اضافه شود تا همه ببینند (بدون نام پرسنده)</span>
          </label>
          {isPublic && (
            <div>
              <label htmlFor={`public-question-${q.id}`} className={labelClass}>متن پرسش برای نمایش به همه (می‌توانید جزئیات شخصی را حذف کنید)</label>
              <textarea id={`public-question-${q.id}`} rows={2} maxLength={1000} value={publicQuestion} onChange={(e) => setPublicQuestion(e.target.value)} className={inputClass} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={busy || !answer.trim()} className={primaryButtonClass}>ثبت پاسخ</button>
            {q.answer && <button type="button" onClick={() => setEditing(false)} className={secondaryButtonClass}>انصراف</button>}
          </div>
        </div>
      )}
    </li>
  );
};
