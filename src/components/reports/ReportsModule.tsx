import React, { useEffect, useState } from 'react';
import moment from 'moment-jalaali';
import { BarChart2, Download, Loader2 } from 'lucide-react';
import type { ReportOverview } from '../../../shared/reports';
import { api, errorMessage } from '../../lib/api';
import { formatDate, isValidJalaliDate, toLatinDigits } from '../../lib/jalali';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { labelClass, secondaryButtonClass } from '../common/Modal';
import { MonthlySummaries } from './MonthlySummaries';
import { MoodReport } from './MoodReport';
import { IdlePeopleCard, NewsReachReport } from './NewsReachReport';
import { ParticipationReport } from './ParticipationReport';
import { exportReport } from './reportExport';
import { usePortal } from '../../context/PortalContext';
import { featureOn } from '../../lib/features';

const DAY = 'jYYYY/jMM/jDD';

type Preset = 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

const PRESETS: { id: Exclude<Preset, 'custom'>; label: string; range: () => { from: string; to: string } }[] = [
  { id: 'last30', label: '۳۰ روز اخیر', range: () => ({ from: moment().subtract(29, 'days').format(DAY), to: moment().format(DAY) }) },
  { id: 'thisMonth', label: 'این ماه', range: () => ({ from: moment().startOf('jMonth').format(DAY), to: moment().format(DAY) }) },
  {
    id: 'lastMonth',
    label: 'ماه گذشته',
    range: () => {
      const end = moment().startOf('jMonth').subtract(1, 'day');
      return { from: end.clone().startOf('jMonth').format(DAY), to: end.format(DAY) };
    },
  },
  { id: 'thisYear', label: 'امسال', range: () => ({ from: moment().startOf('jYear').format(DAY), to: moment().format(DAY) }) },
];

type Tab = 'reach' | 'participation' | 'mood';
const TABS: { id: Tab; label: string }[] = [
  { id: 'reach', label: 'اثربخشی اطلاع‌رسانی' },
  { id: 'participation', label: 'مشارکت همکاران' },
  { id: 'mood', label: 'حال‌وهوای سازمان' },
];

export const ReportsModule: React.FC = () => {
  const { appSettings } = usePortal();
  const [tab, setTab] = useState<Tab>('reach');
  // The mood report belongs to the daily mood card, which may still be hidden.
  const tabs = TABS.filter((t) => t.id !== 'mood' || featureOn(appSettings, 'mood'));
  const [preset, setPreset] = useState<Preset>('last30');
  const [range, setRange] = useState(PRESETS[0].range);
  const [custom, setCustom] = useState(range);
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    api
      .get<ReportOverview>(`/api/reports/overview?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((data) => current && setReport(data))
      .catch((err) => current && setError(errorMessage(err)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [range]);

  const choose = (id: Exclude<Preset, 'custom'>) => {
    setPreset(id);
    setRange(PRESETS.find((p) => p.id === id)!.range());
  };
  const showMonth = (from: string, to: string) => {
    setPreset('custom');
    setCustom({ from, to });
    setRange({ from, to });
    if (tab === 'mood') setTab('reach');
  };
  const customFrom = toLatinDigits(custom.from);
  const customTo = toLatinDigits(custom.to);
  const customValid = isValidJalaliDate(customFrom) && isValidJalaliDate(customTo) && customFrom <= customTo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#fdfbf7] text-[#991b1b] rounded-2xl border border-[#f5f2ed]">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#2d2d2d]">گزارش‌ها</h2>
            <p className="text-sm text-[#6e6a60] mt-1">اثر اطلاع‌رسانی، مشارکت همکاران و حال‌وهوای سازمان</p>
          </div>
        </div>
        {tab !== 'mood' && (
          <button onClick={() => report && exportReport(report)} disabled={!report || loading} className={`${secondaryButtonClass} w-fit`}>
            <Download className="w-4 h-4" /> خروجی اکسل
          </button>
        )}
      </div>

      <MonthlySummaries onShowMonth={showMonth} />

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="بخش‌های گزارش">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold rounded-xl whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-[#dc2626] text-white' : 'bg-white border border-[#E6E0D5] hover:bg-[#F5F2ED] text-[#2D2D2D]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mood' ? (
        <MoodReport />
      ) : (
        <>
          <section aria-label="بازهٔ زمانی گزارش" className="bg-white rounded-2xl p-4 border border-[#e5e5e5] space-y-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="بازهٔ زمانی">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => choose(p.id)}
                  aria-pressed={preset === p.id}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                    preset === p.id ? 'bg-[#2D2D2D] text-white' : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setPreset('custom')}
                aria-pressed={preset === 'custom'}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  preset === 'custom' ? 'bg-[#2D2D2D] text-white' : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
                }`}
              >
                بازهٔ دلخواه
              </button>
              <span className="text-[11px] text-[#6E6A60] mr-auto flex items-center gap-1.5">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                از {formatDate(range.from)} تا {formatDate(range.to)}
              </span>
            </div>
            {preset === 'custom' && (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customValid) setRange({ from: customFrom, to: customTo });
                }}
              >
                <div className="w-40">
                  <label htmlFor="report-from" className={labelClass}>از تاریخ</label>
                  <JalaliDateInput id="report-from" value={custom.from} onChange={(from) => setCustom({ ...custom, from })} />
                </div>
                <div className="w-40">
                  <label htmlFor="report-to" className={labelClass}>تا تاریخ</label>
                  <JalaliDateInput id="report-to" value={custom.to} onChange={(to) => setCustom({ ...custom, to })} />
                </div>
                <button type="submit" disabled={!customValid} className={secondaryButtonClass}>نمایش</button>
              </form>
            )}
          </section>

          {error ? (
            <p role="alert" className="text-sm text-red-700 bg-white rounded-2xl p-4 border border-red-100">{error}</p>
          ) : !report ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 text-red-600 animate-spin" /></div>
          ) : tab === 'reach' ? (
            <>
              <NewsReachReport report={report.news} />
              <IdlePeopleCard people={report.idle} />
            </>
          ) : (
            <ParticipationReport report={report.participation} />
          )}
        </>
      )}
    </div>
  );
};
