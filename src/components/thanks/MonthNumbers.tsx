import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, BarChart3, Download, Flame, Flag, HandHeart, Users } from 'lucide-react';
import type { RecognitionTone } from '../../../shared/recognition';
import { downloadCsv } from '../../lib/download';
import { toPersianDigits } from '../../lib/jalali';
import { SkeletonRows } from '../common/Placeholder';
import { secondaryButtonClass } from '../common/Modal';
import { toneClass } from './ThanksCardFace';
import { loadMonthReport, type MonthReport } from './ownerStore';

const fa = toPersianDigits;
const pct = (n: number) => `${fa(n)}٪`;

const Tile: React.FC<{ icon: React.ReactNode; label: string; value: string; hint: string }> = ({ icon, label, value, hint }) => (
  <div className="bg-white border border-line rounded-2xl p-4 space-y-1">
    <p className="text-xs font-bold text-muted flex items-center gap-1.5">
      {icon}
      {label}
    </p>
    <p className="text-2xl font-black text-ink tabular-nums">{value}</p>
    <p className="text-xs text-faint leading-relaxed">{hint}</p>
  </div>
);

/** A share as a bar; the number beside it is what is read. */
const Bar: React.FC<{ value: number; tone?: string; label: string }> = ({ value, tone, label }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="flex-1 h-2.5 rounded-full bg-surface overflow-hidden" role="img" aria-label={label}>
      <div className={`h-full rounded-full ${tone ? `sp-swatch ${tone}` : 'bg-brand'}`} style={{ width: `${Math.min(100, Math.max(value > 0 ? 3 : 0, value))}%` }} />
    </div>
    <span className="w-10 text-xs font-bold text-ink-soft tabular-nums text-left">{pct(value)}</span>
  </div>
);

function download(r: MonthReport) {
  const rows: string[][] = [
    ['گزارش «سپاس»', r.monthLabel],
    [],
    ['همکارانی که «سپاس» را می‌بینند', String(r.people)],
    ['همکارانی که قدردانی کردند', String(r.givers), `${r.giversShare}%`],
    ['همکارانی که قدردانی دریافت کردند', String(r.receivers), `${r.receiversShare}%`],
    ['قدردانی‌ها', String(r.recognitions)],
    ['«من هم»', String(r.joins)],
    ['قدردانی‌های میان دو واحد', String(r.acrossUnits)],
    ['سهم قدردانی‌های «برای همه»', `${r.publicShare}%`],
    ['سهمیهٔ همهٔ همکاران (سکه)', String(r.coins.allowance)],
    ['سکه‌های بخشیده‌شده', String(r.coins.given)],
    [r.current ? 'سکه‌های هنوز نبخشیده' : 'سکه‌های سوخته', String(r.coins.unspent)],
    ['گزارش‌شده', String(r.reported)],
    ['برگردانده‌شده', String(r.reversed)],
    [],
    ['واحد', 'همکاران', 'قدردانی کردند', 'درصد', 'قدردانی دریافت کردند', 'درصد', 'قدردانی‌های نوشته‌شده'],
    ...r.departments.map((d) => [d.name, String(d.people), String(d.givers), `${d.giversShare}%`, String(d.receivers), `${d.receiversShare}%`, String(d.recognitions)]),
    [],
    ['ارزش', 'قدردانی‌ها'],
    ...r.values.map((v) => [v.label, String(v.count)]),
  ];
  downloadCsv(`sepas-${r.month.replace('/', '-')}.csv`, rows);
}

/**
 * «گزارش ماه»: how «سپاس» went in a month, for its owner. Counts by unit and by value; no names and no
 * ranking of anyone, so nobody is measured by it.
 */
export const MonthNumbers: React.FC = () => {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<MonthReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void loadMonthReport(month).then((r) => {
      if (!live) return;
      setReport(r);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [month]);

  if (!report) return loading ? <SkeletonRows rows={3} tall /> : null;
  const r = report;
  const maxValue = Math.max(1, ...r.values.map((v) => v.count));
  return (
    <section className={`space-y-5 ${loading ? 'opacity-60' : ''}`} aria-label="گزارش ماه">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-muted">
          ماه
          <select value={r.month} onChange={(e) => setMonth(e.target.value)} className="py-1.5 ps-2 pe-7 rounded-xl border border-line-strong bg-white text-xs font-bold text-ink">
            {r.months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </select>
          {r.current && <span className="font-normal text-faint">(ماه جاری، هنوز تمام نشده)</span>}
        </label>
        <button type="button" onClick={() => download(r)} className={secondaryButtonClass}>
          <Download className="w-3.5 h-3.5" /> خروجی Excel
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={<HandHeart className="w-3.5 h-3.5" />} label="قدردانی کردند" value={pct(r.giversShare)} hint={`${fa(r.givers)} نفر از ${fa(r.people)} همکاری که «سپاس» را می‌بینند`} />
        <Tile icon={<Users className="w-3.5 h-3.5" />} label="قدردانی دریافت کردند" value={pct(r.receiversShare)} hint={`${fa(r.receivers)} نفر`} />
        <Tile
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          label="قدردانی‌ها"
          value={fa(r.recognitions)}
          hint={`${fa(r.joins)} «من هم»، ${pct(r.publicShare)} برای همه`}
        />
        <Tile icon={<ArrowLeftRight className="w-3.5 h-3.5" />} label="میان دو واحد" value={fa(r.acrossUnits)} hint="قدردانی‌هایی که از یک واحد به واحد دیگر رفت" />
      </div>

      <div className="bg-white border border-line rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-muted flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5" /> سکه‌ها
        </p>
        <Bar value={r.coins.allowance ? Math.round((r.coins.given / r.coins.allowance) * 100) : 0} label="سهم سکه‌های بخشیده‌شده" tone="sp-tone-gold" />
        <p className="text-xs text-muted leading-relaxed">
          از {fa(r.coins.allowance)} سکهٔ سهمیهٔ همه، {fa(r.coins.given)} سکه بخشیده شد و {fa(r.coins.unspent)} سکه {r.current ? 'هنوز مانده است' : 'سوخت'}.
          {r.reported > 0 && ` ${fa(r.reported)} قدردانی گزارش شد${r.reversed > 0 ? ` و ${fa(r.reversed)} برگردانده شد` : ''}.`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-3 bg-white border border-line rounded-2xl p-4 overflow-x-auto">
          <h3 className="text-sm font-black text-ink mb-3">واحدها</h3>
          {r.departments.length === 0 ? (
            <p className="text-xs text-faint">هنوز همکاری «سپاس» را نمی‌بیند.</p>
          ) : (
            <table className="w-full text-xs min-w-[28rem]">
              <thead>
                <tr className="text-muted text-right">
                  <th className="font-bold pb-2">واحد</th>
                  <th className="font-bold pb-2 w-14">همکاران</th>
                  <th className="font-bold pb-2 w-36">قدردانی کردند</th>
                  <th className="font-bold pb-2 w-36">دریافت کردند</th>
                </tr>
              </thead>
              <tbody>
                {r.departments.map((d) => (
                  <tr key={d.name} className="border-t border-line">
                    <th scope="row" className="py-2 font-bold text-ink text-right">
                      {d.name}
                    </th>
                    <td className="py-2 tabular-nums">{fa(d.people)}</td>
                    <td className="py-2 pe-3">
                      <Bar value={d.giversShare} label={`${d.name}: قدردانی کردند`} />
                    </td>
                    <td className="py-2">
                      <Bar value={d.receiversShare} label={`${d.name}: دریافت کردند`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="lg:col-span-2 bg-white border border-line rounded-2xl p-4">
          <h3 className="text-sm font-black text-ink mb-3">ارزش‌ها</h3>
          {r.values.length === 0 ? (
            <p className="text-xs text-faint">این ماه هنوز قدردانی‌ای نوشته نشده است.</p>
          ) : (
            <ul className="space-y-2.5">
              {r.values.map((v) => (
                <li key={v.id} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-xs">
                  <span className={`sp-value sp-value-sample ${toneClass(v.tone as RecognitionTone)} px-2.5 py-1 rounded-full font-bold text-center truncate`}>{v.label}</span>
                  <div className="h-2.5 rounded-full bg-surface overflow-hidden" role="img" aria-label={`${v.label}: ${fa(v.count)}`}>
                    <div className={`h-full rounded-full sp-swatch ${toneClass(v.tone as RecognitionTone)}`} style={{ width: `${(v.count / maxValue) * 100}%` }} />
                  </div>
                  <span className="font-bold tabular-nums text-left">{fa(v.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs text-faint leading-relaxed flex items-start gap-1.5">
        <Flag className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        این گزارش فقط شمارش است: نه نام کسی را نشان می‌دهد، نه اینکه هر نفر چقدر داده یا گرفته است، و هیچ رتبه‌بندی‌ای ندارد. «همکاران» یعنی کسانی که امروز «سپاس» را می‌بینند و
        تا پایان آن ماه در پرتال بوده‌اند.
      </p>
    </section>
  );
};
