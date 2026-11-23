import React, { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, Download, Footprints, Megaphone, Tags, TrendingDown, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { toPersianDigits } from '../../lib/jalali';
import { MOOD_MIN_ANSWERS } from '../../../shared/mood';
import { MOOD_REPORT_RANGES, OTHER_UNITS, type MoodReport, type MoodReportDays } from '../../../shared/moodReport';
import { DayQuestionsReport, type AskedDay } from './DayQuestionsReport';
import { cardClass, Empty, formatPercent, formatRating, SectionTitle, StatTile, td, th } from './reportUi';

const fa = toPersianDigits;
/** '1405/09/02' → '۹/۲' for the chart's axis. */
const shortDay = (date: string) => fa(`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`);
const n = (value: number | null) => (value === null ? '' : String(value));

/** Saves everything the report shows for the range as one CSV that Excel opens, one table under another. */
function exportMood(report: MoodReport, asked: AskedDay[]) {
  const t = report.totals;
  const rows: string[][] = [
    [`حال‌وهوای سازمان از ${report.from} تا ${report.to}`],
    [`روزهای با کمتر از ${MOOD_MIN_ANSWERS} پاسخ شمرده نشده‌اند؛ هیچ عددی دربارهٔ یک همکار نیست.`],
    [],
    ['خلاصه'],
    ['پاسخ‌ها', 'روزهای شمرده‌شده', 'میانگین حال (۱ تا ۵)', 'درصد خوب یا عالی', 'میانگین مشارکت روزانه (درصد)', 'همکاران فعال'],
    [n(t.answers), n(t.countedDays), n(t.average), n(t.good), n(t.participation), n(t.active)],
    [],
    ['روز به روز'],
    ['تاریخ', 'پاسخ', 'میانگین حال', 'درصد خوب یا عالی', 'مشارکت (درصد)'],
    ...report.daily.map((d) => [d.date, n(d.answers), n(d.average), n(d.good), n(d.participation)]),
    [],
    ['هفته به هفته'],
    ['شنبهٔ هفته', 'پاسخ', 'میانگین حال', 'درصد خوب یا عالی'],
    ...report.weekly.map((w) => [w.from, n(w.answers), n(w.average), n(w.good)]),
    [],
    ['به تفکیک واحد'],
    ['واحد', 'همکاران پاسخ‌دهنده', 'پاسخ', 'میانگین حال', 'درصد خوب یا عالی'],
    ...report.units.map((u) => [u.name, n(u.people), n(u.answers), n(u.average), n(u.good)]),
    [],
    ['چه چیزی اثر داشت'],
    ['برچسب', 'در روزهای خوب', 'در روزهای سخت', 'در کل'],
    ...report.reasons.map((r) => [r.label, n(r.good), n(r.hard), n(r.total)]),
    [],
    ['یک قدم برای امروز'],
    ['پیشنهاد', 'نشان داده شد', 'انجام شد', 'درصد انجام', 'امروز نه', 'خاموش شد'],
    ...report.steps.map((s) => [s.label, n(s.shown), n(s.done), n(s.taken), n(s.closed), n(s.muted)]),
    [],
    ['پرسش‌های روز'],
    ['تاریخ', 'پرسش', 'گزینه', 'تعداد'],
    ...asked.flatMap((day) => day.options.map((option, i) => [day.date, day.text, option, n(day.counts[i])])),
  ];
  downloadCsv(`mood-${report.from.replace(/\//g, '-')}-${report.to.replace(/\//g, '-')}.csv`, rows);
}

/**
 * The managers' mood report beyond the counts: the trend, how many take part, the units, what affected
 * the days, what became of the day's steps and the answers to the daily questions. Totals only: a day
 * with too few answers is not counted, and a unit is named only when enough different colleagues of
 * it answered.
 */
export const MoodInsights: React.FC = () => {
  const { can, setActiveTab } = usePortal();
  const [days, setDays] = useState<MoodReportDays>(30);
  const [report, setReport] = useState<MoodReport | null>(null);
  const [asked, setAsked] = useState<AskedDay[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    let gone = false;
    setLoadError(null);
    Promise.all([api.get<MoodReport>(`/api/moods/report?days=${days}`), api.get<AskedDay[]>(`/api/moods/questions/results?days=${days}`)])
      .then(([r, q]) => {
        if (gone) return;
        setReport(r);
        setAsked(q);
      })
      .catch((err) => !gone && setLoadError(errorMessage(err)));
    return () => {
      gone = true;
    };
  }, [days]);

  const heard = async () => {
    setDrafting(true);
    try {
      await api.post<{ draftId: string }>('/api/moods/report/heard', { days });
      toast.success((t) => (
        <span>
          پیش‌نویس خبر «شنیدیم» ساخته شد.{' '}
          <button
            type="button"
            className="underline font-bold"
            onClick={() => {
              toast.dismiss(t.id);
              setActiveTab('news');
            }}
          >
            رفتن به اخبار
          </button>
        </span>
      ));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDrafting(false);
    }
  };

  const shown = report && report.days === days ? report : null;
  const weekly = days > 90;
  const points = shown ? (weekly ? shown.weekly.map((w) => ({ label: shortDay(w.from), average: w.average, participation: null as number | null })) : shown.daily.map((d) => ({ label: shortDay(d.date), average: d.average, participation: d.participation }))) : [];
  const t = shown?.totals;

  return (
    <div className="space-y-6" data-testid="mood-insights">
      <section aria-labelledby="mood-trend-title" className={cardClass}>
        <SectionTitle
          id="mood-trend-title"
          icon={<TrendingUp className="w-5 h-5" />}
          title="روند حال‌وهوا"
          hint={`فقط جمع پاسخ‌ها؛ روزهای با کمتر از ${fa(MOOD_MIN_ANSWERS)} پاسخ شمرده نمی‌شوند.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-surface rounded-xl p-1 border border-line w-fit" role="group" aria-label="بازهٔ روند">
                {MOOD_REPORT_RANGES.map((r) => (
                  <button
                    key={r.days}
                    type="button"
                    onClick={() => setDays(r.days)}
                    aria-pressed={days === r.days}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${days === r.days ? 'bg-white text-brand shadow-sm' : 'text-faint hover:text-ink'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!shown || shown.totals.countedDays === 0}
                onClick={() => shown && exportMood(shown, asked)}
                className="px-3 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" /> خروجی Excel
              </button>
              {can('news.manage') && (
                <button
                  type="button"
                  disabled={!shown || shown.totals.answers === 0 || drafting}
                  onClick={() => void heard()}
                  title="یک پیش‌نویس خبر از همین عددها ساخته می‌شود تا بنویسید چه کاری انجام شد."
                  className="px-3 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Megaphone className="w-3.5 h-3.5" /> پیش‌نویس خبر «شنیدیم»
                </button>
              )}
            </div>
          }
        />

        {loadError ? (
          <p role="alert" className="text-xs text-danger-700">{loadError}</p>
        ) : !shown || !t ? (
          <div className="h-48" aria-hidden />
        ) : t.countedDays === 0 ? (
          <Empty>در این بازه روزی با دست‌کم {fa(MOOD_MIN_ANSWERS)} پاسخ نبوده است.</Empty>
        ) : (
          <>
            {shown.falling && (
              <p role="status" className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs leading-relaxed text-amber-950 flex items-start gap-2" data-testid="mood-falling">
                <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  میانگین حال سه روز پشت هم پایین آمده است: از {formatRating(shown.falling[0].average)} در {fa(shown.falling[0].date)} به{' '}
                  {formatRating(shown.falling[shown.falling.length - 1].average)} در {fa(shown.falling[shown.falling.length - 1].date)}. این فقط یک علامت است؛ دلیل‌ها را در «چه چیزی اثر داشت»
                  ببینید.
                </span>
              </p>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatTile label="میانگین حال" value={formatRating(t.average)} note="۱ «خیلی بد» تا ۵ «عالی»" />
              <StatTile label="خوب یا عالی" value={formatPercent(t.good)} note={`از ${fa(t.answers)} پاسخ`} />
              <StatTile label="مشارکت روزانه" value={formatPercent(t.participation)} note={`میانگین، از ${fa(t.active)} همکار فعال`} />
              <StatTile label="روزهای شمرده‌شده" value={`${fa(t.countedDays)} روز`} note={`با دست‌کم ${fa(MOOD_MIN_ANSWERS)} پاسخ`} />
              <StatTile
                label="هنوز پاسخ می‌دهند"
                value={shown.stillAnswering ? formatPercent(shown.stillAnswering.share) : '—'}
                note={shown.stillAnswering ? `از ${fa(shown.stillAnswering.then)} همکارِ چهار هفته پیش` : 'هنوز برای مقایسه زود است'}
              />
            </div>
            <div className="h-64 w-full" dir="ltr" data-testid="mood-trend">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#62656d' }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis yAxisId="mood" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#62656d' }} axisLine={false} tickLine={false} tickFormatter={(v) => fa(v)} />
                  {!weekly && <YAxis yAxisId="share" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9a9da5' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${fa(v)}٪`} />}
                  <Tooltip
                    formatter={(value, name) => (name === 'average' ? [formatRating(Number(value)), 'میانگین حال'] : [`${fa(String(value))}٪`, 'مشارکت'])}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5', fontSize: '12px', textAlign: 'right' }}
                  />
                  <Line yAxisId="mood" type="monotone" dataKey="average" stroke="#b91c1c" strokeWidth={2.5} dot={points.length <= 31} isAnimationActive={false} />
                  {!weekly && <Line yAxisId="share" type="monotone" dataKey="participation" stroke="#9a9da5" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-faint">
              خط پررنگ: میانگین حال {weekly ? 'هر هفته' : 'هر روز'}.{!weekly && ' خط‌چین: درصد همکارانی که آن روز پاسخ دادند.'}
            </p>
          </>
        )}
      </section>

      {shown && shown.totals.countedDays > 0 && (
        <>
          <section aria-labelledby="mood-units-title" className={cardClass} data-testid="mood-units">
            <SectionTitle id="mood-units-title" icon={<Building2 className="w-5 h-5" />} title="به تفکیک واحد" hint={`واحدی نام برده می‌شود که دست‌کم ${fa(MOOD_MIN_ANSWERS)} همکارِ آن پاسخ داده باشند؛ بقیه با هم «${OTHER_UNITS}» هستند.`} />
            {shown.units.length === 0 ? (
              <Empty>در این بازه واحدی با دست‌کم {fa(MOOD_MIN_ANSWERS)} همکار پاسخ‌دهنده نبوده است.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted border-b border-line">
                    <tr>
                      <th className={th}>واحد</th>
                      <th className={th}>همکاران پاسخ‌دهنده</th>
                      <th className={th}>پاسخ</th>
                      <th className={th}>میانگین حال</th>
                      <th className={th}>خوب یا عالی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.units.map((u) => (
                      <tr key={u.name} className="border-b border-line/60 last:border-0">
                        <td className={`${td} font-bold text-ink`}>{u.name}</td>
                        <td className={td}>{fa(u.people)}</td>
                        <td className={td}>{fa(u.answers)}</td>
                        <td className={td}>
                          <div className="flex items-center gap-2 min-w-[8rem]">
                            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden" aria-hidden>
                              <div className="h-full bg-brand-strong rounded-full" style={{ width: `${((u.average - 1) / 4) * 100}%` }} />
                            </div>
                            <span className="whitespace-nowrap text-muted">{formatRating(u.average)}</span>
                          </div>
                        </td>
                        <td className={td}>{formatPercent(u.good)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="mood-reasons-title" className={cardClass} data-testid="mood-reasons-report">
            <SectionTitle id="mood-reasons-title" icon={<Tags className="w-5 h-5" />} title="چه چیزی اثر داشت" hint="برچسب‌هایی که همکاران کنار حال روزشان انتخاب کرده‌اند (اختیاری است)." />
            {shown.reasons.length === 0 ? (
              <Empty>هنوز همکاران کافی برچسبی انتخاب نکرده‌اند.</Empty>
            ) : (
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
                {shown.reasons.map((r) => {
                  const most = Math.max(1, ...shown.reasons.map((x) => Math.max(x.good, x.hard)));
                  return (
                    <li key={r.id} className="text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink">{r.label}</span>
                        <span className="text-faint">{fa(r.total)} بار</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-muted shrink-0">روزهای خوب</span>
                        <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden" aria-hidden>
                          <div className="h-full bg-green-600/70 rounded-full" style={{ width: `${(r.good / most) * 100}%` }} />
                        </div>
                        <span className="w-6 text-left tabular-nums text-muted">{fa(r.good)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-muted shrink-0">روزهای سخت</span>
                        <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden" aria-hidden>
                          <div className="h-full bg-brand/70 rounded-full" style={{ width: `${(r.hard / most) * 100}%` }} />
                        </div>
                        <span className="w-6 text-left tabular-nums text-muted">{fa(r.hard)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {shown && shown.steps.length > 0 && (
        <section aria-labelledby="mood-steps-title" className={cardClass} data-testid="mood-steps">
          <SectionTitle id="mood-steps-title" icon={<Footprints className="w-5 h-5" />} title="یک قدم برای امروز" hint="هر پیشنهاد چند بار نشان داده شد و چه شد. فقط شمارش است و به هیچ همکاری برنمی‌گردد." />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted border-b border-line">
                <tr>
                  <th className={th}>پیشنهاد</th>
                  <th className={th}>نشان داده شد</th>
                  <th className={th}>انجام شد</th>
                  <th className={th}>امروز نه</th>
                  <th className={th}>خاموش شد</th>
                </tr>
              </thead>
              <tbody>
                {shown.steps.map((s) => (
                  <tr key={s.kind} className="border-b border-line/60 last:border-0">
                    <td className={`${td} font-bold text-ink`}>{s.label}</td>
                    <td className={td}>{fa(s.shown)}</td>
                    <td className={td}>
                      {fa(s.done)} <span className="text-faint">({fa(s.taken)}٪)</span>
                    </td>
                    <td className={td}>{fa(s.closed)}</td>
                    <td className={td}>{fa(s.muted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DayQuestionsReport days={asked} range={MOOD_REPORT_RANGES.find((r) => r.days === days)!.label} />
    </div>
  );
};
