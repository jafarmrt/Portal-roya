import React, { useEffect, useState } from 'react';
import { Building2, GraduationCap, SearchX, Vote } from 'lucide-react';
import { type ParticipationReport as Report, percentOf } from '../../../shared/reports';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import { cardClass, Empty, formatPercent, formatRating, SectionTitle, ShareBar, StatTile, td, th } from './reportUi';

/** و۲: taking part in the polls and courses of the chosen range, by department. */
export const ParticipationReport: React.FC<{ report: Report }> = ({ report }) => {
  const { setActiveTab } = usePortal();
  const { totals } = report;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="مشارکت در نظرسنجی‌ها"
          value={formatPercent(percentOf(totals.pollResponses, totals.pollAudience))}
          note={`${toPersianDigits(report.polls.length)} نظرسنجی، ${toPersianDigits(totals.pollResponses)} پاسخ`}
        />
        <StatTile
          label="همکارانی که در دوره شرکت کردند"
          value={toPersianDigits(totals.trainingPeople)}
          note={`${formatPercent(percentOf(totals.trainingPeople, totals.staff))} همکاران، در ${toPersianDigits(report.trainings.length)} دوره`}
        />
        <StatTile
          label="حضور در کلاس‌ها"
          value={formatPercent(percentOf(totals.attended, totals.attended + totals.absent))}
          note={totals.attended + totals.absent > 0 ? `${toPersianDigits(totals.attended)} حاضر، ${toPersianDigits(totals.absent)} غایب` : 'حضور و غیابی ثبت نشده'}
        />
        <StatTile
          label="رضایت از دوره‌ها"
          value={formatRating(totals.satisfaction)}
          note={totals.feedback > 0 ? `از ${toPersianDigits(totals.feedback)} نظر، سودمندی ${formatRating(totals.usefulness)}` : 'نظری ثبت نشده'}
        />
      </div>

      <section aria-labelledby="participation-departments" className={cardClass}>
        <SectionTitle
          id="participation-departments"
          icon={<Building2 className="w-5 h-5" />}
          title="به تفکیک واحد"
          hint="همکارانی که حساب پرتال دارند؛ هر نظرسنجی فقط برای مخاطبانش شمرده شده است"
        />
        {report.departments.length === 0 ? (
          <Empty>داده‌ای برای این بازه نیست.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#8C867A] border-b border-[#E6E0D5]">
                  <th className={th}>واحد</th>
                  <th className={th}>همکاران</th>
                  <th className={th}>پاسخ به نظرسنجی‌ها</th>
                  <th className={th}>شرکت در دوره‌ها</th>
                  <th className={th}>حضور</th>
                </tr>
              </thead>
              <tbody>
                {report.departments.map((d) => (
                  <tr key={d.name} className="border-b border-[#F5F2ED] last:border-0">
                    <td className={`${td} font-bold text-[#2D2D2D] whitespace-nowrap`}>{d.name}</td>
                    <td className={`${td} text-[#6E6A60]`}>{toPersianDigits(d.staff)}</td>
                    <td className={td}>
                      {d.pollAudience > 0 ? <ShareBar part={d.pollResponses} total={d.pollAudience} label={`پاسخ به نظرسنجی‌ها در ${d.name}`} /> : <span className="text-[#8C867A]">—</span>}
                    </td>
                    <td className={td}><ShareBar part={d.trainingPeople} total={d.staff} label={`شرکت در دوره‌ها در ${d.name}`} /></td>
                    <td className={`${td} whitespace-nowrap text-[#6E6A60]`}>
                      {d.attended + d.absent > 0 ? `${toPersianDigits(d.attended)} از ${toPersianDigits(d.attended + d.absent)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section aria-labelledby="participation-polls" className={cardClass}>
          <SectionTitle id="participation-polls" icon={<Vote className="w-5 h-5" />} title={`نظرسنجی‌ها (${toPersianDigits(report.polls.length)})`} hint="نظرسنجی‌هایی که در این بازه ساخته شده‌اند" />
          {report.polls.length === 0 ? (
            <Empty>در این بازه نظرسنجی‌ای ساخته نشده است.</Empty>
          ) : (
            <ul className="space-y-3">
              {report.polls.map((p) => (
                <li key={p.id} className="text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => setActiveTab('polls', p.id)} className="font-bold text-[#2D2D2D] hover:text-[#dc2626] text-right">{p.title}</button>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.open ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F5F2ED] text-[#6E6A60]'}`}>
                      {p.open ? 'باز' : 'بسته'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8C867A]">{formatDate(p.createdAt)}</p>
                  <ShareBar part={p.responses} total={p.audience} label={`پاسخ به ${p.title}`} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="participation-trainings" className={cardClass}>
          <SectionTitle id="participation-trainings" icon={<GraduationCap className="w-5 h-5" />} title={`دوره‌ها (${toPersianDigits(report.trainings.length)})`} hint="دوره‌هایی که تاریخشان در این بازه است" />
          {report.trainings.length === 0 ? (
            <Empty>در این بازه دوره‌ای برگزار نشده است.</Empty>
          ) : (
            <ul className="space-y-3">
              {report.trainings.map((t) => (
                <li key={t.id} className="text-xs p-3 rounded-xl border border-[#E6E0D5] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => setActiveTab('training', t.id)} className="font-bold text-[#2D2D2D] hover:text-[#dc2626] text-right">{t.title}</button>
                    <span className="shrink-0 text-[10px] text-[#8C867A]">{formatDate(t.date)}</span>
                  </div>
                  <ShareBar part={t.enrolled} total={t.capacity} label={`ثبت‌نام در ${t.title}`} />
                  <p className="text-[11px] text-[#6E6A60]">
                    {[
                      t.waitlist > 0 ? `${toPersianDigits(t.waitlist)} نفر در انتظار` : '',
                      t.attended + t.absent > 0 ? `${toPersianDigits(t.attended)} حاضر، ${toPersianDigits(t.absent)} غایب` : 'حضور و غیاب ثبت نشده',
                      t.feedback > 0 ? `رضایت ${formatRating(t.satisfaction)} از ${toPersianDigits(t.feedback)} نظر` : '',
                    ]
                      .filter(Boolean)
                      .join('، ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SearchMissesCard />
    </div>
  );
};

interface SearchMiss {
  query: string;
  count: number;
  lastAt: string;
}

/** What colleagues searched for and did not find in the last three months: topics worth a guide. */
const SearchMissesCard: React.FC = () => {
  const { can, setActiveTab } = usePortal();
  const [misses, setMisses] = useState<SearchMiss[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<SearchMiss[]>('/api/search/misses')
      .then(setMisses)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <section aria-labelledby="search-misses-title" className={cardClass}>
      <SectionTitle
        id="search-misses-title"
        icon={<SearchX className="w-5 h-5" />}
        title="جستجوهای بی‌نتیجه"
        hint="همکاران در سه ماه اخیر این‌ها را جستجو کرده‌اند و چیزی پیدا نکرده‌اند (بدون نام جستجوکننده)"
        action={
          can('documents.manage') && misses && misses.length > 0 ? (
            <button onClick={() => setActiveTab('guides')} className="px-4 py-2 text-xs font-bold text-[#2D2D2D] bg-white hover:bg-[#F5F2ED] border border-[#D9D4CB] rounded-xl w-fit">
              نوشتن راهنما
            </button>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      ) : !misses ? (
        <p className="text-xs text-[#6E6A60]">در حال دریافت...</p>
      ) : misses.length === 0 ? (
        <Empty>جستجوی بی‌نتیجه‌ای ثبت نشده است.</Empty>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {misses.map((m) => (
            <li key={m.query} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F5F2ED] text-xs" title={`آخرین بار ${formatDate(m.lastAt)}`}>
              <span className="font-bold text-[#2D2D2D]">{toPersianDigits(m.query)}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white text-[10px] font-bold text-[#991b1b]">{toPersianDigits(m.count)} بار</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
