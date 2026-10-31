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
import { PageHeader } from '../common/PageHeader';

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
    { id: 'all', label: 'همهٔ نتایج', count: results.length, active: 'bg-ink-strong' },
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
      <div className="space-y-4">
        <PageHeader
          icon={<Search />}
          title="جستجو"
          description="همکاران و داخلی‌ها، اخبار، راهنماها، صفحهٔ واحدها، دوره‌ها، نظرسنجی‌ها، تقویم، و متن فایل اسناد (PDF، Word، Excel و PowerPoint)."
        />
        <div className="relative max-w-2xl">
          <input
            type="text"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            placeholder="نام همکار، شمارهٔ داخلی، عنوان خبر یا فرم..."
            aria-label="جستجو در پرتال"
            autoFocus
            className="w-full pr-12 pl-4 py-3.5 text-sm bg-white text-ink rounded-2xl shadow-card border border-line focus:border-brand outline-hidden font-medium placeholder:text-faint"
          />
          <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-faint" />
        </div>
      </div>

      {/* Category Filter Pills */}
      {globalSearchQuery.trim().length >= 2 && (
        <div className="bg-white p-4 rounded-2xl border border-line shadow-xs flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoryFilter(f.id)}
                aria-pressed={categoryFilter === f.id}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                  categoryFilter === f.id ? `${f.active} text-white shadow-xs` : 'bg-surface hover:bg-line text-ink-soft'
                }`}
              >
                {f.label} ({toPersianDigits(f.count)})
              </button>
            ))}
          </div>

          <div className="text-xs text-faint font-medium whitespace-nowrap hidden sm:block">
            {toPersianDigits(filteredResults.length)} نتیجه یافت شد
          </div>
        </div>
      )}

      {/* Results Content */}
      <div className="space-y-4">
        {globalSearchQuery.trim().length < 2 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-line-strong space-y-3">
            <Search className="w-12 h-12 text-subtle mx-auto" />
            <h3 className="text-base font-bold text-ink-soft">لطفاً عبارت مورد نظر خود را جهت جستجو وارد کنید</h3>
            <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
              می‌توانید کلماتی مانند نام همکار، شماره تلفن داخلی، اخبار جدید، دوره‌های آموزشی یا عنوان نظرسنجی‌ها را جستجو نمایید.
            </p>
          </div>
        ) : filteredResults.length === 0 && searching ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-line-strong text-xs text-muted" role="status">
            <FileSearch className="w-8 h-8 text-subtle mx-auto mb-2" />
            در حال جستجو در متن فایل‌ها...
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-line-strong space-y-2">
            <Search className="w-10 h-10 text-subtle mx-auto" />
            <h3 className="text-sm font-bold text-ink-soft">هیچ نتیجه مرتبطی برای "{globalSearchQuery}" یافت نشد.</h3>
            <p className="text-xs text-faint">لطفاً کلمات کلیدی دیگری را امتحان کنید.</p>
            {nothingFound && currentUser && (
              <p className="text-xs text-faint">جستجوهای بی‌نتیجه (بدون نام جستجوکننده) ثبت می‌شوند تا برایشان راهنما نوشته شود.</p>
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
                className="bg-white rounded-2xl p-5 border border-line hover:border-red-400 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${item.badgeColor}`}>
                      {item.type}
                    </span>
                    <h3 className="text-sm font-bold text-ink group-hover:text-red-600 transition-colors truncate">
                      {item.title}
                    </h3>
                  </div>

                  <p className="text-xs text-ink-soft font-medium truncate">
                    {item.subtitle}
                  </p>

                  <p className="text-xs text-muted leading-relaxed line-clamp-2">
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
