import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { ActiveTab } from '../types';
import { Avatar } from './common/Avatar';
import { currentJalaliYear, toPersianDigits, todayJalali } from '../lib/jalali';
import { useEscapeKey } from '../lib/useEscapeKey';
import {
  LayoutDashboard,
  Vote,
  Users,
  Newspaper,
  GraduationCap,
  Calendar,
  History,
  Settings,
  BarChart2,
  FolderOpen,
  Network,
  LayoutGrid,
  LogIn,
  UserCog,
  ChevronDown,
  Contact,
  ShieldCheck,
  Building2,
  LifeBuoy,
  Library,
  MessageSquareText,
  NotebookPen,
} from 'lucide-react';
import { unreadTotal, useSuggestionSummary } from '../lib/suggestionSummary';
import { tabLabelBadge, tabOn } from '../lib/features';

interface NavigationProps {
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeColor?: string;
  /** On narrower desktop screens only the icon is shown, so the bar stays on one line. */
  compact?: boolean;
}

/** A desktop menu entry: a page, or a drop-down of related pages. */
type NavEntry = { kind: 'item'; item: NavItem } | { kind: 'group'; id: string; label: string; icon: React.ReactNode; items: NavItem[] };

const desktopButtonClass = (isActive: boolean) =>
  `flex items-center gap-2 px-3 xl:px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
    isActive ? 'bg-[#dc2626] text-white shadow-md shadow-[#dc2626]/30' : 'text-[#C5BFC7] hover:text-white hover:bg-white/10'
  }`;

const Badge: React.FC<{ item: NavItem; className: string }> = ({ item, className }) =>
  item.badge === undefined ? null : (
    <span className={`${className} rounded-full font-bold ${item.badgeColor || 'bg-[#7f1d1d] text-[#E6E0D5]'}`}>{item.badge}</span>
  );

/** Desktop drop-down that groups related pages ("همکاران", "مدیریت") so the bar never overflows. */
const NavGroup: React.FC<{ entry: Extract<NavEntry, { kind: 'group' }>; activeTab: ActiveTab; onSelect: (tab: ActiveTab) => void }> = ({
  entry,
  activeTab,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEscapeKey(close, open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const active = entry.items.find((i) => i.id === activeTab);
  // A closed group still shows that something inside it waits for this person.
  const groupBadge = entry.items.find((i) => i.badge !== undefined);
  const menuId = `nav-group-${entry.id}`;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-current={active ? 'page' : undefined}
        className={desktopButtonClass(Boolean(active))}
      >
        {active?.icon ?? entry.icon}
        <span>{active ? active.label : entry.label}</span>
        {groupBadge && <Badge item={groupBadge} className="text-[10px] px-1.5 py-0.2" />}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute top-full right-0 mt-1.5 min-w-48 bg-white rounded-2xl shadow-xl border border-[#EAE6DF] p-1.5 z-50 text-right">
          {entry.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(item.id);
              }}
              aria-current={item.id === activeTab ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                item.id === activeTab ? 'bg-[#fef2f2] text-[#991b1b]' : 'text-[#2D2D2D] hover:bg-[#F5F2ED]'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-right">{item.label}</span>
              <Badge item={item} className="text-[10px] px-1.5 py-0.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Navigation: React.FC<NavigationProps> = ({ isMobileNavOpen, onCloseMobileNav }) => {
  const { activeTab, setActiveTab, currentUser, isGuest, requestLogin, appSettings, can, isAdmin, polls, news, documents: portalDocuments, todos, featureOn } = usePortal();
  useEscapeKey(onCloseMobileNav, isMobileNavOpen);

  // Read/vote badges are personal, so guests don't get them.
  const activePollsCount = isGuest ? 0 : polls.filter(p => p.isActive && p.forMe && !p.hasVoted).length;
  const unreadNewsCount = isGuest ? 0 : news.filter(n => n.status === 'published' && !n.isRead).length;
  const pendingAckCount = isGuest ? 0 : news.filter(n => n.status === 'published' && n.requiresAck && !n.acknowledgedAt).length;
  const pendingDocumentCount = isGuest ? 0 : portalDocuments.filter(d => d.requiresAck && d.forMe && !d.acknowledgedAt).length;

  const suggestionUnread = unreadTotal(useSuggestionSummary());
  // The person's own notes due today or overdue, so they are remembered without opening the dashboard.
  const today = todayJalali();
  const dueTodoCount = isGuest || !featureOn('todos') ? 0 : todos.filter(t => !t.doneAt && t.dueDate !== null && t.dueDate <= today).length;

  const dashboard: NavItem = {
    id: 'dashboard',
    label: 'داشبورد',
    icon: <LayoutDashboard className="w-4 h-4" />,
    badge: dueTodoCount > 0 ? `${toPersianDigits(dueTodoCount)} کار` : undefined,
    badgeColor: 'bg-sky-200 text-sky-950'
  };
  const systems: NavItem = { id: 'systems', label: 'سامانه‌ها', icon: <LayoutGrid className="w-4 h-4" /> };
  const pollsItem: NavItem = {
    id: 'polls',
    label: 'نظرسنجی‌ها',
    icon: <Vote className="w-4 h-4" />,
    badge: activePollsCount > 0 ? `${toPersianDigits(activePollsCount)} جدید` : undefined,
    badgeColor: 'bg-[#991b1b]/30 text-[#E6E0D5]'
  };
  const newsItem: NavItem = {
    id: 'news',
    label: 'اخبار و اطلاعیه‌ها',
    icon: <Newspaper className="w-4 h-4" />,
    badge: pendingAckCount > 0
      ? `${toPersianDigits(pendingAckCount)} بخشنامه`
      : unreadNewsCount > 0 ? `${toPersianDigits(unreadNewsCount)} نخوانده` : undefined,
    badgeColor: pendingAckCount > 0 ? 'bg-amber-400 text-amber-950' : 'bg-[#991b1b]/30 text-[#E6E0D5]'
  };
  const documents: NavItem = {
    id: 'documents',
    label: 'اسناد و فرم‌ها',
    icon: <FolderOpen className="w-4 h-4" />,
    badge: pendingDocumentCount > 0 ? `${toPersianDigits(pendingDocumentCount)} لازم‌الاجرا` : undefined,
    badgeColor: 'bg-amber-400 text-amber-950'
  };
  const guides: NavItem = { id: 'guides', label: 'راهنماها و پرسش‌های رایج', icon: <LifeBuoy className="w-4 h-4" /> };
  const training: NavItem = { id: 'training', label: 'آموزش', icon: <GraduationCap className="w-4 h-4" /> };
  const calendar: NavItem = { id: 'calendar', label: 'تقویم', icon: <Calendar className="w-4 h-4" /> };
  // The person's own notes; guests have none.
  const todosItem: NavItem[] = isGuest
    ? []
    : [{ id: 'todos', label: 'یادداشت‌های من', icon: <NotebookPen className="w-4 h-4" />, compact: true }];
  // Guests can't send, so the boxes are only in the menu of signed-in colleagues.
  const suggestions: NavItem[] = isGuest
    ? []
    : [{
        id: 'suggestions',
        label: 'انتقادات و پیشنهادات',
        icon: <MessageSquareText className="w-4 h-4" />,
        badge: suggestionUnread > 0 ? `${toPersianDigits(suggestionUnread)} تازه` : undefined,
        badgeColor: 'bg-amber-400 text-amber-950',
        compact: true
      }];

  // The phone book and org chart stay hidden from guests unless a manager opened them.
  const colleagueItems: NavItem[] =
    isGuest && !appSettings?.guestDirectory
      ? []
      : [
          { id: 'colleagues', label: 'دفتر تلفن', icon: <Users className="w-4 h-4" /> },
          { id: 'orgchart', label: 'چارت سازمانی', icon: <Network className="w-4 h-4" /> },
          { id: 'departments', label: 'واحدها', icon: <Building2 className="w-4 h-4" /> },
        ];

  // Parts an administrator keeps hidden until they are introduced are left out; newly introduced or
  // preview ones say so next to their name.
  const shown = (items: NavItem[]): NavItem[] =>
    items
      .filter((item) => tabOn(appSettings, item.id))
      .map((item) => {
        const mark = tabLabelBadge(appSettings, item.id);
        if (!mark || item.badge) return item;
        return mark === 'new'
          ? { ...item, badge: 'جدید', badgeColor: 'bg-emerald-300 text-emerald-950' }
          : { ...item, badge: 'پیش‌نمایش', badgeColor: 'bg-white/25 text-white' };
      });

  const adminItems: NavItem[] = [];
  if (can('users.manage')) adminItems.push({ id: 'people', label: 'مدیریت کارکنان', icon: <UserCog className="w-4 h-4" /> });
  if (can('reports.view')) adminItems.push({ id: 'reports', label: 'گزارش‌ها', icon: <BarChart2 className="w-4 h-4" /> });
  if (isAdmin || can('settings.manage')) adminItems.push({ id: 'admin', label: 'تنظیمات', icon: <Settings className="w-4 h-4" /> });
  if (isAdmin) adminItems.push({ id: 'audit', label: 'تاریخچهٔ تغییرات', icon: <History className="w-4 h-4" /> });

  // Desktop bar: the org apps already have their own "سامانه‌ها" button in the header, and related
  // pages share a drop-down, so every entry fits on one line even for admins.
  const groupOrItem = (id: string, label: string, icon: React.ReactNode, items: NavItem[]): NavEntry[] =>
    items.length === 0 ? [] : items.length === 1 ? [{ kind: 'item', item: items[0] }] : [{ kind: 'group', id, label, icon, items }];
  const desktopEntries: NavEntry[] = [
    { kind: 'item', item: dashboard },
    { kind: 'item', item: newsItem },
    ...shown([pollsItem]).map((item): NavEntry => ({ kind: 'item', item })),
    ...groupOrItem('library', 'اسناد و راهنماها', <Library className="w-4 h-4" />, shown([documents, guides])),
    ...groupOrItem('colleagues', 'همکاران', <Contact className="w-4 h-4" />, shown(colleagueItems)),
    ...shown([training]).map((item): NavEntry => ({ kind: 'item', item })),
    { kind: 'item', item: calendar },
    ...shown(todosItem).map((item): NavEntry => ({ kind: 'item', item })),
    ...shown(suggestions).map((item): NavEntry => ({ kind: 'item', item })),
    ...groupOrItem('admin', 'مدیریت', <ShieldCheck className="w-4 h-4" />, adminItems),
  ];

  // The phone drawer has room for everything, with management pages under their own heading.
  const mobileSections: { title?: string; items: NavItem[] }[] = [
    { items: shown([dashboard, systems, newsItem, pollsItem, documents, guides, ...colleagueItems, training, calendar, ...todosItem, ...suggestions]) },
    ...(adminItems.length > 0 ? [{ title: 'مدیریت', items: adminItems }] : []),
  ];

  return (
    <>
      {/* Desktop Navigation Top Bar / Sub-header */}
      <nav className="hidden lg:block bg-[#7f1d1d] text-[#E6E0D5] border-b border-[#7f1d1d] shadow-inner relative z-30" aria-label="منوی اصلی">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 py-1.5">
            {desktopEntries.map((entry) => {
              if (entry.kind === 'group') {
                return <NavGroup key={entry.id} entry={entry} activeTab={activeTab} onSelect={(tab) => setActiveTab(tab)} />;
              }
              const { item } = entry;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.compact ? item.label : undefined}
                  title={item.compact ? item.label : undefined}
                  className={desktopButtonClass(isActive)}
                >
                  {item.icon}
                  <span className={item.compact ? 'hidden xl:inline' : undefined}>{item.label}</span>
                  <Badge item={item} className="text-[10px] px-1.5 py-0.2" />
                </button>
              );
            })}
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
              {mobileSections.map((section, index) => (
                <div key={section.title ?? index} className={index > 0 ? 'mt-4 pt-4 border-t border-white/10' : ''}>
                  {section.title && <div className="px-3.5 pb-2 text-[11px] font-bold text-[#E6E0D5]/70">{section.title}</div>}
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            onCloseMobileNav();
                          }}
                          aria-current={isActive ? 'page' : undefined}
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
                          <Badge item={item} className="text-[10px] px-2 py-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
