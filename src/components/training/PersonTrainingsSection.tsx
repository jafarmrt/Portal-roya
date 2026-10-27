import React, { useEffect, useState } from 'react';
import { GraduationCap, Paperclip, Presentation } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api } from '../../lib/api';
import { formatDate, todayJalali, toPersianDigits } from '../../lib/jalali';
import type { PersonTrainings } from '../../types';

type Course = PersonTrainings['courses'][number];

const stateOf = (c: Course, today: string): { label: string; className: string } => {
  if (c.status === 'waitlist') return { label: 'لیست انتظار', className: 'bg-amber-100 text-amber-800' };
  if (c.attended === true) return { label: 'گذرانده', className: 'bg-emerald-100 text-emerald-800' };
  if (c.attended === false) return { label: 'غایب', className: 'bg-red-100 text-red-800' };
  if (c.date >= today) return { label: 'ثبت‌نام شده', className: 'bg-sky-100 text-sky-800' };
  return { label: 'برگزار شد', className: 'bg-[#F5F2ED] text-[#6E6A60]' };
};

/**
 * «دوره‌های من» in a colleague's profile: the courses they signed up for (coming, passed, missed) and
 * the ones they taught. Shown to the colleague and to the people who run trainings.
 */
export const PersonTrainingsSection: React.FC<{ userId: string; own: boolean; onOpen: (trainingId: string) => void }> = ({ userId, own, onOpen }) => {
  const { trainings } = usePortal();
  const [data, setData] = useState<PersonTrainings | null>(null);
  const today = todayJalali();

  useEffect(() => {
    let current = true;
    api
      .get<PersonTrainings>(`/api/trainings/people/${userId}`)
      .then((d) => current && setData(d))
      .catch(() => current && setData({ courses: [], taught: [] }));
    return () => {
      current = false;
    };
    // The list of trainings changes when someone signs up or attendance is taken.
  }, [userId, trainings]);

  if (!data) return null;
  const passed = data.courses.filter((c) => c.status === 'enrolled' && c.attended === true).length;

  return (
    <section className="mb-6 space-y-3" aria-labelledby={`trainings-${userId}`}>
      <h3 id={`trainings-${userId}`} className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <GraduationCap className="w-4 h-4 text-red-600" />
        <span>{own ? 'دوره‌های من' : 'دوره‌های آموزشی'} ({toPersianDigits(data.courses.length)}):</span>
        {passed > 0 && <span className="font-normal text-slate-500">{toPersianDigits(passed)} دوره گذرانده</span>}
      </h3>
      {data.courses.length === 0 && data.taught.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{own ? 'هنوز در دوره‌ای ثبت‌نام نکرده‌اید.' : 'در دوره‌ای ثبت‌نام نکرده است.'}</p>
      ) : (
        <ul className="space-y-1.5">
          {data.courses.map((c) => {
            const state = stateOf(c, today);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/70 hover:border-red-300 text-right"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-800 truncate">{c.title}</span>
                    <span className="block text-[11px] text-slate-500">
                      {formatDate(c.date)}، {c.instructor}
                      {c.materialsCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 mr-2">
                          <Paperclip className="w-3 h-3" /> {toPersianDigits(c.materialsCount)} فایل
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${state.className}`}>{state.label}</span>
                </button>
              </li>
            );
          })}
          {data.taught.map((t) => (
            <li key={`taught-${t.id}`}>
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/70 hover:border-red-300 text-right"
              >
                <Presentation className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 truncate">{t.title}</span>
                  <span className="block text-[11px] text-slate-500">{formatDate(t.date)}</span>
                </span>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">مدرس</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
