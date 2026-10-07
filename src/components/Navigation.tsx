import React from 'react';
import { usePortal } from '../context/PortalContext';
import { ActiveTab } from '../types';
import {
  MonitorSmartphone,
  LayoutDashboard,
  Vote,
  Users,
  Search,
  Newspaper,
  GraduationCap,
  Calendar,
  Bell,
  Sparkles,
  PhoneCall,
  UserPlus,
  ShieldCheck,
  Settings,
  BarChart2
} from 'lucide-react';

interface NavigationProps {
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ isMobileNavOpen, onCloseMobileNav }) => {
  const { activeTab, setActiveTab, notifications, currentUser, polls, openLoginModal } = usePortal();

  const unreadNotifCount = notifications.filter(
    n => !n.isRead && (n.targetUserId === 'all' || (currentUser && n.targetUserId === currentUser.id))
  ).length;

  const activePollsCount = polls.filter(p => p.isActive).length;

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string | number; badgeColor?: string }[] = [
    {
      id: 'dashboard',
      label: 'داشبورد اصلی',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      id: 'polls',
      label: 'نظرسنجی‌های داخلی',
      icon: <Vote className="w-4 h-4" />,
      badge: activePollsCount > 0 ? `${activePollsCount} فعال` : undefined,
      badgeColor: 'bg-[#991b1b]/30 text-[#E6E0D5]'
    },
    {
      id: 'colleagues',
      label: 'همکاران',
      icon: <Users className="w-4 h-4" />
    },

    {
      id: 'news',
      label: 'اخبار و اطلاعیه‌ها',
      icon: <Newspaper className="w-4 h-4" />
    },
    {
      id: 'training',
      label: 'برنامه‌های آموزشی',
      icon: <GraduationCap className="w-4 h-4" />
    },
    {
      id: 'calendar',
      label: 'تقویم سازمانی',
      icon: <Calendar className="w-4 h-4" />
    },

  ];

  if (currentUser?.role === 'manager') {
    navItems.push({ id: 'reports', label: 'گزارشات', icon: <BarChart2 className="w-4 h-4" /> });
  }

  return (
    <>
      {/* Desktop Navigation Top Bar / Sub-header */}
      <nav className="hidden lg:block bg-[#7f1d1d] text-[#E6E0D5] border-b border-[#7f1d1d] shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-reverse space-x-1 py-1.5 overflow-x-auto no-scrollbar">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-[#dc2626] text-white shadow-md shadow-[#dc2626]/30'
                        : 'text-[#C5BFC7] hover:text-white hover:bg-[#7f1d1d]'
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

            {/* Role indicator pill */}
            <div className="flex items-center gap-2 text-xs text-[#A8A295] bg-[#7f1d1d]/80 px-3 py-1 rounded-full border border-[#4E5348]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#9BB088]" />
              <span>دسترسی: <strong className="text-white">{currentUser ? (currentUser.role === 'manager' ? 'مدیر ارشد' : 'کارمند') : 'میهمان'}</strong></span>
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

          <div className="relative flex-1 max-w-xs w-full bg-[#7f1d1d] text-[#E6E0D5] p-5 flex flex-col justify-between shadow-2xl z-10 text-right">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#7f1d1d]">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-[#dc2626]">پرتال رویا طرح داخلی</span>
                  <span className="text-[11px] text-[#A8A295]">ROYA Surface Center</span>
                </div>
                <button
                  onClick={onCloseMobileNav}
                  className="p-1 rounded-lg text-[#A8A295] hover:text-white hover:bg-[#7f1d1d]"
                >
                  ✕
                </button>
              </div>

              {/* User Profile Mini Badge in Mobile Nav */}
              {currentUser ? (
                <div className="flex items-center gap-3 p-3 bg-[#7f1d1d]/80 rounded-xl mb-4 border border-[#4E5348]">
                  <img
                    src={currentUser.avatar || undefined}
                    alt={currentUser.firstName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-[#dc2626]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {currentUser.firstName} {currentUser.lastName}
                    </div>
                    <div className="text-[10px] text-[#A8A295] truncate">
                      {currentUser.position}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#7f1d1d]/80 rounded-xl mb-4 border border-[#4E5348] text-center">
                  <div className="text-xs font-bold text-white mb-2">حالت مشاهده میهمان</div>
                  <button
                    onClick={() => {
                      onCloseMobileNav();
                      openLoginModal('برای دسترسی به پنل همکاران وارد شوید.');
                    }}
                    className="w-full py-1.5 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    ورود به حساب
                  </button>
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
                          : 'text-[#C5BFC7] hover:text-white hover:bg-[#7f1d1d]'
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

            <div className="pt-4 border-t border-[#7f1d1d] text-[11px] text-[#A8A295] text-center">
              شرکت رویا طرح داخلی © 1403
            </div>
          </div>
        </div>
      )}
    </>
  );
};
