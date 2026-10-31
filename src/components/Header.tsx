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
  LogIn,
  MonitorSmartphone
} from 'lucide-react';
import { pop } from '../lib/feedback';

// Header drop-downs: full width under the header on phones, anchored to their button from sm up.
const popoverClass =
  'fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:left-0 sm:mt-2 bg-white rounded-2xl shadow-xl border border-line py-3 z-50 text-right';

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
    logoutEverywhere,
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
  // The red count gives one small hop when a new notification arrives (instead of blinking all the time).
  const badge = useRef<HTMLSpanElement>(null);
  const lastUnread = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > lastUnread.current) pop(badge.current);
    lastUnread.current = unreadCount;
  }, [unreadCount]);
  const userNotifications = notifications.slice(0, 20);

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-line shadow-2xs" dir="rtl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2 sm:gap-6">
            
            {/* Right Section: Mobile Toggle & Brand Logo */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={onToggleMobileNav}
                className="lg:hidden p-2 rounded-xl text-ink hover:bg-surface transition-colors cursor-pointer"
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
                className="w-full flex items-center justify-between px-4 py-2 bg-surface hover:bg-surface-strong border border-line rounded-2xl text-xs text-muted transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <Search className="w-4 h-4 text-brand-strong" />
                  <span>جستجوی سریع همکار، داخلی، سامانه، خبر...</span>
                </div>
                <kbd className="hidden lg:inline-flex items-center gap-1 text-xs font-mono bg-white px-2 py-0.5 rounded-lg border border-line-strong text-ink-soft">
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
                className="md:hidden p-2 rounded-xl text-ink hover:bg-surface transition-colors cursor-pointer"
                title="جستجو"
                aria-label="جستجو"
              >
                <Search className="w-5 h-5 text-ink-soft" />
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
                        className={`flex items-center gap-1.5 p-2 sm:px-3 rounded-xl border transition-colors cursor-pointer ${isAppsOpen ? 'bg-brand-soft border-red-300 text-brand-strong' : 'border-transparent sm:border-line text-ink hover:bg-surface'}`}
                      >
                        <LayoutGrid className="w-5 h-5 text-brand-strong" />
                        <span className="hidden sm:inline text-xs font-bold">سامانه‌ها</span>
                      </button>

                      {isAppsOpen && (
                        <div className={`${popoverClass} sm:w-80`}>
                          <div className="flex items-center justify-between px-4 pb-3 border-b border-line">
                            <span className="font-bold text-sm text-ink-strong flex items-center gap-2">
                              <LayoutGrid className="w-4 h-4 text-brand-strong" /> سامانه‌های سازمان
                            </span>
                            <span className="text-xs text-muted">در زبانهٔ جدید باز می‌شوند</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 p-3 max-h-[60dvh] overflow-y-auto overscroll-contain">
                            {systems.map((system) => (
                              <SystemTile key={system.id} system={system} onLaunch={() => setIsAppsOpen(false)} />
                            ))}
                          </div>
                          <div className="pt-2.5 px-4 border-t border-line text-center">
                            <button
                              onClick={() => { setActiveTab('systems'); setIsAppsOpen(false); }}
                              className="text-xs text-brand-strong font-bold hover:underline cursor-pointer py-1"
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
                      className="relative p-2 rounded-xl text-ink hover:bg-surface transition-colors cursor-pointer"
                      title="اعلان‌ها"
                      aria-label={`اعلان‌ها${unreadCount ? ` (${unreadCount} خوانده‌نشده)` : ''}`}
                      aria-expanded={isNotifOpen}
                    >
                      <Bell className="w-5 h-5 text-ink-soft" />
                      {unreadCount > 0 && (
                        <span ref={badge} className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-brand rounded-full">
                          {toPersianDigits(unreadCount > 99 ? '99+' : unreadCount)}
                        </span>
                      )}
                    </button>

                    {/* Notification Popover Panel */}
                    {isNotifOpen && (
                      <div className={`${popoverClass} sm:w-96`}>
                        <div className="flex items-center justify-between px-4 pb-3 border-b border-line">
                          <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-brand-strong" />
                            <span className="font-bold text-sm text-ink-strong">اعلان‌های من</span>
                            <span className="text-xs bg-surface text-brand-strong px-2 py-0.5 rounded-full font-bold">
                              {toPersianDigits(userNotifications.length)}
                            </span>
                          </div>
                          {unreadCount > 0 && (
                            <button
                              onClick={markAllNotificationsRead}
                              className="text-xs text-brand-strong hover:underline flex items-center gap-1 cursor-pointer font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>خواندن همه</span>
                            </button>
                          )}
                        </div>

                        <div className="max-h-[min(20rem,55dvh)] overflow-y-auto divide-y divide-surface">
                          {userNotifications.length === 0 ? (
                            <div className="py-8 text-center text-muted text-xs">
                              هیچ اعلان جدیدی وجود ندارد.
                            </div>
                          ) : (
                            userNotifications.map((notif) => (
                              <div
                                key={notif.id}
                                className={`p-3.5 hover:bg-surface-soft transition-colors ${!notif.isRead ? 'bg-brand-soft/60' : ''}`}
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
                                        <span className="w-2 h-2 rounded-full bg-brand inline-block"></span>
                                      )}
                                      <h4 className="text-xs font-bold text-ink-strong">{notif.title}</h4>
                                    </div>
                                    <p className="text-xs text-ink-soft leading-relaxed mb-1">{notif.message}</p>
                                    <span className="text-xs text-faint">{timeAgo(notif.date)}</span>
                                  </button>
                                  <button
                                    onClick={() => deleteNotification(notif.id)}
                                    className="text-faint hover:text-brand p-1 cursor-pointer"
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

                        <div className="pt-2.5 px-4 border-t border-line text-center">
                          <button
                            onClick={() => {
                              setActiveTab('notifications');
                              setIsNotifOpen(false);
                            }}
                            className="text-xs text-brand-strong font-bold hover:underline cursor-pointer py-1"
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
                      className="flex items-center gap-2.5 p-1 sm:p-1.5 sm:pl-2.5 rounded-2xl hover:bg-surface border border-transparent hover:border-line transition-all text-right cursor-pointer"
                    >
                      <Avatar
                        src={currentUser.avatar}
                        firstName={currentUser.firstName}
                        lastName={currentUser.lastName}
                        className="w-8 h-8 rounded-full border-2 border-brand-strong text-xs"
                      />
                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-bold text-ink-strong flex items-center gap-1.5">
                          <span>{currentUser.firstName} {currentUser.lastName}</span>
                          {/* Only the portal admin sees a chip; everyone else is described by position and unit. */}
                          {currentUser.role === 'admin' && (
                            <span className="text-xs px-1.5 rounded-full font-bold bg-brand-soft text-brand-strong border border-red-300">
                              {roleName(currentUser.role)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted truncate max-w-[150px]">
                          {[currentUser.position, currentUser.department].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-muted" />
                    </button>

                    {/* User Switcher Dropdown */}
                    {isUserMenuOpen && (
                      <div className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-line py-2 z-50 text-right">
                        <div className="px-4 py-2.5 border-b border-line">
                          <div className="text-xs text-ink-strong font-bold">
                            {currentUser.firstName} {currentUser.lastName}
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            {currentUser.extension ? `داخلی: ${currentUser.extension} | ` : ''}{currentUser.department}
                          </div>
                          <div className="text-xs text-muted mt-0.5">سطح دسترسی در پرتال: {roleName(currentUser.role)}</div>
                        </div>

                        <div className="p-1.5 space-y-0.5">
                          <button
                            onClick={() => {
                              setActiveTab('colleagues', currentUser.id);
                              setIsUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink hover:bg-surface rounded-xl transition-colors text-right cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4 text-muted" />
                            <span>پروفایل من در دایرکتوری</span>
                          </button>

                          <button
                            onClick={() => {
                              setIsEditProfileOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink hover:bg-surface rounded-xl transition-colors text-right cursor-pointer"
                          >
                            <UserPen className="w-4 h-4 text-muted" />
                            <span>ویرایش اطلاعات من</span>
                          </button>

                          {/* Active Directory accounts change their password in Windows. */}
                          {currentUser.authSource !== 'ldap' && (
                            <button
                              onClick={() => {
                                setIsPasswordOpen(true);
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink hover:bg-surface rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <KeyRound className="w-4 h-4 text-muted" />
                              <span>تغییر رمز عبور</span>
                            </button>
                          )}

                          {can('reports.view') && (
                            <button
                              onClick={() => {
                                setActiveTab('reports');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink hover:bg-surface rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <BarChart2 className="w-4 h-4 text-muted" />
                              <span>گزارش‌ها</span>
                            </button>
                          )}

                          {(isAdmin || can('settings.manage')) && (
                            <button
                              onClick={() => {
                                setActiveTab('admin');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink hover:bg-surface rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <Settings className="w-4 h-4 text-muted" />
                              <span>تنظیمات پرتال</span>
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => {
                                setActiveTab('audit');
                                setIsUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink hover:bg-surface rounded-xl transition-colors text-right cursor-pointer"
                            >
                              <History className="w-4 h-4 text-muted" />
                              <span>تاریخچهٔ تغییرات</span>
                            </button>
                          )}
                          
                          <div className="my-1 border-t border-line"></div>

                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              logout();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand hover:bg-brand-soft rounded-xl transition-colors text-right font-bold cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4 text-brand" />
                            <span>خروج از حساب</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              void logoutEverywhere();
                            }}
                            title="برای وقتی که گوشی گم شده یا روی کامپیوتر دیگری وارد مانده‌اید"
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted hover:bg-brand-soft rounded-xl transition-colors text-right cursor-pointer"
                          >
                            <MonitorSmartphone className="w-4 h-4 text-muted" />
                            <span>خروج از همهٔ دستگاه‌ها</span>
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-strong hover:bg-brand-deep text-white text-xs font-bold transition-colors cursor-pointer"
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
