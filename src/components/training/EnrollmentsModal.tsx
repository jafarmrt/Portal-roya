import React, { useCallback, useEffect, useState } from 'react';
import { Download, UserMinus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { formatDate, formatDateTime, toPersianDigits } from '../../lib/jalali';
import type { TrainingEnrollment, TrainingProgram } from '../../types';
import { Modal, secondaryButtonClass } from '../common/Modal';

/** Who signed up for a training, with an Excel export and a way to take someone off the list. */
export const EnrollmentsModal: React.FC<{ training: TrainingProgram; onClose: () => void }> = ({ training, onClose }) => {
  const [rows, setRows] = useState<TrainingEnrollment[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<TrainingEnrollment[]>(`/api/trainings/${training.id}/enrollments`)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [training.id]);
  useEffect(load, [load, training.enrolledUserIds.length]);

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

  const exportCsv = () =>
    downloadCsv(`training-${training.date.replace(/\//g, '-')}.csv`, [
      ['ردیف', 'نام', 'سمت', 'واحد', 'داخلی', 'زمان ثبت‌نام', 'حضور'],
      ...(rows ?? []).map((r, i) => [String(i + 1), r.name, r.position, r.department, r.extension, formatDateTime(r.enrolledAt), '']),
    ]);

  return (
    <Modal
      title="ثبت‌نام‌شده‌های دوره"
      subtitle={`${training.title} · ${formatDate(training.date)}`}
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
        <div className="space-y-3">
          <p className="text-[#6E6A60]">
            {toPersianDigits(rows.length)} نفر از ظرفیت {toPersianDigits(training.capacity)} نفر ثبت‌نام کرده‌اند.
          </p>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-[#6E6A60]">هنوز کسی ثبت‌نام نکرده است.</p>
          ) : (
            <ol className="divide-y divide-[#E6E0D5] border border-[#E6E0D5] rounded-2xl overflow-hidden">
              {rows.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                  <span className="w-6 text-center text-[11px] text-[#8C867A] font-bold">{toPersianDigits(i + 1)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[#2D2D2D] truncate">{r.name}</div>
                    <div className="text-[11px] text-[#6E6A60] truncate">
                      {[r.position, r.department, r.extension && `داخلی ${toPersianDigits(r.extension)}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {confirming === r.userId ? (
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
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
};
