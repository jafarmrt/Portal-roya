import React from 'react';
import { usePortal } from '../context/PortalContext';
import { ActiveTab } from '../types';
import { Avatar } from './common/Avatar';
import { currentJalaliYear, toPersianDigits } from '../lib/jalali';
import { useEscapeKey } from '../lib/useEscapeKey';
import {
  LayoutDashboard,
  Vote,
  Users,
  Newspaper,
  GraduationCap,
  Calendar,
  Settings,
  BarChart2,
  FolderOpen,
  Network,
  LayoutGrid,
  LogIn
} from 'lucide-react';

interface NavigationProps {
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ isMobileNavOpen, onCloseMobileNav }) => {
  const { activeTab, setActiveTab, currentUser, isGuest, requestLogin, appSettings, polls, news } = usePortal();
  useEscapeKey(onCloseMobileNav, isMobileNavOpen);

  // Read/vote badges are personal, so guests don't get them.
  const activePollsCount = isGuest ? 0 : polls.filter(p => p.isActive && !p.hasVoted).length;
  const unreadNewsCount = isGuest ? 0 : news.filter(n => n.status === 'published' && !n.isRead).length;
  const pendingAckCount = isGuest ? 0 : news.filter(n => n.status === 'published' && n.requiresAck && !n.acknowledgedAt).length;

  let navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string | number; badgeColor?: string }[] = [
    {
      id: 'dashboard',
      label: 'داشبورد',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      id: 'systems',
      label: 'سامانه‌ها',
      icon: <LayoutGrid className="w-4 h-4" />
    },
    {
      id: 'polls',
      label: 'نظرسنجی‌ها',
      icon: <Vote className="w-4 h-4" />,
      badge: activePollsCount > 0 ? `${toPersianDigits(activePollsCount)} جدید` : undefined,
      badgeColor: 'bg-[#991b1b]/30 text-[#E6E0D5]'
    },
    {
      id: 'news',
      label: 'اخبار و اطلاعیه‌ها',
      icon: <Newspaper className="w-4 h-4" />,
      badge: pendingAckCount > 0
        ? `${toPersianDigits(pendingAckCount)} بخشنامه`
        : unreadNewsCount > 0 ? `${toPersianDigits(unreadNewsCount)} نخوانده` : undefined,
      badgeColor: pendingAckCount > 0 ? 'bg-amber-400 text-amber-950' : 'bg-[#991b1b]/30 text-[#E6E0D5]'
    },
    {
      id: 'documents',
      label: 'اسناد و فرم‌ها',
      icon: <FolderOpen className="w-4 h-4" />
    },
    {
      id: 'colleagues',
      label: 'دفتر تلفن',
      icon: <Users className="w-4 h-4" />
    },
    {
      id: 'orgchart',
      label: 'چارت سازمانی',
      icon: <Network className="w-4 h-4" />
    },
    {
      id: 'training',
      label: 'آموزش',
      icon: <GraduationCap className="w-4 h-4" />
    },
    {
      id: 'calendar',
      label: 'تقویم',
      icon: <Calendar className="w-4 h-4" />
    },

  ];

  // The phone book and org chart stay hidden from guests unless a manager opened them.
  if (isGuest && !appSettings?.guestDirectory) {
    navItems = navItems.filter((item) => item.id !== 'colleagues' && item.id !== 'orgchart');
  }

  if (currentUser?.role === 'manager') {
    navItems.push({ id: 'reports', label: 'گزارش‌ها', icon: <BarChart2 className="w-4 h-4" /> });
    navItems.push({ id: 'admin', label: 'تنظیمات', icon: <Settings className="w-4 h-4" /> });
  }

  return (
    <>
      {/* Desktop Navigation Top Bar / Sub-header */}
      <nav className="hidden lg:block bg-[#7f1d1d] text-[#E6E0D5] border-b border-[#7f1d1d] shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 py-1.5 min-w-0 overflow-x-auto no-scrollbar">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-[#dc2626] text-white shadow-md shadow-[#dc2626]/30'
                        : 'text-[#C5BFC7] hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${item.badgeColor || 'bg-[#7f1d1d] text-[#E6E0D5]'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

          </div>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {isMobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#7f1d1d]/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobileNav}
          />

          <div className="relative flex-1 max-w-xs w-full h-full overflow-y-auto overscroll-contain bg-[#7f1d1d] text-[#E6E0D5] p-5 flex flex-col justify-between gap-4 shadow-2xl z-10 text-right" role="dialog" aria-modal="true" aria-label="منوی پرتال">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-white">پرتال رویا طرح داخلی</span>
                  <span className="text-[11px] text-[#E6E0D5]/80">ROYA Surface Center</span>
                </div>
                <button
                  onClick={onCloseMobileNav}
                  aria-label="بستن منو"
                  className="p-2 rounded-lg text-[#E6E0D5] hover:text-white hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              {isGuest && (
                <button
                  onClick={() => {
                    onCloseMobileNav();
                    requestLogin();
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 mb-4 rounded-xl bg-white text-[#7f1d1d] text-xs font-black"
                >
                  <LogIn className="w-4 h-4" /> ورود به پرتال
                </button>
              )}

              {/* User Profile Mini Badge in Mobile Nav */}
              {currentUser && (
                <div className="flex items-center gap-3 p-3 bg-black/15 rounded-xl mb-4 border border-white/10">
                  <Avatar
                    src={currentUser.avatar}
                    firstName={currentUser.firstName}
                    lastName={currentUser.lastName}
                    className="w-10 h-10 rounded-full border-2 border-[#dc2626] text-xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {currentUser.firstName} {currentUser.lastName}
                    </div>
                    <div className="text-[10px] text-[#E6E0D5]/80 truncate">
                      {currentUser.position}
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Items */}
              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        onCloseMobileNav();
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-[#dc2626] text-white shadow-md'
                          : 'text-[#C5BFC7] hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.badgeColor || 'bg-[#7f1d1d] text-[#E6E0D5]'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 text-[11px] text-[#E6E0D5]/80 text-center">
              شرکت رویا طرح داخلی © {toPersianDigits(currentJalaliYear())}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
