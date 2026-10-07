import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { SearchResultItem } from '../../types';
import {
  Search,
  Users,
  Newspaper,
  Vote,
  GraduationCap,
  Calendar,
  ChevronLeft,
  Filter,
  Sparkles,
  PhoneCall,
  CheckCircle2
} from 'lucide-react';

export const GlobalSearchModule: React.FC = () => {
  const {
    globalSearchQuery,
    setGlobalSearchQuery,
    getGlobalSearchResults,
    setActiveTab
  } = usePortal();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const results = getGlobalSearchResults(globalSearchQuery);

  const filteredResults = results.filter(r => {
    if (categoryFilter === 'all') return true;
    return r.type === categoryFilter;
  });

  // Group counts
  const colleagueCount = results.filter(r => r.type === 'همکاران').length;
  const newsCount = results.filter(r => r.type === 'اخبار' || r.type === 'اطلاعیه').length;
  const pollCount = results.filter(r => r.type === 'نظرسنجی').length;
  const trainingCount = results.filter(r => r.type === 'آموزش').length;
  const calendarCount = results.filter(r => r.type === 'تقویم').length;

  return (
    <div className="space-y-6">
      
      {/* Search Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-red-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-semibold border border-red-500/30">
            <Search className="w-3.5 h-3.5" />
            <span>سامانه جستجوی سراسری هوشمند پرتال رویا طرح داخلی</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">جستجوی جامع در تمامی محتواهای سازمان</h1>
          <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
            جستجوی همزمان در اسامی و تلفن‌های داخلی همکاران، اخبار، اطلاعیه‌ها، برنامه‌های آموزشی، نظرسنجی‌ها و تقویم سازمانی.
          </p>

          {/* Big Search Input */}
          <div className="relative max-w-2xl pt-2">
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="عبارت مورد نظر خود را تایپ کنید (مثلاً: رضایی، آکوستیک، منوی غذا، ۳ds max، ساعات کاری)..."
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
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              همه نتایج ({results.length})
            </button>
            
            <button
              onClick={() => setCategoryFilter('همکاران')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === 'همکاران'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              همکاران ({colleagueCount})
            </button>

            <button
              onClick={() => setCategoryFilter('اخبار')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === 'اخبار'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              اخبار و اطلاعیه‌ها ({newsCount})
            </button>

            <button
              onClick={() => setCategoryFilter('نظرسنجی')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === 'نظرسنجی'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              نظرسنجی‌ها ({pollCount})
            </button>

            <button
              onClick={() => setCategoryFilter('آموزش')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === 'آموزش'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              دوره‌های آموزشی ({trainingCount})
            </button>

            <button
              onClick={() => setCategoryFilter('تقویم')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === 'تقویم'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              تقویم ({calendarCount})
            </button>
          </div>

          <div className="text-xs text-slate-400 font-medium whitespace-nowrap hidden sm:block">
            {filteredResults.length} نتیجه یافت شد
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
        ) : filteredResults.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300 space-y-2">
            <Search className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">هیچ نتیجه مرتبطی برای "{globalSearchQuery}" یافت نشد.</h3>
            <p className="text-xs text-slate-400">لطفاً کلمات کلیدی دیگری را امتحان کنید.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResults.map((item) => (
              <div
                key={item.id}
                onClick={() => setActiveTab(item.targetTab)}
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
