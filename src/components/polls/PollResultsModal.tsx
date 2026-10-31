import React, { useState } from 'react';
import { BarChart3, BellRing, Download, Lock, ShieldCheck, Table2, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { formatDateTime, toPersianDigits } from '../../lib/jalali';
import type { Poll, PollQuestion, PollResponses } from '../../types';
import { Modal, secondaryButtonClass } from '../common/Modal';
import { anonymityNote, typeLabel, visibilityNote } from './pollText';

const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const Bar: React.FC<{ label: React.ReactNode; count: number; total: number }> = ({ label, count, total }) => {
  const pct = percent(count, total);
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="font-bold text-ink min-w-0 break-words">{label}</span>
        <span className="whitespace-nowrap font-bold text-red-700">
          {toPersianDigits(pct)}٪ <span className="font-normal text-muted">({toPersianDigits(count)} نفر)</span>
        </span>
      </div>
      <div className="h-2.5 bg-surface-strong rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={typeof label === 'string' ? label : undefined}>
        <div className="h-full bg-red-700 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const QuestionResults: React.FC<{ question: PollQuestion; index: number }> = ({ question: q, index }) => {
  const r = q.results;
  if (!r) return null;
  return (
    <section className="p-4 rounded-2xl border border-line bg-surface-soft space-y-3" aria-label={q.text}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-bold text-ink leading-relaxed">{toPersianDigits(index + 1)}. {q.text}</h4>
        <span className="text-xs font-bold text-muted bg-white border border-line rounded-full px-2 py-0.5 whitespace-nowrap">{typeLabel(q.type)}</span>
      </div>
      <p className="text-xs text-muted">
        {toPersianDigits(r.answered)} نفر به این سؤال پاسخ داده‌اند{q.type === 'multiple' && r.answered > 0 ? '؛ هر نفر می‌توانست چند گزینه انتخاب کند' : ''}.
      </p>

      {r.votes && (
        <div className="space-y-2.5">
          {q.options.map((o) => (
            <Bar key={o.id} label={o.text} count={r.votes![o.id] ?? 0} total={r.answered} />
          ))}
        </div>
      )}

      {r.ratings && (
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="text-center px-4 py-2 bg-white rounded-2xl border border-line shrink-0">
            <p className="text-2xl font-black text-red-700">{r.average != null ? toPersianDigits(String(r.average)).replace('.', '٫') : '—'}</p>
            <p className="text-xs text-muted">میانگین از ۵</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((v) => (
              <Bar key={v} label={`امتیاز ${toPersianDigits(v)}`} count={r.ratings![v - 1]} total={r.answered} />
            ))}
          </div>
        </div>
      )}

      {q.type === 'text' &&
        (r.texts ? (
          r.texts.length === 0 ? (
            <p className="text-xs text-faint text-center py-4 bg-white rounded-xl border border-dashed border-line-strong">هنوز پاسخی نوشته نشده است.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {r.texts.map((text, i) => (
                <li key={i} className="p-3 bg-white rounded-xl border border-line text-xs text-ink leading-relaxed whitespace-pre-line">{text}</li>
              ))}
            </ul>
          )
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted p-3 bg-white rounded-xl border border-line">
            <Lock className="w-3.5 h-3.5 shrink-0" /> متن پاسخ‌ها فقط برای طراح نظرسنجی و مدیران نمایش داده می‌شود.
          </p>
        ))}
    </section>
  );
};

/** Each answer sheet in a table: names for named polls, numbered rows for anonymous ones. */
const ResponsesTable: React.FC<{ data: PollResponses }> = ({ data }) =>
  data.responses.length === 0 ? (
    <p className="text-xs text-faint text-center py-6 bg-surface rounded-xl">هنوز کسی پاسخ نداده است.</p>
  ) : (
    <div className="overflow-x-auto border border-line rounded-2xl">
      <table className="w-full text-xs">
        <thead className="bg-surface">
          <tr>
            <th className="text-right font-bold p-2.5 whitespace-nowrap">{data.anonymous ? 'پاسخ‌دهنده' : 'نام'}</th>
            {data.questions.map((q, i) => (
              <th key={i} className="text-right font-bold p-2.5 min-w-32">{q}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.responses.map((r, i) => (
            <tr key={i} className="border-t border-surface-strong align-top">
              <td className="p-2.5 whitespace-nowrap">
                {data.anonymous ? (
                  `ناشناس ${toPersianDigits(i + 1)}`
                ) : (
                  <>
                    <span className="block font-bold">{r.name}</span>
                    <span className="block text-xs text-muted">{r.department}</span>
                  </>
                )}
              </td>
              {r.answers.map((a, j) => (
                <td key={j} className="p-2.5 whitespace-pre-line">{a ? toPersianDigits(a) : <span className="text-line-strong">—</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

/**
 * A poll's results, question by question. The people who run the poll also get each answer sheet,
 * an Excel copy and a reminder to those who have not answered.
 */
export const PollResultsModal: React.FC<{ poll: Poll; onClose: () => void }> = ({ poll, onClose }) => {
  const [sheets, setSheets] = useState<PollResponses | null>(null);
  const [showSheets, setShowSheets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reminding, setReminding] = useState(false);

  const loadSheets = async () => {
    if (sheets) return sheets;
    setLoading(true);
    try {
      const data = await api.get<PollResponses>(`/api/polls/${poll.id}/responses`);
      setSheets(data);
      return data;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    const data = await loadSheets();
    if (!data) return;
    const header = data.anonymous ? ['ردیف', ...data.questions] : ['نام', 'واحد', 'زمان پاسخ', ...data.questions];
    const rows = data.responses.map((r, i) =>
      data.anonymous ? [String(i + 1), ...r.answers] : [r.name, r.department, r.submittedAt ? formatDateTime(r.submittedAt) : '', ...r.answers],
    );
    downloadCsv(`roya-poll-${poll.id}.csv`, [header, ...rows]);
  };

  const remind = async () => {
    setReminding(true);
    try {
      const { sent } = await api.post<{ sent: number }>(`/api/polls/${poll.id}/remind`);
      toast.success(sent > 0 ? `یادآوری برای ${toPersianDigits(sent)} نفر فرستاده شد.` : 'همه پاسخ داده‌اند؛ یادآوری لازم نبود.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setReminding(false);
    }
  };

  return (
    <Modal
      title={`نتایج: ${poll.title}`}
      subtitle={
        poll.audienceCount !== undefined
          ? `${toPersianDigits(poll.responseCount)} نفر از ${toPersianDigits(poll.audienceCount)} نفر پاسخ داده‌اند`
          : `${toPersianDigits(poll.responseCount)} نفر پاسخ داده‌اند`
      }
      icon={<BarChart3 className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={<button type="button" onClick={onClose} className={secondaryButtonClass}>بستن</button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ${poll.anonymous ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} title={anonymityNote(poll.anonymous)}>
            {poll.anonymous ? <ShieldCheck className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {poll.anonymous ? 'ناشناس' : 'با نام'}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-surface text-ink-soft font-bold">{visibilityNote[poll.resultsVisibility]}</span>
        </div>

        {poll.canManage && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-surface border border-line">
            <button type="button" onClick={exportExcel} disabled={loading} className={secondaryButtonClass}>
              <Download className="w-4 h-4" /> خروجی اکسل
            </button>
            <button
              type="button"
              aria-expanded={showSheets}
              onClick={async () => {
                if (!showSheets) await loadSheets();
                setShowSheets((s) => !s);
              }}
              disabled={loading}
              className={secondaryButtonClass}
            >
              <Table2 className="w-4 h-4" /> {showSheets ? 'نمایش خلاصه' : poll.anonymous ? 'پاسخ‌ها به تفکیک (بی‌نام)' : 'پاسخ هر نفر'}
            </button>
            {poll.isActive && (
              <button type="button" onClick={remind} disabled={reminding} className={secondaryButtonClass}>
                <BellRing className="w-4 h-4" />
                {reminding ? 'در حال ارسال...' : 'یادآوری به کسانی که پاسخ نداده‌اند'}
              </button>
            )}
            {poll.remindedAt && <span className="text-xs text-muted">آخرین یادآوری: {formatDateTime(poll.remindedAt)}</span>}
          </div>
        )}

        {showSheets && sheets ? (
          <ResponsesTable data={sheets} />
        ) : poll.responseCount === 0 ? (
          <p className="text-xs text-faint text-center py-8 bg-surface rounded-2xl">هنوز کسی پاسخ نداده است.</p>
        ) : (
          poll.questions.map((q, i) => <QuestionResults key={q.id} question={q} index={i} />)
        )}
      </div>
    </Modal>
  );
};
