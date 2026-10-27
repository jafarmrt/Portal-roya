import React, { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { IDLE_DAYS, type StoredMonthlySummary } from '../../../shared/reports';
import { api } from '../../lib/api';
import { formatDateTime, jalaliMonthLabel, toPersianDigits } from '../../lib/jalali';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { formatMinutes, formatPercent, formatRating } from './reportUi';

const isEmpty = (s: StoredMonthlySummary) => s.news.items + s.participation.polls + s.participation.trainings === 0;

/** The summary the portal keeps of each month, made on the first of the next month. */
export const MonthlySummaries: React.FC<{ onShowMonth: (from: string, to: string) => void }> = ({ onShowMonth }) => {
  const [summaries, setSummaries] = useState<StoredMonthlySummary[]>([]);
  const [open, setOpen] = useState<StoredMonthlySummary | null>(null);

  useEffect(() => {
    api
      .get<StoredMonthlySummary[]>('/api/reports/summaries')
      .then((list) => setSummaries(list.filter((s) => !isEmpty(s))))
      .catch(() => setSummaries([]));
  }, []);

  return (
    <section aria-labelledby="monthly-summaries" className="flex flex-wrap items-center gap-2 bg-white rounded-2xl px-4 py-3 border border-[#e5e5e5]">
      <h3 id="monthly-summaries" className="text-xs font-black text-[#2D2D2D] flex items-center gap-1.5 ml-2">
        <CalendarRange className="w-4 h-4 text-[#991b1b]" /> خلاصه‌های ماهانه
      </h3>
      {summaries.length === 0 ? (
        <p className="text-[11px] text-[#6E6A60]">خلاصهٔ هر ماه، صبح روز اول ماه بعد اینجا می‌آید و برای کسانی که گزارش‌ها را می‌بینند اعلان می‌شود.</p>
      ) : (
        summaries.map((s) => (
          <button
            key={s.month}
            onClick={() => setOpen(s)}
            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]"
          >
            {jalaliMonthLabel(s.month)}
          </button>
        ))
      )}
      {open && (
        <SummaryModal
          summary={open}
          onClose={() => setOpen(null)}
          onShowMonth={() => {
            onShowMonth(open.from, open.to);
            setOpen(null);
          }}
        />
      )}
    </section>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-[#F5F2ED] last:border-0 text-xs">
    <dt className="text-[#6E6A60]">{label}</dt>
    <dd className="font-bold text-[#2D2D2D] text-left">{children}</dd>
  </div>
);

const SummaryModal: React.FC<{ summary: StoredMonthlySummary; onClose: () => void; onShowMonth: () => void }> = ({ summary: s, onClose, onShowMonth }) => (
  <Modal
    title={`خلاصهٔ ${jalaliMonthLabel(s.month)}`}
    subtitle={`ساخته‌شده در ${formatDateTime(s.createdAt)}`}
    icon={<CalendarRange className="w-5 h-5" />}
    onClose={onClose}
    size="md"
    footer={
      <>
        <button onClick={onShowMonth} className={primaryButtonClass}>جزئیات این ماه در گزارش</button>
        <button onClick={onClose} className={secondaryButtonClass}>بستن</button>
      </>
    }
  >
    <div className="space-y-5">
      <section>
        <h4 className="text-xs font-black text-[#991b1b] mb-1">اطلاع‌رسانی</h4>
        <dl>
          <Row label="اطلاعیه‌های منتشرشده">{toPersianDigits(s.news.items)}</Row>
          <Row label="خوانده‌شدن">{formatPercent(s.news.readPercent)}</Row>
          <Row label="میانگین زمان تا خواندن">{formatMinutes(s.news.avgReadMinutes)}</Row>
          {s.news.ackPercent !== null && <Row label="تأیید بخشنامه‌ها">{formatPercent(s.news.ackPercent)}</Row>}
          {s.news.bestDepartment && <Row label="بیشترین خوانده‌شدن">{`${s.news.bestDepartment.name} (${formatPercent(s.news.bestDepartment.percent)})`}</Row>}
          {s.news.worstDepartment && <Row label="کمترین خوانده‌شدن">{`${s.news.worstDepartment.name} (${formatPercent(s.news.worstDepartment.percent)})`}</Row>}
          {s.news.topItem && <Row label="پرخواننده‌ترین اطلاعیه">{`${s.news.topItem.title} (${formatPercent(s.news.topItem.percent)})`}</Row>}
          {s.news.lowItem && <Row label="کم‌خواننده‌ترین اطلاعیه">{`${s.news.lowItem.title} (${formatPercent(s.news.lowItem.percent)})`}</Row>}
        </dl>
      </section>
      <section>
        <h4 className="text-xs font-black text-[#991b1b] mb-1">مشارکت</h4>
        <dl>
          <Row label="نظرسنجی‌ها">
            {s.participation.polls > 0 ? `${toPersianDigits(s.participation.polls)}، با ${formatPercent(s.participation.responsePercent)} پاسخ` : '—'}
          </Row>
          <Row label="دوره‌ها">
            {s.participation.trainings > 0 ? `${toPersianDigits(s.participation.trainings)}، با ${toPersianDigits(s.participation.participants)} شرکت‌کننده` : '—'}
          </Row>
          {s.participation.attendancePercent !== null && <Row label="حضور در کلاس‌ها">{formatPercent(s.participation.attendancePercent)}</Row>}
          {s.participation.satisfaction !== null && <Row label="رضایت از دوره‌ها">{formatRating(s.participation.satisfaction)}</Row>}
        </dl>
      </section>
      <dl>
        <Row label={`همکارانی که ${toPersianDigits(IDLE_DAYS)} روز سر نزده بودند`}>{toPersianDigits(s.idle)}</Row>
      </dl>
    </div>
  </Modal>
);
