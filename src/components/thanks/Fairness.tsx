import React, { useEffect, useState } from 'react';
import { Check, Download, Flag, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { toPersianDigits } from '../../lib/jalali';
import { EmptyState, SkeletonRows } from '../common/Placeholder';

// «انصاف» in «برنامهٔ سپاس» (phase 2, 2.6): for the programme's owner alone. Unlike «گزارش ماه» it has
// names, so it is never shown to unit heads; it has no one's coins and no private message's text.

const fa = toPersianDigits;

interface Fairness {
  days: number;
  people: number;
  unrecognised: { id: string; name: string; department: string; position: string }[];
  betweenUnits: { from: string; to: string; recognitions: number }[];
  recognitions: number;
  upwardShare: number;
  flags: {
    reciprocal: { key: string; seen: boolean; people: { name: string; department: string }[] }[];
    repeated: { key: string; seen: boolean; person: { name: string; department: string }; monthLabel: string; people: number }[];
  };
}

function exportCsv(f: Fairness) {
  downloadCsv('sepas-fairness.csv', [
    [`همکارانی که در ${f.days} روز گذشته قدردانی‌ای نگرفته‌اند`],
    ['نام', 'واحد', 'سمت'],
    ...f.unrecognised.map((p) => [p.name, p.department, p.position]),
    [],
    ['از واحد', 'به واحد', 'قدردانی‌ها'],
    ...f.betweenUnits.map((b) => [b.from, b.to, String(b.recognitions)]),
    [],
    ['سهم قدردانی‌ها به رئیس واحد خود', `${f.upwardShare}%`],
  ]);
}

export const FairnessSection: React.FC = () => {
  const [data, setData] = useState<Fairness | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Fairness>('/api/recognitions/fairness')
      .then((d) => alive && setData(d))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, []);

  const markSeen = async (key: string) => {
    setBusy(key);
    try {
      setData(await api.post<Fairness>('/api/recognitions/fairness/seen', { key }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <SkeletonRows rows={3} tall />;
  const flags = data.flags.reciprocal.length + data.flags.repeated.length;
  const card = 'bg-white border border-line/70 shadow-card rounded-3xl p-5 space-y-3';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-muted leading-relaxed max-w-2xl flex gap-1.5">
          <Info className="w-4 h-4 shrink-0 text-faint" />
          <span>
            این بخش برای دیدن کار دیده‌نشده است، نه برای قضاوت کسی. فقط شما آن را می‌بینید، نه مدیران واحدها. عدد سکهٔ هیچ‌کس و متن هیچ قدردانی خصوصی‌ای اینجا نیست. همهٔ عددها مربوط به{' '}
            {fa(data.days)} روز گذشته است.
          </span>
        </p>
        <button type="button" onClick={() => exportCsv(data)} className="px-3 py-2 rounded-xl border border-line-strong bg-white hover:bg-surface text-xs font-bold text-ink flex items-center gap-1.5">
          <Download className="w-4 h-4" /> خروجی Excel
        </button>
      </div>

      <section className={card} aria-labelledby="sp-fair-unseen">
        <h2 id="sp-fair-unseen" className="text-sm font-black text-ink">
          سه ماه بدون قدردانی
        </h2>
        <p className="text-xs text-muted">
          همکارانی که «سپاس» را دست‌کم سه ماه است می‌بینند و در این مدت قدردانی‌ای نگرفته‌اند ({fa(data.unrecognised.length)} از {fa(data.people)} نفر). شاید کارشان دیده نشده؛
          شاید هم کارشان کمتر به چشم دیگران می‌آید.
        </p>
        {data.unrecognised.length === 0 ? (
          <p className="text-xs text-emerald-800 font-bold">کسی نیست؛ همه در این سه ماه دست‌کم یک قدردانی گرفته‌اند.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.unrecognised.map((p) => (
              <li key={p.id} className="px-3 py-2 rounded-2xl bg-surface/60 border border-line text-xs">
                <span className="block font-bold text-ink">{p.name}</span>
                <span className="text-muted">
                  {p.department}
                  {p.position ? ` · ${p.position}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="sp-fair-units">
        <h2 id="sp-fair-units" className="text-sm font-black text-ink">
          قدردانی میان واحدها
        </h2>
        <p className="text-xs text-muted">
          از {fa(data.recognitions)} قدردانی، {fa(data.upwardShare)}٪ به رئیس واحد خود فرستنده رسیده است (قدردانی «رو به بالا»). رئیس هر واحد همانی است که در صفحهٔ «واحدها» ثبت شده.
        </p>
        {data.betweenUnits.length === 0 ? (
          <p className="text-xs text-faint">هنوز قدردانی‌ای نیست.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="text-right font-bold py-1.5">از واحد</th>
                  <th className="text-right font-bold py-1.5">به واحد</th>
                  <th className="text-left font-bold py-1.5">قدردانی‌ها</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.betweenUnits.map((b) => (
                  <tr key={`${b.from}-${b.to}`}>
                    <td className="py-1.5 text-ink">{b.from}</td>
                    <td className="py-1.5 text-ink">{b.from === b.to ? <span className="text-muted">همان واحد</span> : b.to}</td>
                    <td className="py-1.5 text-left tabular-nums">{fa(b.recognitions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="sp-fair-flags">
        <h2 id="sp-fair-flags" className="text-sm font-black text-ink flex items-center gap-2">
          <Flag className="w-4 h-4 text-amber-700" /> علامت‌ها
        </h2>
        <p className="text-xs text-muted">علامت هیچ کاری خودبه‌خود نمی‌کند؛ فقط می‌گوید ارزش یک نگاه دارد. بعد از نگاه، «دیدم» بزنید.</p>
        {flags === 0 ? (
          <EmptyState icon={<Check />} title="علامتی نیست" hint="نه تبادل دوطرفهٔ پیاپی، نه متن تکراری." />
        ) : (
          <ul className="space-y-2">
            {data.flags.reciprocal.map((r) => (
              <li key={r.key} className={`flex flex-wrap items-center gap-2 p-3 rounded-2xl border ${r.seen ? 'border-line bg-surface/50 text-muted' : 'border-amber-200 bg-amber-50'}`}>
                <span className="flex-1 min-w-0 text-xs">
                  <strong>{r.people.map((p) => `${p.name} (${p.department})`).join(' و ')}</strong> سه ماه پشت هم بیشتر سکه‌هایشان را به یکدیگر داده‌اند.
                </span>
                {r.seen ? (
                  <span className="text-xs font-bold">دیده شد</span>
                ) : (
                  <button type="button" disabled={busy === r.key} onClick={() => void markSeen(r.key)} className="px-3 py-1.5 rounded-xl bg-white border border-line-strong text-xs font-bold">
                    دیدم
                  </button>
                )}
              </li>
            ))}
            {data.flags.repeated.map((r) => (
              <li key={r.key} className={`flex flex-wrap items-center gap-2 p-3 rounded-2xl border ${r.seen ? 'border-line bg-surface/50 text-muted' : 'border-amber-200 bg-amber-50'}`}>
                <span className="flex-1 min-w-0 text-xs">
                  <strong>
                    {r.person.name} ({r.person.department})
                  </strong>{' '}
                  در {r.monthLabel} یک متن را برای {fa(r.people)} همکار فرستاده است.
                </span>
                {r.seen ? (
                  <span className="text-xs font-bold">دیده شد</span>
                ) : (
                  <button type="button" disabled={busy === r.key} onClick={() => void markSeen(r.key)} className="px-3 py-1.5 rounded-xl bg-white border border-line-strong text-xs font-bold">
                    دیدم
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
