import React, { useMemo, useState } from 'react';
import { Building2, FileCheck2, Newspaper, Tags, ThumbsDown, ThumbsUp, UserX } from 'lucide-react';
import { IDLE_DAYS, type IdlePerson, type NewsReport, type NewsReportItem, percentOf, rankItems, RANK_MIN_AGE_DAYS } from '../../../shared/reports';
import { usePortal } from '../../context/PortalContext';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import { cardClass, Empty, formatMinutes, formatPercent, SectionTitle, ShareBar, StatTile, td, th } from './reportUi';

const ITEMS_SHOWN = 15;

/** و۱: how far the announcements of the chosen range reached, by department and category. */
export const NewsReachReport: React.FC<{ report: NewsReport }> = ({ report }) => {
  const { setActiveTab } = usePortal();
  const [showAll, setShowAll] = useState(false);
  const { totals } = report;
  const ranked = useMemo(() => rankItems(report.items), [report.items]);

  if (report.items.length === 0) {
    return (
      <section className={cardClass}>
        <Empty>در این بازه اطلاعیه‌ای منتشر نشده است.</Empty>
      </section>
    );
  }

  const openItem = (item: NewsReportItem) => setActiveTab('news', item.id);
  const items = showAll ? report.items : report.items.slice(0, ITEMS_SHOWN);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="اطلاعیه‌های منتشرشده" value={toPersianDigits(totals.items)} />
        <StatTile
          label="خوانده‌شدن"
          value={formatPercent(percentOf(totals.read, totals.audience))}
          note={`${toPersianDigits(totals.read)} از ${toPersianDigits(totals.audience)} مخاطب باز کردند`}
        />
        <StatTile
          label="میانگین زمان تا خواندن"
          value={formatMinutes(totals.avgReadMinutes)}
          note={totals.medianReadMinutes !== null ? `نیمی از خواندن‌ها در کمتر از ${formatMinutes(totals.medianReadMinutes)}` : undefined}
        />
        <StatTile
          label="تأیید بخشنامه‌ها"
          value={formatPercent(percentOf(totals.acknowledged, totals.ackAudience))}
          note={totals.ackAudience > 0 ? `${toPersianDigits(totals.acknowledged)} تأیید از ${toPersianDigits(totals.ackAudience)}` : 'بخشنامه‌ای در این بازه نبود'}
        />
      </div>

      <section aria-labelledby="reach-departments" className={cardClass}>
        <SectionTitle
          id="reach-departments"
          icon={<Building2 className="w-5 h-5" />}
          title="به تفکیک واحد"
          hint="هر بار که اطلاعیه‌ای به یکی از همکاران واحد رسیده، یک مخاطب شمرده شده است"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#8C867A] border-b border-[#E6E0D5]">
                <th className={th}>واحد</th>
                <th className={`${th} w-2/5`}>خوانده‌شدن</th>
                <th className={th}>میانگین زمان تا خواندن</th>
                <th className={th}>تأیید بخشنامه</th>
              </tr>
            </thead>
            <tbody>
              {report.departments.map((d) => (
                <tr key={d.name} className="border-b border-[#F5F2ED] last:border-0">
                  <td className={`${td} font-bold text-[#2D2D2D] whitespace-nowrap`}>{d.name}</td>
                  <td className={td}><ShareBar part={d.read} total={d.audience} label={`خوانده‌شدن در ${d.name}`} /></td>
                  <td className={`${td} whitespace-nowrap text-[#6E6A60]`}>{formatMinutes(d.avgReadMinutes)}</td>
                  <td className={`${td} whitespace-nowrap text-[#6E6A60]`}>
                    {d.ackAudience > 0 ? `${formatPercent(percentOf(d.acknowledged, d.ackAudience))} (${toPersianDigits(d.acknowledged)} از ${toPersianDigits(d.ackAudience)})` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="reach-categories" className={cardClass}>
        <SectionTitle id="reach-categories" icon={<Tags className="w-5 h-5" />} title="به تفکیک دسته" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#8C867A] border-b border-[#E6E0D5]">
                <th className={th}>دسته</th>
                <th className={th}>اطلاعیه</th>
                <th className={`${th} w-2/5`}>خوانده‌شدن</th>
                <th className={th}>میانگین زمان تا خواندن</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((c) => (
                <tr key={c.name} className="border-b border-[#F5F2ED] last:border-0">
                  <td className={`${td} font-bold text-[#2D2D2D] whitespace-nowrap`}>{c.name}</td>
                  <td className={`${td} text-[#6E6A60]`}>{toPersianDigits(c.items)}</td>
                  <td className={td}><ShareBar part={c.read} total={c.audience} label={`خوانده‌شدن ${c.name}`} /></td>
                  <td className={`${td} whitespace-nowrap text-[#6E6A60]`}>{formatMinutes(c.avgReadMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ranked.top.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RankedList id="reach-top" icon={<ThumbsUp className="w-5 h-5" />} title="پرخواننده‌ترین اطلاعیه‌ها" items={ranked.top} onOpen={openItem} />
          {ranked.low.length > 0 && (
            <RankedList id="reach-low" icon={<ThumbsDown className="w-5 h-5" />} title="کم‌خواننده‌ترین اطلاعیه‌ها" items={ranked.low} onOpen={openItem} />
          )}
          <p className="text-[11px] text-[#6E6A60] lg:col-span-2 -mt-3">
            اطلاعیه‌های {toPersianDigits(RANK_MIN_AGE_DAYS)} روز اخیر که هنوز در حال خوانده‌شدن‌اند و اطلاعیه‌هایی که برای کمتر از سه نفر بوده‌اند در این مقایسه نیستند.
          </p>
        </div>
      )}

      <section aria-labelledby="reach-items" className={cardClass}>
        <SectionTitle id="reach-items" icon={<Newspaper className="w-5 h-5" />} title={`همهٔ اطلاعیه‌های این بازه (${toPersianDigits(report.items.length)})`} />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#8C867A] border-b border-[#E6E0D5]">
                <th className={th}>عنوان</th>
                <th className={th}>تاریخ</th>
                <th className={`${th} w-1/3`}>خوانده‌شدن</th>
                <th className={th}>تأیید</th>
                <th className={th}>زمان تا خواندن</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#F5F2ED] last:border-0">
                  <td className={td}>
                    <button onClick={() => openItem(item)} className="font-bold text-[#2D2D2D] hover:text-[#dc2626] text-right">{item.title}</button>
                    <span className="block text-[10px] text-[#8C867A]">{item.category}{item.author ? `، ${item.author}` : ''}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-[#6E6A60]`}>{formatDate(item.publishAt)}</td>
                  <td className={td}><ShareBar part={item.read} total={item.audience} label={`خوانده‌شدن ${item.title}`} /></td>
                  <td className={`${td} whitespace-nowrap`}>
                    {item.requiresAck ? (
                      <span className="flex items-center gap-1 font-bold text-[#991b1b]">
                        <FileCheck2 className="w-3.5 h-3.5" />
                        {toPersianDigits(item.acknowledged)} از {toPersianDigits(item.audience)}
                      </span>
                    ) : (
                      <span className="text-[#8C867A]">—</span>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-[#6E6A60]`}>{formatMinutes(item.avgReadMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.items.length > ITEMS_SHOWN && (
          <button onClick={() => setShowAll(!showAll)} className="text-xs font-bold text-[#991b1b] hover:underline">
            {showAll ? 'نمایش کمتر' : `نمایش همهٔ ${toPersianDigits(report.items.length)} اطلاعیه`}
          </button>
        )}
      </section>
    </div>
  );
};

const RankedList: React.FC<{ id: string; icon: React.ReactNode; title: string; items: NewsReportItem[]; onOpen: (item: NewsReportItem) => void }> = ({
  id,
  icon,
  title,
  items,
  onOpen,
}) => (
  <section aria-labelledby={id} className={cardClass}>
    <SectionTitle id={id} icon={icon} title={title} />
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="space-y-1 text-xs">
          <button onClick={() => onOpen(item)} className="font-bold text-[#2D2D2D] hover:text-[#dc2626] text-right">{item.title}</button>
          <ShareBar part={item.read} total={item.audience} label={`خوانده‌شدن ${item.title}`} />
        </li>
      ))}
    </ol>
  </section>
);

/** Colleagues with an account who have not opened the portal for a month: as of today, whatever the range. */
export const IdlePeopleCard: React.FC<{ people: IdlePerson[] }> = ({ people }) => {
  const { setActiveTab } = usePortal();
  return (
    <section aria-labelledby="idle-people" className={cardClass}>
      <SectionTitle
        id="idle-people"
        icon={<UserX className="w-5 h-5" />}
        title={`همکارانی که ${toPersianDigits(IDLE_DAYS)} روز به پرتال سر نزده‌اند (${toPersianDigits(people.length)})`}
        hint="وضعیت امروز، جدا از بازهٔ زمانی بالا. هر بار ورود یا باز کردن پرتال ثبت می‌شود."
      />
      {people.length === 0 ? (
        <Empty>همهٔ همکارانی که حساب پرتال دارند در یک ماه اخیر به پرتال سر زده‌اند.</Empty>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" aria-label="همکارانی که سر نزده‌اند">
          {people.map((p) => (
            <li key={p.id} className="p-3 rounded-xl bg-[#F5F2ED] text-xs space-y-0.5">
              <button onClick={() => setActiveTab('colleagues', p.id)} className="font-bold text-[#2D2D2D] hover:text-[#dc2626] text-right">{p.name}</button>
              <p className="text-[11px] text-[#6E6A60]">{[p.position, p.department].filter(Boolean).join('، ')}</p>
              <p className="text-[11px] font-bold text-[#991b1b]">
                {p.lastSeenAt ? `آخرین بار ${formatDate(p.lastSeenAt)}` : `ورودی از او ثبت نشده است (حساب از ${formatDate(p.createdAt)})`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
