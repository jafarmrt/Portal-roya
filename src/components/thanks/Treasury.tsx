import React, { useEffect, useState } from 'react';
import { Eye, Gem, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import type { BadgeTier, RecognitionBadge } from '../../../shared/recognitionTutorial';
import { api, errorMessage } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { SkeletonRows } from '../common/Placeholder';
import { CoinFace } from './Coin';
import type { EffectsLevel } from './effects';
import { RecapDialog, monthTitle, type Recap } from './Recap';
import { toneClass } from './ThanksCardFace';
import { saveTutorial } from './tour/tourStore';
import { celebrate } from './tour/TourBox';
import { monthName } from './ThanksCard';
import { BadgeMedal, TIER_NAMES } from './Badge';

// «گنجینهٔ من» (phase 2, 2.4) with the badges (2.5): what the colleague received, ever and month by
// month, the values they were thanked for, their past recaps, and their badges. Theirs alone.

const fa = toPersianDigits;

export interface Badge {
  key: RecognitionBadge;
  name: string;
  about: string;
  unit: string;
  tier: BadgeTier;
  count: number;
  next: { tier: number; at: number } | null;
  fresh: boolean;
}

interface TreasuryData {
  total: { coins: number; people: number; units: number };
  months: { month: string; received: number; given: number }[];
  values: { label: string; tone: string; count: number }[];
  recaps: string[];
  badges: Badge[];
  onProfile: boolean;
}

/** What a badge still needs: «۲ همکار دیگر تا نقره‌ای». */
const nextLine = (b: Badge) =>
  b.next
    ? b.key === 'values'
      ? `${fa(b.count)} از ${fa(b.next.at)} ارزش`
      : `${fa(Math.max(0, b.next.at - b.count))} ${b.unit} دیگر تا ${TIER_NAMES[b.next.tier]}`
    : 'بالاترین درجه';

export const Treasury: React.FC<{ fx: EffectsLevel }> = ({ fx }) => {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [fresh, setFresh] = useState<Badge[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .get<TreasuryData>('/api/recognitions/treasury')
      .then((d) => {
        if (!alive) return;
        setData(d);
        // A badge earned since last time: said once, with a small celebration.
        const newOnes = d.badges.filter((b) => b.fresh && b.tier > 0);
        if (newOnes.length > 0) {
          setFresh(newOnes);
          celebrate(fx);
          saveTutorial({ badgesSeen: Object.fromEntries(newOnes.map((b) => [b.key, b.tier])) });
        }
      })
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit to the tab
  }, []);

  if (!data) return <SkeletonRows rows={3} tall />;
  const tallest = Math.max(1, ...data.months.map((m) => Math.max(m.received, m.given)));

  const openRecap = (month: string) =>
    api
      .get<{ recap: Recap | null }>(`/api/recognitions/recap?month=${encodeURIComponent(month)}`)
      .then(({ recap: r }) => r && setRecap(r))
      .catch((err) => toast.error(errorMessage(err)));

  const toggleProfile = (on: boolean) => {
    setData({ ...data, onProfile: on });
    saveTutorial({ badgesOnProfile: on });
    toast.success(on ? 'نشان‌هایتان در پروفایلتان دیده می‌شود.' : 'نشان‌هایتان دیگر در پروفایلتان دیده نمی‌شود.');
  };

  return (
    <div className="space-y-4" data-fx={fx}>
      <p className="text-xs text-faint flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> این صفحه را فقط خودتان می‌بینید.
      </p>

      {fresh.length > 0 && (
        <div className="p-4 rounded-3xl bg-gold-soft border border-gold/60 flex items-center gap-3" role="status">
          <BadgeMedal tier={fresh[0].tier} size={48} />
          <p className="text-sm text-ink">
            <strong>نشان تازه:</strong> {fresh.map((b) => `«${b.name}» ${TIER_NAMES[b.tier]}`).join('، ')}
          </p>
        </div>
      )}

      <section className="bg-white border border-line/70 shadow-card rounded-3xl p-5 space-y-4" aria-labelledby="sp-treasury-total">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 shrink-0">
            <CoinFace />
          </span>
          <div>
            <h2 id="sp-treasury-total" className="font-display text-3xl text-ink leading-none">
              {fa(data.total.coins)} سکه
            </h2>
            <p className="text-xs text-muted mt-1">
              {data.total.coins > 0 ? `از ${fa(data.total.people)} همکار در ${fa(data.total.units)} واحد؛ مال خودتان است و هیچ‌وقت کم نمی‌شود.` : 'هنوز سکه‌ای نگرفته‌اید؛ اولین قدردانی‌ها همین‌جا جمع می‌شوند.'}
            </p>
          </div>
        </div>

        {/* A column of coins for each month, as high as what really came in; what was given beside it. */}
        <div className="sp-columns" role="img" aria-label="سکه‌های گرفته و بخشیده در دوازده ماه گذشته">
          {data.months.map((m) => (
            <div key={m.month} className="sp-column" title={`${monthTitle(m.month)}: ${fa(m.received)} سکه گرفتید، ${fa(m.given)} سکه بخشیدید`}>
              <div className="sp-column-bars">
                <span className="sp-column-got" style={{ '--h': `${(m.received / tallest) * 100}%` } as React.CSSProperties} />
                <span className="sp-column-gave" style={{ '--h': `${(m.given / tallest) * 100}%` } as React.CSSProperties} />
              </div>
              <span className="sp-column-label">{monthName(m.month)}</span>
            </div>
          ))}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gold" /> گرفته‌ها
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border-2 border-gold/70" /> بخشیده‌ها
          </span>
        </p>
        <table className="sr-only">
          <caption>سکه‌ها در دوازده ماه گذشته</caption>
          <thead>
            <tr>
              <th>ماه</th>
              <th>گرفته</th>
              <th>بخشیده</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month}>
                <td>{monthTitle(m.month)}</td>
                <td>{fa(m.received)}</td>
                <td>{fa(m.given)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.values.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-muted">برای این ارزش‌ها از شما تشکر شده است</h3>
            <ul className="flex flex-wrap gap-2">
              {data.values.map((v) => (
                <li key={v.label} className={`sp-value ${toneClass(v.tone)} px-3 py-1 rounded-full text-xs font-bold`} aria-pressed="true">
                  {v.label} · {fa(v.count)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white border border-line/70 shadow-card rounded-3xl p-5 space-y-4" aria-labelledby="sp-badges-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sp-badges-title" className="text-sm font-black text-ink flex items-center gap-2">
            <Gem className="w-4 h-4 text-brand" /> نشان‌ها
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={data.onProfile} onChange={(e) => toggleProfile(e.target.checked)} className="accent-red-600" />
            <Eye className="w-3.5 h-3.5" /> در پروفایلم نشان بده
          </label>
        </div>
        <p className="text-xs text-muted">نشان‌ها بیشتر برای قدردانی کردن است، نه گرفتن. جدول و رتبه‌ای در کار نیست.</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.badges.map((b) => (
            <li key={b.key} className={`flex items-center gap-3 p-3 rounded-2xl border ${b.tier > 0 ? 'border-gold/50 bg-gold-soft/40' : 'border-line bg-surface/50'}`}>
              <BadgeMedal tier={b.tier} />
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">
                  {b.name}
                  {b.tier > 0 && <span className="ms-1.5 text-xs font-bold text-muted">{b.key === 'values' ? '' : TIER_NAMES[b.tier]}</span>}
                </p>
                <p className="text-xs text-muted">{b.about}</p>
                <p className="text-xs text-faint mt-0.5">{nextLine(b)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {data.recaps.length > 0 && (
        <section className="bg-white border border-line/70 shadow-card rounded-3xl p-5 space-y-3" aria-labelledby="sp-recaps-title">
          <h2 id="sp-recaps-title" className="text-sm font-black text-ink">
            کارنامه‌های ماه
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.recaps.map((month) => (
              <li key={month}>
                <button type="button" onClick={() => void openRecap(month)} className="px-3 py-1.5 rounded-xl border border-line-strong bg-white hover:bg-surface text-xs font-bold text-ink">
                  {monthTitle(month)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recap && <RecapDialog recap={recap} fx={fx} onClose={() => setRecap(null)} />}
    </div>
  );
};
