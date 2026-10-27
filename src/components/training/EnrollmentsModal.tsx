import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileText, MessageSquareHeart, Paperclip, UserMinus, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { formatDate, formatDateTime, formatFileSize, todayJalali, toPersianDigits } from '../../lib/jalali';
import type { TrainingEnrollment, TrainingFeedbackSummary, TrainingProgram } from '../../types';
import { DOCUMENT_ACCEPT, FileUpload } from '../common/FileUpload';
import { Modal, secondaryButtonClass } from '../common/Modal';
import { RATING_LABELS } from './TrainingFeedbackModal';

const attendanceLabel = (attended: boolean | null) => (attended === null ? 'ثبت نشده' : attended ? 'حاضر' : 'غایب');
const decimal = (value: number | null) => (value === null ? '—' : toPersianDigits(value.toFixed(1).replace(/\.0$/, '')).replace('.', '٫'));

const choiceClass = (active: boolean, present: boolean) =>
  `px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
    active ? (present ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-red-700 border-red-700 text-white') : 'bg-white border-[#D9D4CB] text-[#4B4740] hover:border-red-300'
  }`;

const Spread: React.FC<{ title: string; average: number | null; spread: number[]; total: number }> = ({ title, average, spread, total }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="font-bold text-[#2D2D2D]">{title}</span>
      <span className="text-[#6E6A60]">میانگین <strong className="text-[#991b1b] text-sm">{decimal(average)}</strong> از ۵</span>
    </div>
    <div className="grid grid-cols-5 gap-1 text-[10px] text-[#6E6A60] text-center">
      {spread.map((n, i) => (
        <div key={i} className="space-y-0.5">
          <div className="h-10 bg-[#F5F2ED] rounded-md flex items-end overflow-hidden" aria-hidden="true">
            <div className="w-full bg-[#991b1b]/80" style={{ height: `${total > 0 ? (n / total) * 100 : 0}%` }} />
          </div>
          <div>{RATING_LABELS[i]}: {toPersianDigits(n)}</div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Runs a course: who signed up and who is waiting, attendance from the day of the course, the
 * handouts and slides, and the survey's results. For the people who run trainings and the instructor.
 */
export const EnrollmentsModal: React.FC<{ training: TrainingProgram; onClose: () => void }> = ({ training, onClose }) => {
  const { can, saveTrainingMaterials } = usePortal();
  const isManager = can('trainings.manage');
  const started = training.date <= todayJalali();
  const [rows, setRows] = useState<TrainingEnrollment[] | null>(null);
  const [feedback, setFeedback] = useState<TrainingFeedbackSummary | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<TrainingEnrollment[]>(`/api/trainings/${training.id}/enrollments`)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
    if (started) api.get<TrainingFeedbackSummary>(`/api/trainings/${training.id}/feedback`).then(setFeedback).catch(() => undefined);
  }, [training.id, started]);
  useEffect(load, [load, training.enrolledUserIds.length, training.waitlistCount, training.feedbackCount]);

  const enrolled = rows?.filter((r) => r.status === 'enrolled') ?? [];
  const waitlist = rows?.filter((r) => r.status === 'waitlist') ?? [];

  const remove = async (row: TrainingEnrollment) => {
    try {
      await api.delete(`/api/trainings/${training.id}/enrollments/${row.userId}`);
      toast.success(`ثبت‌نام ${row.name} لغو شد و به او اطلاع داده شد.`);
      setConfirming(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const mark = async (row: TrainingEnrollment, attended: boolean) => {
    const next = row.attended === attended ? null : attended;
    setRows((prev) => prev?.map((r) => (r.userId === row.userId ? { ...r, attended: next } : r)) ?? null);
    try {
      await api.put(`/api/trainings/${training.id}/attendance`, { userId: row.userId, attended: next });
    } catch (err) {
      toast.error(errorMessage(err));
      load();
    }
  };

  const exportCsv = () =>
    downloadCsv(`training-${training.date.replace(/\//g, '-')}.csv`, [
      ['ردیف', 'نام', 'سمت', 'واحد', 'داخلی', 'زمان ثبت‌نام', 'وضعیت', 'حضور'],
      ...(rows ?? []).map((r, i) => [
        String(i + 1),
        r.name,
        r.position,
        r.department,
        r.extension,
        formatDateTime(r.enrolledAt),
        r.status === 'enrolled' ? 'ثبت‌نام' : 'لیست انتظار',
        r.status === 'enrolled' && started ? attendanceLabel(r.attended) : '',
      ]),
    ]);

  const person = (r: TrainingEnrollment) => (
    <div className="flex-1 min-w-0">
      <div className="font-bold text-[#2D2D2D] truncate">{r.name}</div>
      <div className="text-[11px] text-[#6E6A60] truncate">
        {[r.position, r.department, r.extension && `داخلی ${toPersianDigits(r.extension)}`].filter(Boolean).join('، ')}
      </div>
    </div>
  );

  const removeButton = (r: TrainingEnrollment) =>
    !isManager ? null : confirming === r.userId ? (
      <span className="flex items-center gap-1.5">
        <button type="button" onClick={() => remove(r)} className="px-2.5 py-1 text-[11px] font-bold text-white bg-red-700 rounded-lg">
          لغو ثبت‌نام
        </button>
        <button type="button" onClick={() => setConfirming(null)} className="px-2.5 py-1 text-[11px] font-bold text-[#6E6A60] bg-[#F5F2ED] rounded-lg">
          انصراف
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setConfirming(r.userId)}
        aria-label={`لغو ثبت‌نام ${r.name}`}
        title="لغو ثبت‌نام"
        className="p-1.5 text-[#8C867A] hover:text-red-700 hover:bg-red-50 rounded-lg"
      >
        <UserMinus className="w-4 h-4" />
      </button>
    );

  const present = enrolled.filter((r) => r.attended === true).length;

  return (
    <Modal
      title="شرکت‌کننده‌ها و حضور و غیاب"
      subtitle={`${training.title}، ${formatDate(training.date)}`}
      icon={<Users className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>بستن</button>
          <button type="button" onClick={exportCsv} disabled={!rows?.length} className={`${secondaryButtonClass} flex items-center gap-1.5`}>
            <Download className="w-4 h-4" /> خروجی اکسل (فهرست حضور)
          </button>
        </>
      }
    >
      {error && <p role="alert" className="text-red-700 font-bold">{error}</p>}
      {!rows && !error && <p>در حال دریافت...</p>}
      {rows && (
        <div className="space-y-6">
          <section aria-labelledby="enrolled-title" className="space-y-3">
            <h3 id="enrolled-title" className="text-sm font-black text-[#2D2D2D]">
              ثبت‌نام‌شده‌ها: {toPersianDigits(enrolled.length)} نفر از ظرفیت {toPersianDigits(training.capacity)} نفر
            </h3>
            <p className="text-[11px] text-[#6E6A60]">
              {started
                ? `حضور: ${toPersianDigits(present)} نفر حاضر، ${toPersianDigits(enrolled.filter((r) => r.attended === false).length)} نفر غایب. برای هر نفر «حاضر» یا «غایب» را بزنید؛ با زدن دوباره، پاک می‌شود.`
                : 'حضور و غیاب از روز برگزاری دوره باز می‌شود.'}
            </p>
            {enrolled.length === 0 ? (
              <p className="py-6 text-center text-[#6E6A60]">هنوز کسی ثبت‌نام نکرده است.</p>
            ) : (
              <ol className="divide-y divide-[#E6E0D5] border border-[#E6E0D5] rounded-2xl overflow-hidden">
                {enrolled.map((r, i) => (
                  <li key={r.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-white">
                    <span className="w-6 text-center text-[11px] text-[#8C867A] font-bold">{toPersianDigits(i + 1)}</span>
                    {person(r)}
                    {started && (
                      <span className="flex items-center gap-1" role="group" aria-label={`حضور ${r.name}`}>
                        <button type="button" aria-pressed={r.attended === true} onClick={() => mark(r, true)} className={choiceClass(r.attended === true, true)}>
                          حاضر
                        </button>
                        <button type="button" aria-pressed={r.attended === false} onClick={() => mark(r, false)} className={choiceClass(r.attended === false, false)}>
                          غایب
                        </button>
                      </span>
                    )}
                    {removeButton(r)}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {waitlist.length > 0 && (
            <section aria-labelledby="waitlist-title" className="space-y-2">
              <h3 id="waitlist-title" className="text-sm font-black text-[#2D2D2D]">لیست انتظار ({toPersianDigits(waitlist.length)} نفر)</h3>
              <p className="text-[11px] text-[#6E6A60]">با آزاد شدن هر جا، نفر اول این فهرست خودکار ثبت‌نام می‌شود و خبردار می‌شود.</p>
              <ol className="divide-y divide-[#E6E0D5] border border-[#E6E0D5] rounded-2xl overflow-hidden">
                {waitlist.map((r, i) => (
                  <li key={r.userId} className="flex items-center gap-3 px-3 py-2.5 bg-[#FDFBF7]">
                    <span className="w-6 text-center text-[11px] text-[#8C867A] font-bold">{toPersianDigits(i + 1)}</span>
                    {person(r)}
                    {removeButton(r)}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="materials-title" className="space-y-2">
            <h3 id="materials-title" className="text-sm font-black text-[#2D2D2D] flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-[#991b1b]" /> جزوه و اسلایدها
            </h3>
            <p className="text-[11px] text-[#6E6A60]">فایل‌ها روی کارت دوره دیده می‌شوند و با افزودن هر فایل، به شرکت‌کننده‌ها خبر داده می‌شود.</p>
            {training.materials.length > 0 && (
              <ul className="space-y-1.5">
                {training.materials.map((m) => (
                  <li key={m.url} className="flex items-center gap-2 text-xs">
                    <FileText className="w-4 h-4 text-[#8C867A] shrink-0" />
                    <a href={m.url} target="_blank" rel="noreferrer" className="font-bold text-[#2D2D2D] hover:underline truncate">{m.name}</a>
                    <span className="text-[10px] text-[#8C867A] shrink-0">{formatFileSize(m.size)}</span>
                    <button
                      type="button"
                      onClick={() => saveTrainingMaterials(training.id, training.materials.filter((x) => x.url !== m.url))}
                      aria-label={`حذف ${m.name}`}
                      className="p-1 text-[#8C867A] hover:text-red-700 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FileUpload
              accept={DOCUMENT_ACCEPT}
              label="افزودن جزوه یا اسلاید"
              onUploaded={(f) => saveTrainingMaterials(training.id, [...training.materials, f]).then((ok) => ok && toast.success(`«${f.name}» اضافه شد.`))}
            />
          </section>

          {started && feedback && (
            <section aria-labelledby="feedback-title" className="space-y-3">
              <h3 id="feedback-title" className="text-sm font-black text-[#2D2D2D] flex items-center gap-1.5">
                <MessageSquareHeart className="w-4 h-4 text-[#991b1b]" /> نظر شرکت‌کننده‌ها
              </h3>
              <p className="text-[11px] text-[#6E6A60]">
                {toPersianDigits(feedback.count)} نفر از {toPersianDigits(feedback.participants)} شرکت‌کننده نظر داده‌اند. نظرها بدون نام نشان داده می‌شوند.
              </p>
              {feedback.count > 0 && (
                <>
                  <Spread title="رضایت از دوره" average={feedback.satisfaction} spread={feedback.satisfactionSpread} total={feedback.count} />
                  <Spread title="کاربرد در کار" average={feedback.usefulness} spread={feedback.usefulnessSpread} total={feedback.count} />
                  {feedback.comments.length > 0 && (
                    <ul className="space-y-2" aria-label="نظرهای نوشته‌شده">
                      {feedback.comments.map((c, i) => (
                        <li key={i} className="text-xs text-[#4B4740] bg-[#FDFBF7] border border-[#E6E0D5] rounded-xl p-3 leading-relaxed whitespace-pre-line">{c.comment}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};
