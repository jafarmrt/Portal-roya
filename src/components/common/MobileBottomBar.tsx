import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { LayoutDashboard, ExternalLink, Users, Newspaper, User, LogIn } from 'lucide-react';
import { ActiveTab } from '../../types';

export const MobileBottomBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isLoggedIn,
    currentUser,
    openLoginModal
  } = usePortal();

  const navButtons: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'داشبورد', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'systems', label: 'سامانه‌ها', icon: <ExternalLink className="w-5 h-5" /> },
    { id: 'colleagues', label: 'همکاران', icon: <Users className="w-5 h-5" /> },
    { id: 'news', label: 'اخبار', icon: <Newspaper className="w-5 h-5" /> },
  ];

  return (
    <nav
      id="mobile-bottom-nav"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EAE6DF] shadow-lg px-2 py-1.5"
      dir="rtl"
    >
      <div className="flex items-center justify-around">
        {navButtons.map((btn) => {
          const isActive = activeTab === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setActiveTab(btn.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-[#991b1b] font-bold scale-105'
                  : 'text-[#7A756D] hover:text-[#1E1E1E]'
              }`}
            >
              <div className={`p-1 rounded-lg ${isActive ? 'bg-[#991b1b]/10' : ''}`}>
                {btn.icon}
              </div>
              <span className="text-[10px] mt-0.5">{btn.label}</span>
            </button>
          );
        })}

        {/* Auth / Profile action */}
        {isLoggedIn ? (
          <button
            onClick={() => setActiveTab('colleagues')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              activeTab === 'colleagues' ? 'text-[#991b1b] font-bold' : 'text-[#7A756D]'
            }`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden border border-[#991b1b]">
              <img
                src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                alt={currentUser?.firstName || 'حساب کاربری'}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[10px] mt-0.5">پروفایل</span>
          </button>
        ) : (
          <button
            onClick={() => openLoginModal('برای ورود به حساب کاربری، مشخصات خود را وارد کنید.')}
            className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[#991b1b] font-bold"
          >
            <div className="p-1 rounded-lg bg-[#991b1b]/10">
              <LogIn className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">ورود</span>
          </button>
        )}
      </div>
    </nav>
  );
};
