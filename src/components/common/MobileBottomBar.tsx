import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { LayoutDashboard, ExternalLink, Users, Newspaper, Calendar, LogIn } from 'lucide-react';
import { ActiveTab } from '../../types';
import { Avatar } from './Avatar';

export const MobileBottomBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    isGuest,
    requestLogin,
    appSettings
  } = usePortal();
  const directoryHidden = isGuest && !appSettings?.guestDirectory;

  const navButtons: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'داشبورد', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'systems', label: 'سامانه‌ها', icon: <ExternalLink className="w-5 h-5" /> },
    directoryHidden
      ? { id: 'calendar', label: 'تقویم', icon: <Calendar className="w-5 h-5" /> }
      : { id: 'colleagues', label: 'همکاران', icon: <Users className="w-5 h-5" /> },
    { id: 'news', label: 'اخبار', icon: <Newspaper className="w-5 h-5" /> },
  ];

  return (
    <nav
      id="mobile-bottom-nav"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-line shadow-lg px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      dir="rtl"
    >
      <div className="flex items-stretch justify-around">
        {navButtons.map((btn) => {
          const isActive = activeTab === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setActiveTab(btn.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center min-h-12 py-1 px-1 rounded-xl transition-all ${
                isActive
                  ? 'text-brand-strong font-bold scale-105'
                  : 'text-muted hover:text-ink-strong'
              }`}
            >
              <div className={`p-1 rounded-lg ${isActive ? 'bg-brand-strong/10' : ''}`}>
                {btn.icon}
              </div>
              <span className="text-xs mt-0.5">{btn.label}</span>
            </button>
          );
        })}

        {isGuest && (
          <button
            onClick={() => requestLogin()}
            className="flex-1 min-w-0 flex flex-col items-center justify-center min-h-12 py-1 px-1 rounded-xl transition-all text-brand-strong font-bold"
          >
            <div className="p-1 rounded-lg"><LogIn className="w-5 h-5" /></div>
            <span className="text-xs mt-0.5">ورود</span>
          </button>
        )}

        {currentUser && (
          <button
            onClick={() => setActiveTab('colleagues', currentUser.id)}
            className="flex-1 min-w-0 flex flex-col items-center justify-center min-h-12 py-1 px-1 rounded-xl transition-all text-muted"
          >
            <Avatar src={currentUser.avatar} firstName={currentUser.firstName} lastName={currentUser.lastName} className="w-6 h-6 rounded-full border border-brand-strong text-[9px]" />
            <span className="text-xs mt-0.5">پروفایل</span>
          </button>
        )}
      </div>
    </nav>
  );
};
