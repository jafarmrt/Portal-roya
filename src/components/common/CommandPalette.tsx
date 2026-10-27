import React, { useState, useEffect, useRef } from 'react';
import { usePortal } from '../../context/PortalContext';
import { Search, Users, ExternalLink, Newspaper, Calendar, GraduationCap, Vote, PhoneCall, ArrowRight, X, FolderOpen, LifeBuoy, Building2 } from 'lucide-react';
import { matches } from '../../lib/search';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const {
    employees,
    news,
    appSettings,
    setActiveTab,
    documents,
    guides,
    systemHref
  } = usePortal();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Search items calculation
  const cleanQ = query.trim();
  const hit = (...fields: (string | undefined)[]) => matches(cleanQ, ...fields);

  const colleagueResults = cleanQ
    ? employees
        .filter(e => e.isActive && hit(`${e.firstName} ${e.lastName}`, e.position, e.department, e.extension, e.mobile))
        .slice(0, 4)
        .map(e => ({
          id: `emp-${e.id}`,
          type: 'همکاران' as const,
          title: `${e.firstName} ${e.lastName}`,
          subtitle: `${e.position}${e.extension ? ` | داخلی: ${e.extension}` : ''}`,
          icon: <PhoneCall className="w-4 h-4 text-[#991b1b]" />,
          action: () => {
            setActiveTab('colleagues', e.id);
            onClose();
          }
        }))
    : [];

  const systemResults = (appSettings?.systems || [])
    .filter(s =>
      cleanQ ? hit(s.name, s.description) : true
    )
    .slice(0, 3)
    .map(s => ({
      id: `sys-${s.id}`,
      type: 'سامانه‌ها' as const,
      title: s.name,
      subtitle: s.description,
      icon: <ExternalLink className="w-4 h-4 text-emerald-600" />,
      action: () => {
        const link = systemHref(s);
        if (link) {
          window.open(link, '_blank', 'noopener,noreferrer');
        } else {
          setActiveTab('systems');
        }
        onClose();
      }
    }));

  const newsResults = cleanQ
    ? news
        .filter(n => hit(n.title, n.summary, ...n.tags))
        .slice(0, 3)
        .map(n => ({
          id: `news-${n.id}`,
          type: 'اخبار' as const,
          title: n.title,
          subtitle: n.category,
          icon: <Newspaper className="w-4 h-4 text-amber-600" />,
          action: () => {
            setActiveTab('news', n.id);
            onClose();
          }
        }))
    : [];

  const documentResults = cleanQ
    ? documents
        .filter(d => hit(d.title, d.description, d.category, d.fileName))
        .slice(0, 3)
        .map(d => ({
          id: `doc-${d.id}`,
          type: 'اسناد' as const,
          title: d.title,
          subtitle: d.category,
          icon: <FolderOpen className="w-4 h-4 text-stone-600" />,
          action: () => {
            setActiveTab('documents', d.id);
            onClose();
          }
        }))
    : [];

  const guideResults = cleanQ
    ? guides
        .filter(g => hit(g.title, g.summary, g.category))
        .slice(0, 3)
        .map(g => ({
          id: `guide-${g.id}`,
          type: 'راهنما' as const,
          title: g.title,
          subtitle: g.summary || g.category,
          icon: <LifeBuoy className="w-4 h-4 text-teal-700" />,
          action: () => {
            setActiveTab('guides', g.id);
            onClose();
          }
        }))
    : [];

  const navigationResults = [
    { id: 'nav-dashboard', type: 'ناوبری' as const, title: 'داشبورد اصلی', subtitle: 'مشاهده صفحه اصلی و رویدادهای روز', icon: <ArrowRight className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('dashboard'); onClose(); } },
    { id: 'nav-systems', type: 'ناوبری' as const, title: 'سامانه‌های سازمانی', subtitle: 'اتوماسیون، حضور غیاب، منابع انسانی', icon: <ExternalLink className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('systems'); onClose(); } },
    { id: 'nav-colleagues', type: 'ناوبری' as const, title: 'دفترچه همکاران و داخلی‌ها', subtitle: 'جستجوی شماره تلفن و داخلی پرسنل', icon: <Users className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('colleagues'); onClose(); } },
    { id: 'nav-calendar', type: 'ناوبری' as const, title: 'تقویم و رویدادها', subtitle: 'تعطیلات رسمی و برنامه‌های سازمانی', icon: <Calendar className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('calendar'); onClose(); } },
    { id: 'nav-training', type: 'ناوبری' as const, title: 'دوره‌های آموزشی', subtitle: 'ثبت‌نام و یادگیری درون‌سازمانی', icon: <GraduationCap className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('training'); onClose(); } },
    { id: 'nav-documents', type: 'ناوبری' as const, title: 'اسناد و فرم‌ها', subtitle: 'آیین‌نامه‌ها، فرم‌ها و دستورالعمل‌ها', icon: <FolderOpen className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('documents'); onClose(); } },
    { id: 'nav-guides', type: 'ناوبری' as const, title: 'راهنماها و پرسش‌های رایج', subtitle: 'چطور انجامش بدهم؟ با چه کسی تماس بگیرم؟', icon: <LifeBuoy className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('guides'); onClose(); } },
    { id: 'nav-departments', type: 'ناوبری' as const, title: 'واحدهای سازمان', subtitle: 'مسئول هر واحد و کارهایی که انجام می‌دهد', icon: <Building2 className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('departments'); onClose(); } },
    { id: 'nav-orgchart', type: 'ناوبری' as const, title: 'چارت سازمانی', subtitle: 'ساختار واحدها و مدیران', icon: <Users className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('orgchart'); onClose(); } },
    { id: 'nav-polls', type: 'ناوبری' as const, title: 'نظرسنجی‌ها', subtitle: 'مشارکت در تصمیم‌گیری‌ها', icon: <Vote className="w-4 h-4 text-zinc-500" />, action: () => { setActiveTab('polls'); onClose(); } },
  ].filter(item => cleanQ ? hit(item.title, item.subtitle) : true).slice(0, cleanQ ? 3 : 4);

  const allResults = [...colleagueResults, ...systemResults, ...newsResults, ...documentResults, ...guideResults, ...navigationResults];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (allResults.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allResults.length) % (allResults.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        allResults[selectedIndex].action();
      }
    }
  };

  return (
    <div
      id="command-palette-backdrop"
      className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-6 sm:p-4 sm:pt-24 bg-[#1E1E1E]/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      dir="rtl"
    >
      <div
        id="command-palette-card"
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-[#EAE6DF] overflow-hidden flex flex-col max-h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-8rem)]"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#EAE6DF] bg-[#FCFAF7] gap-3 shrink-0">
          <Search className="w-5 h-5 text-[#991b1b] shrink-0" />
          <input
            ref={inputRef}
            id="command-palette-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="جستجوی همکار، شماره داخلی، سامانه، خبر..."
            className="flex-1 bg-transparent text-sm font-medium text-[#1E1E1E] focus:outline-hidden placeholder:text-[#9C968B]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-[#9C968B] hover:text-[#1E1E1E] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-[#9C968B] bg-[#EFECE6] px-2 py-0.5 rounded-md font-mono">
            <span>ESC برای بستن</span>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-96 flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 divide-y divide-[#F5F2ED]">
          {allResults.length === 0 ? (
            <div className="py-12 text-center text-[#7A756D] space-y-1">
              <Search className="w-8 h-8 text-[#D9D4CB] mx-auto mb-2" />
              <p className="text-xs font-bold">نتیجه‌ای یافت نشد</p>
              <p className="text-[11px]">عبارت دیگری را جستجو کنید (مانند نام، داخلی، سامانه)</p>
            </div>
          ) : (
            allResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#F3EFE9] text-[#1E1E1E]' : 'hover:bg-[#F9F7F4] text-[#2D2D2D]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white border border-[#EAE6DF] flex items-center justify-center shrink-0 shadow-2xs">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1E1E1E] flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold bg-[#EFECE6] text-[#605C54]">
                          {item.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#7A756D] line-clamp-1 mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <ArrowRight className={`w-4 h-4 text-[#991b1b] transition-transform ${isSelected ? 'translate-x-0 opacity-100' : 'opacity-0'}`} />
                </div>
              );
            })
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="hidden sm:flex px-4 py-2 bg-[#EFECE6] border-t border-[#EAE6DF] items-center justify-between text-[10px] text-[#7A756D] shrink-0">
          <div className="flex items-center gap-2">
            <span>استفاده از کلیدهای <strong>↑</strong> و <strong>↓</strong> جهت پیمایش</span>
            <span>•</span>
            <span><strong>Enter</strong> جهت انتخاب</span>
          </div>
          <span className="font-semibold text-[#991b1b]">پرتال رویا طرح داخلی</span>
        </div>
      </div>
    </div>
  );
};
