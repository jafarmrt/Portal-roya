import React, { useState, useEffect } from 'react';
import { usePortal } from '../context/PortalContext';
import { RoyaLogo } from './common/RoyaLogo';
import { CommandPalette } from './common/CommandPalette';
import {
  Search,
  Bell,
  UserCheck,
  Menu,
  X,
  ChevronDown,
  ShieldAlert,
  LogIn,
  CheckCircle2,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileNav: () => void;
  isMobileNavOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav, isMobileNavOpen }) => {
  const {
    currentUser,
    isLoggedIn,
    openLoginModal,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    setActiveTab,
    logout
  } = usePortal();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadCount = isLoggedIn && currentUser
    ? notifications.filter(n => !n.isRead && (n.targetUserId === 'all' || n.targetUserId === currentUser.id)).length
    : 0;

  const userNotifications = isLoggedIn && currentUser
    ? notifications.filter(n => n.targetUserId === 'all' || n.targetUserId === currentUser.id)
    : [];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#EAE6DF] shadow-2xs" dir="rtl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3 sm:gap-6">
            
            {/* Right Section: Mobile Toggle & Brand Logo */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onToggleMobileNav}
                className="lg:hidden p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED] transition-colors cursor-pointer"
                aria-label="تغییر منوی همراه"
              >
                {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              <button 
                onClick={() => setActiveTab('dashboard')}
                className="text-right focus:outline-hidden cursor-pointer"
                title="صفحه اصلی پرتال"
              >
                <RoyaLogo size="md" />
              </button>
            </div>

            {/* Middle Section: Quick Search Bar / Command Palette Trigger */}
            <div className="flex-1 max-w-md hidden md:block">
              <button
                type="button"
                onClick={() => setIsCmdPaletteOpen(true)}
                className="w-full flex items-center justify-between px-4 py-2 bg-[#F5F2ED] hover:bg-[#EFECE6] border border-[#EAE6DF] rounded-2xl text-xs text-[#7A756D] transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <Search className="w-4 h-4 text-[#991b1b]" />
                  <span>جستجوی سریع همکار، داخلی، سامانه، خبر...</span>
                </div>
                <kbd className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono bg-white px-2 py-0.5 rounded-lg border border-[#D9D4CB] text-[#605C54]">
                  <span>Ctrl</span><span>K</span>
                </kbd>
              </button>
            </div>

            {/* Left Section: Mobile Search, Notifications, User Status */}
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Mobile Search Button */}
              <button
                type="button"
                onClick={() => setIsCmdPaletteOpen(true)}
                className="md:hidden p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED] transition-colors cursor-pointer"
                title="جستجو"
              >
                <Search className="w-5 h-5 text-[#605C54]" />
              </button>

              {isLoggedIn && currentUser ? (
                <>
                  {/* Notification Bell Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsNotifOpen(!isNotifOpen)}
                      className="relative p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED] transition-colors cursor-pointer"
                      title="اعلان‌ها"
                    >
                      <Bell className="w-5 h-5 text-[#4B4740]" />
                      {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-[#dc2626] rounded-full animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </button>

                    {/* Notification Popover Panel */}
                    {isNotifOpen && (
                      <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-[#EAE6DF] py-3 z-50 text-right animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="flex items-center justify-between px-4 pb-3 border-b border-[#EAE6DF]">
                          <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-[#991b1b]" />
                            <span className="font-bold text-sm text-[#1E1E1E]">اعلان‌های من</span>
                            <span className="text-[11px] bg-[#F5F2ED] text-[#991b1b] px-2 py-0.5 rounded-full font-bold">
                              {userNotifications.length}
                            </span>
                          </div>
                          {unreadCount > 0 && (
                            <button
                              onClick={markAllNotificationsRead}
                              className="text-xs text-[#991b1b] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>خواندن همه</span>
                            </button>
                          )}
                        </div>

                        <div className="max-h-80 overflow-y-auto divide-y divide-[#F5F2ED]">
                          {userNotifications.length === 0 ? (
                            <div className="py-8 text-center text-[#7A756D] text-xs">
                              هیچ اعلان جدیدی وجود ندارد.
                            </div>
                          ) : (
                            userNotifications.map((notif) => (
                              <div
                                key={notif.id}
                                className={`p-3.5 hover:bg-[#F9F7F4] transition-colors ${!notif.isRead ? 'bg-[#FEF2F2]/60' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div 
                                    onClick={() => {
                                      markNotificationRead(notif.id);
                                      if (notif.linkTab) setActiveTab(notif.linkTab as any);
                                      setIsNotifOpen(false);
                                    }}
                                    className="cursor-pointer flex-1"
                                  >
                                    <div className="flex items-center gap-1.5 mb-1">
                                      {!notif.isRead && (
                                        <span className="w-2 h-2 rounded-full bg-[#dc2626] inline-block"></span>
                                      )}
                                      <h4 className="text-xs font-bold text-[#1E1E1E]">{notif.title}</h4>
                                    </div>
                                    <p className="text-xs text-[#605C54] leading-relaxed mb-1">{notif.message}</p>
                                    <span className="text-[10px] text-[#9C968B]">{notif.date}</span>
                                  </div>
                                  <button
                                    onClick={() => deleteNotification(notif.id)}
                                    className="text-[#9C968B] hover:text-[#dc2626] p-1 cursor-pointer"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="pt-2.5 px-4 border-t border-[#EAE6DF] text-center">
                          <button
                            onClick={() => {
                              setActiveTab('notifications');
                              setIsNotifOpen(false);
                            }}
                            className="text-xs text-[#991b1b] font-bold hover:underline cursor-pointer py-1"
                          >
                            مشاهده تمام اعلان‌ها در صندوق ورودی
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User Profile / Role Switcher Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-2xl hover:bg-[#F5F2ED] border border-transparent hover:border-[#EAE6DF] transition-all text-right cursor-pointer"
                    >
                      <img
                        src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                        alt={currentUser.firstName}
                        className="w-8 h-8 rounded-full object-cover border-2 border-[#991b1b]"
                      />
                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-bold text-[#1E1E1E] flex items-center gap-1.5">
                          <span>{currentUser.firstName} {currentUser.lastName}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                            currentUser.role === 'manager' 
                              ? 'bg-[#FEF2F2] text-[#991b1b] border border-[#FCA5A5]' 
                              : 'bg-[#F5F2ED] text-[#605C54]'
                          }`}>
                            {currentUser.role === 'manager' ? 'مدیر ارشد' : 'کارمند'}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#7A756D] truncate max-w-[130px]">
                          {currentUser.position}
                        </div>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-[#7A756D]" />
                    </button>

                    {/* User Switcher Dropdown */}
                    {isUserMenuOpen && (
                      <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-[#EAE6DF] py-2 z-50 text-right animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="px-4 py-2.5 border-b border-[#EAE6DF]">
                          <div className="text-xs text-[#1E1E1E] font-bold">
                            {currentUser.firstName} {currentUser.lastName}
                          </div>
                          <div className="text-[10px] text-[#7A756D] mt-0.5">
                            داخلی: {currentUser.extension} | {currentUser.department}
                          </div>
                        </div>

                        <div className="p-1.5 space-y-0.5">
                          <button
                            onClick={() => {
                              setActiveTab('colleagues');
                              setIsUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4 text-[#7A756D]" />
                            <span>پروفایل من در دایرکتوری</span>
                          </button>

                          {currentUser.role === 'manager' && (
                            <button
                              onClick={() => {
                                setActiveTab('reports');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <SlidersHorizontal className="w-4 h-4 text-[#7A756D]" />
                              <span>پنل گزارشات تحلیلی</span>
                            </button>
                          )}
                          
                          <div className="my-1 border-t border-[#EAE6DF]"></div>

                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              logout();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#DC2626] hover:bg-[#FEF2F2] rounded-xl transition-colors text-right font-bold cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
                            <span>خروج از حساب</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Guest Mode Section */
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-[#F5F2ED] text-[#7A756D] border border-[#EAE6DF]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>حالت مشاهده میهمان</span>
                  </span>

                  <button
                    id="header-login-btn"
                    onClick={() => openLoginModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#991b1b] hover:bg-[#7f1d1d] active:bg-[#6b1414] text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>ورود به حساب</span>
                  </button>
                </div>
              )}

            </div>

          </div>
        </div>
      </header>

      {/* Command Palette Modal Component */}
      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setIsCmdPaletteOpen(false)}
      />
    </>
  );
};
