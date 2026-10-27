import React, { useState, useEffect, useRef } from 'react';
import { usePortal } from '../context/PortalContext';
import { RoyaLogo } from './common/RoyaLogo';
import { CommandPalette } from './common/CommandPalette';
import { Avatar } from './common/Avatar';
import { ChangePasswordModal } from './ChangePasswordModal';
import { EditProfileModal } from './colleagues/EditProfileModal';
import { SystemTile } from './dashboard/QuickSystemsWidget';
import { timeAgo, toPersianDigits } from '../lib/jalali';
import { useEscapeKey } from '../lib/useEscapeKey';
import {
  Search,
  Bell,
  UserCheck,
  Menu,
  X,
  ChevronDown,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
  Trash2,
  BarChart2,
  History,
  Settings,
  LayoutGrid,
  UserPen,
  LogIn
} from 'lucide-react';

// Header drop-downs: full width under the header on phones, anchored to their button from sm up.
const popoverClass =
  'fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:left-0 sm:mt-2 bg-white rounded-2xl shadow-xl border border-[#EAE6DF] py-3 z-50 text-right';

interface HeaderProps {
  onToggleMobileNav: () => void;
  isMobileNavOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav, isMobileNavOpen }) => {
  const {
    currentUser,
    isLoggedIn,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    setActiveTab,
    logout,
    appSettings,
    isGuest,
    requestLogin,
    can,
    isAdmin,
    roleName
  } = usePortal();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const closeMenus = () => {
    setIsNotifOpen(false);
    setIsUserMenuOpen(false);
    setIsAppsOpen(false);
  };
  useEscapeKey(closeMenus, isNotifOpen || isUserMenuOpen || isAppsOpen);
  const headerRef = useRef<HTMLElement>(null);
  const anyMenuOpen = isNotifOpen || isUserMenuOpen || isAppsOpen;
  useEffect(() => {
    if (!anyMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) closeMenus();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anyMenuOpen]);
  const systems = appSettings?.systems ?? [];

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

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const userNotifications = notifications.slice(0, 20);

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#EAE6DF] shadow-2xs" dir="rtl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2 sm:gap-6">
            
            {/* Right Section: Mobile Toggle & Brand Logo */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
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
            <div className="flex items-center gap-0.5 sm:gap-3 shrink-0">
              
              {/* Mobile Search Button */}
              <button
                type="button"
                onClick={() => setIsCmdPaletteOpen(true)}
                className="md:hidden p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED] transition-colors cursor-pointer"
                title="جستجو"
                aria-label="جستجو"
              >
                <Search className="w-5 h-5 text-[#605C54]" />
              </button>

              {isLoggedIn && currentUser ? (
                <>
                  {/* Organisation apps launcher: reachable from every page without scrolling */}
                  {systems.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { const next = !isAppsOpen; closeMenus(); setIsAppsOpen(next); }}
                        aria-expanded={isAppsOpen}
                        aria-haspopup="true"
                        title="سامانه‌های سازمان"
                        className={`flex items-center gap-1.5 p-2 sm:px-3 rounded-xl border transition-colors cursor-pointer ${isAppsOpen ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991b1b]' : 'border-transparent sm:border-[#EAE6DF] text-[#2D2D2D] hover:bg-[#F5F2ED]'}`}
                      >
                        <LayoutGrid className="w-5 h-5 text-[#991b1b]" />
                        <span className="hidden sm:inline text-xs font-bold">سامانه‌ها</span>
                      </button>

                      {isAppsOpen && (
                        <div className={`${popoverClass} sm:w-80`}>
                          <div className="flex items-center justify-between px-4 pb-3 border-b border-[#EAE6DF]">
                            <span className="font-bold text-sm text-[#1E1E1E] flex items-center gap-2">
                              <LayoutGrid className="w-4 h-4 text-[#991b1b]" /> سامانه‌های سازمان
                            </span>
                            <span className="text-[10px] text-[#7A756D]">در زبانهٔ جدید باز می‌شوند</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 p-3 max-h-[60dvh] overflow-y-auto overscroll-contain">
                            {systems.map((system) => (
                              <SystemTile key={system.id} system={system} onLaunch={() => setIsAppsOpen(false)} />
                            ))}
                          </div>
                          <div className="pt-2.5 px-4 border-t border-[#EAE6DF] text-center">
                            <button
                              onClick={() => { setActiveTab('systems'); setIsAppsOpen(false); }}
                              className="text-xs text-[#991b1b] font-bold hover:underline cursor-pointer py-1"
                            >
                              {can('systems.manage') ? 'مدیریت و ویرایش سامانه‌ها' : 'مشاهده صفحه سامانه‌ها'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notification Bell Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { const next = !isNotifOpen; closeMenus(); setIsNotifOpen(next); }}
                      className="relative p-2 rounded-xl text-[#2D2D2D] hover:bg-[#F5F2ED] transition-colors cursor-pointer"
                      title="اعلان‌ها"
                      aria-label={`اعلان‌ها${unreadCount ? ` (${unreadCount} خوانده‌نشده)` : ''}`}
                      aria-expanded={isNotifOpen}
                    >
                      <Bell className="w-5 h-5 text-[#4B4740]" />
                      {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-[#dc2626] rounded-full animate-pulse">
                          {toPersianDigits(unreadCount > 99 ? '99+' : unreadCount)}
                        </span>
                      )}
                    </button>

                    {/* Notification Popover Panel */}
                    {isNotifOpen && (
                      <div className={`${popoverClass} sm:w-96`}>
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

                        <div className="max-h-[min(20rem,55dvh)] overflow-y-auto divide-y divide-[#F5F2ED]">
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
                                  <button
                                    type="button"
                                    onClick={() => {
                                      markNotificationRead(notif.id);
                                      if (notif.linkTab) setActiveTab(notif.linkTab, notif.linkId);
                                      setIsNotifOpen(false);
                                    }}
                                    className="cursor-pointer flex-1 text-right"
                                  >
                                    <div className="flex items-center gap-1.5 mb-1">
                                      {!notif.isRead && (
                                        <span className="w-2 h-2 rounded-full bg-[#dc2626] inline-block"></span>
                                      )}
                                      <h4 className="text-xs font-bold text-[#1E1E1E]">{notif.title}</h4>
                                    </div>
                                    <p className="text-xs text-[#605C54] leading-relaxed mb-1">{notif.message}</p>
                                    <span className="text-[10px] text-[#9C968B]">{timeAgo(notif.date)}</span>
                                  </button>
                                  <button
                                    onClick={() => deleteNotification(notif.id)}
                                    className="text-[#9C968B] hover:text-[#dc2626] p-1 cursor-pointer"
                                    title="حذف"
                                    aria-label="حذف اعلان"
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
                      onClick={() => { const next = !isUserMenuOpen; closeMenus(); setIsUserMenuOpen(next); }}
                      aria-expanded={isUserMenuOpen}
                      aria-label="منوی حساب کاربری"
                      className="flex items-center gap-2.5 p-1 sm:p-1.5 sm:pl-2.5 rounded-2xl hover:bg-[#F5F2ED] border border-transparent hover:border-[#EAE6DF] transition-all text-right cursor-pointer"
                    >
                      <Avatar
                        src={currentUser.avatar}
                        firstName={currentUser.firstName}
                        lastName={currentUser.lastName}
                        className="w-8 h-8 rounded-full border-2 border-[#991b1b] text-[11px]"
                      />
                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-bold text-[#1E1E1E] flex items-center gap-1.5">
                          <span>{currentUser.firstName} {currentUser.lastName}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                            currentUser.role !== 'employee'
                              ? 'bg-[#FEF2F2] text-[#991b1b] border border-[#FCA5A5]' 
                              : 'bg-[#F5F2ED] text-[#605C54]'
                          }`}>
                            {roleName(currentUser.role)}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#7A756D] truncate max-w-[130px]">
                          {currentUser.position}
                        </div>
                      </div>
                      <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-[#7A756D]" />
                    </button>

                    {/* User Switcher Dropdown */}
                    {isUserMenuOpen && (
                      <div className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-[#EAE6DF] py-2 z-50 text-right">
                        <div className="px-4 py-2.5 border-b border-[#EAE6DF]">
                          <div className="text-xs text-[#1E1E1E] font-bold">
                            {currentUser.firstName} {currentUser.lastName}
                          </div>
                          <div className="text-[10px] text-[#7A756D] mt-0.5">
                            {currentUser.extension ? `داخلی: ${currentUser.extension} | ` : ''}{currentUser.department}
                          </div>
                        </div>

                        <div className="p-1.5 space-y-0.5">
                          <button
                            onClick={() => {
                              setActiveTab('colleagues', currentUser.id);
                              setIsUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4 text-[#7A756D]" />
                            <span>پروفایل من در دایرکتوری</span>
                          </button>

                          <button
                            onClick={() => {
                              setIsEditProfileOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                          >
                            <UserPen className="w-4 h-4 text-[#7A756D]" />
                            <span>ویرایش اطلاعات من</span>
                          </button>

                          {/* Active Directory accounts change their password in Windows. */}
                          {currentUser.authSource !== 'ldap' && (
                            <button
                              onClick={() => {
                                setIsPasswordOpen(true);
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <KeyRound className="w-4 h-4 text-[#7A756D]" />
                              <span>تغییر رمز عبور</span>
                            </button>
                          )}

                          {can('reports.view') && (
                            <button
                              onClick={() => {
                                setActiveTab('reports');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <BarChart2 className="w-4 h-4 text-[#7A756D]" />
                              <span>گزارش‌ها</span>
                            </button>
                          )}

                          {(isAdmin || can('settings.manage')) && (
                            <button
                              onClick={() => {
                                setActiveTab('admin');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <Settings className="w-4 h-4 text-[#7A756D]" />
                              <span>تنظیمات پرتال</span>
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => {
                                setActiveTab('audit');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#2D2D2D] hover:bg-[#F5F2ED] rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <History className="w-4 h-4 text-[#7A756D]" />
                              <span>تاریخچهٔ تغییرات</span>
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
              ) : isGuest ? (
                <button
                  type="button"
                  onClick={() => requestLogin()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>ورود</span>
                </button>
              ) : null}

            </div>

          </div>
        </div>
      </header>

      {/* Command Palette Modal Component */}
      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setIsCmdPaletteOpen(false)}
      />
      {isPasswordOpen && <ChangePasswordModal onClose={() => setIsPasswordOpen(false)} />}
      {isEditProfileOpen && currentUser && <EditProfileModal user={currentUser} onClose={() => setIsEditProfileOpen(false)} />}
    </>
  );
};
