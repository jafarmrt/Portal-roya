import React, { useEffect, useRef, useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import type { SearchResultItem } from '../../types';
import { api } from '../../lib/api';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import {
  Search,
  ChevronLeft,
  FileSearch
} from 'lucide-react';

interface FileHit {
  id: string;
  snippet: string;
}

/** Words inside document files are searched on the server, a moment after typing stops. */
function useFileHits(query: string) {
  const [hits, setHits] = useState<{ query: string; documents: FileHit[] } | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ documents: FileHit[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((result) => !cancelled && setHits({ query: q, documents: result.documents }))
        .catch(() => !cancelled && setHits({ query: q, documents: [] }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  return hits?.query === query.trim() ? hits.documents : null;
}

export const GlobalSearchModule: React.FC = () => {
  const {
    globalSearchQuery,
    setGlobalSearchQuery,
    getGlobalSearchResults,
    setActiveTab,
    documents,
    currentUser
  } = usePortal();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const fileHits = useFileHits(globalSearchQuery);

  const results = getGlobalSearchResults(globalSearchQuery);
  for (const hit of fileHits ?? []) {
    const doc = documents.find((d) => d.id === hit.id);
    const listed = results.find((r) => r.type === 'اسناد' && r.targetId === hit.id);
    if (listed) {
      if (hit.snippet && !listed.snippet) listed.snippet = toPersianDigits(hit.snippet);
      continue;
    }
    if (!doc) continue;
    results.push({
      id: `res-doc-file-${doc.id}`,
      type: 'اسناد',
      title: doc.title,
      subtitle: ['یافته در متن فایل', doc.category, formatDate(doc.updatedAt)].join(' | '),
      snippet: toPersianDigits(hit.snippet),
      targetTab: 'documents',
      targetId: doc.id,
      badgeColor: 'bg-stone-100 text-stone-800 border-stone-300',
    });
  }

  // A search that finds nothing tells the people who write guides what colleagues are missing.
  const searching = globalSearchQuery.trim().length >= 2 && fileHits === null;
  const nothingFound = !searching && globalSearchQuery.trim().length >= 3 && results.length === 0;
  const loggedMiss = useRef('');
  useEffect(() => {
    const q = globalSearchQuery.trim();
    if (!nothingFound || !currentUser || loggedMiss.current === q) return;
    const timer = setTimeout(() => {
      loggedMiss.current = q;
      void api.post('/api/search/misses', { q }).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [nothingFound, globalSearchQuery, currentUser]);

  const groupOf = (type: SearchResultItem['type']) => (type === 'اطلاعیه' ? 'اخبار' : type);

  const filteredResults = results.filter((r) => categoryFilter === 'all' || groupOf(r.type) === categoryFilter);
  const countOf = (group: string) => results.filter((r) => groupOf(r.type) === group).length;

  const filters = [
    { id: 'all', label: 'همهٔ نتایج', count: results.length, active: 'bg-slate-900' },
    { id: 'همکاران', label: 'همکاران', count: countOf('همکاران'), active: 'bg-emerald-600' },
    { id: 'اخبار', label: 'اخبار و اطلاعیه‌ها', count: countOf('اخبار'), active: 'bg-red-600' },
    { id: 'اسناد', label: 'اسناد و فرم‌ها', count: countOf('اسناد'), active: 'bg-stone-700' },
    { id: 'راهنما', label: 'راهنماها', count: countOf('راهنما'), active: 'bg-teal-700' },
    { id: 'واحد', label: 'واحدها', count: countOf('واحد'), active: 'bg-orange-700' },
    { id: 'نظرسنجی', label: 'نظرسنجی‌ها', count: countOf('نظرسنجی'), active: 'bg-indigo-600' },
    { id: 'آموزش', label: 'دوره‌های آموزشی', count: countOf('آموزش'), active: 'bg-blue-600' },
    { id: 'تقویم', label: 'تقویم', count: countOf('تقویم'), active: 'bg-purple-600' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Search Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-red-950 rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-semibold border border-red-500/30">
            <Search className="w-3.5 h-3.5" />
            <span>سامانه جستجوی سراسری هوشمند پرتال رویا طرح داخلی</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-white">جستجوی جامع در تمامی محتواهای سازمان</h1>
          <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
            جستجوی هم‌زمان در نام و تلفن داخلی همکاران، اخبار و اطلاعیه‌ها، راهنماها، صفحهٔ واحدها، دوره‌های آموزشی، نظرسنجی‌ها و تقویم سازمان؛ و در متن فایل اسناد (PDF، Word، Excel و PowerPoint).
          </p>

          {/* Big Search Input */}
          <div className="relative max-w-2xl pt-2">
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="نام همکار، شمارهٔ داخلی، عنوان خبر یا فرم..."
              aria-label="جستجو در پرتال"
              autoFocus
              className="w-full pr-12 pl-4 py-3.5 text-sm bg-white text-slate-900 rounded-2xl shadow-lg border border-transparent focus:border-red-500 outline-hidden font-medium placeholder-slate-400"
            />
            <Search className="w-5 h-5 absolute right-4 top-6 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      {globalSearchQuery.trim().length >= 2 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoryFilter(f.id)}
                aria-pressed={categoryFilter === f.id}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                  categoryFilter === f.id ? `${f.active} text-white shadow-xs` : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {f.label} ({toPersianDigits(f.count)})
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400 font-medium whitespace-nowrap hidden sm:block">
            {toPersianDigits(filteredResults.length)} نتیجه یافت شد
          </div>
        </div>
      )}

      {/* Results Content */}
      <div className="space-y-4">
        {globalSearchQuery.trim().length < 2 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300 space-y-3">
            <Search className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">لطفاً عبارت مورد نظر خود را جهت جستجو وارد کنید</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              می‌توانید کلماتی مانند نام همکار، شماره تلفن داخلی، اخبار جدید، دوره‌های آموزشی یا عنوان نظرسنجی‌ها را جستجو نمایید.
            </p>
          </div>
        ) : filteredResults.length === 0 && searching ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300 text-xs text-slate-500" role="status">
            <FileSearch className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            در حال جستجو در متن فایل‌ها...
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300 space-y-2">
            <Search className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">هیچ نتیجه مرتبطی برای "{globalSearchQuery}" یافت نشد.</h3>
            <p className="text-xs text-slate-400">لطفاً کلمات کلیدی دیگری را امتحان کنید.</p>
            {nothingFound && currentUser && (
              <p className="text-[11px] text-slate-400">جستجوهای بی‌نتیجه (بدون نام جستجوکننده) ثبت می‌شوند تا برایشان راهنما نوشته شود.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResults.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab(item.targetTab, item.targetId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setActiveTab(item.targetTab, item.targetId);
                }}
                className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-red-400 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${item.badgeColor}`}>
                      {item.type}
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 group-hover:text-red-600 transition-colors truncate">
                      {item.title}
                    </h3>
                  </div>

                  <p className="text-xs text-slate-600 font-medium truncate">
                    {item.subtitle}
                  </p>

                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {item.snippet}
                  </p>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-red-600 group-hover:translate-x-1 transition-transform self-end sm:self-center whitespace-nowrap">
                  <span>مشاهده در بخش مربوطه</span>
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
