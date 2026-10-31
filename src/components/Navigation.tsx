import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  Ellipsis,
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

/** A section of a desktop drop-down; only the «بیشتر» menu gives its sections a title. */
interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * A desktop menu entry: a page, or a drop-down of related pages. The «بیشتر» drop-down (more) keeps its
 * own name and shows a dot for waiting items, so its width does not change with what is inside it.
 */
type NavGroupEntry = { kind: 'group'; id: string; label: string; icon: React.ReactNode; sections: NavSection[]; more?: boolean };
type NavEntry = { kind: 'item'; item: NavItem } | NavGroupEntry;

const GAP_PX = 4; // gap-1 between the desktop buttons

const desktopButtonClass = (isActive: boolean) =>
  `flex items-center gap-2 px-3 xl:px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
    isActive ? 'bg-brand text-white shadow-md shadow-brand/30' : 'text-on-brand-muted hover:text-white hover:bg-white/10'
  }`;

const Badge: React.FC<{ item: NavItem; className: string }> = ({ item, className }) =>
  item.badge === undefined ? null : (
    <span className={`${className} rounded-full font-bold ${item.badgeColor || 'bg-brand-deep text-line'}`}>{item.badge}</span>
  );

const groupItems = (entry: NavGroupEntry) => entry.sections.flatMap((section) => section.items);

/** What a desktop button shows. It is drawn unseen too, to measure how many buttons fit on the bar. */
const EntryFace: React.FC<{ entry: NavEntry; activeTab: ActiveTab; open?: boolean }> = ({ entry, activeTab, open = false }) => {
  if (entry.kind === 'item') {
    const { item } = entry;
    return (
      <>
        {item.icon}
        <span className={item.compact ? 'hidden xl:inline' : undefined}>{item.label}</span>
        <Badge item={item} className="text-xs px-1.5 py-0.2" />
      </>
    );
  }
  const items = groupItems(entry);
  const active = entry.more ? undefined : items.find((i) => i.id === activeTab);
  // A closed group still shows that something inside it waits for this person.
  const groupBadge = items.find((i) => i.badge !== undefined);
  return (
    <>
      {active?.icon ?? entry.icon}
      <span>{active ? active.label : entry.label}</span>
      {entry.more ? (
        <span className={`w-2 h-2 rounded-full ${groupBadge ? 'bg-amber-400' : 'bg-transparent'}`} aria-hidden="true" />
      ) : (
        groupBadge && <Badge item={groupBadge} className="text-xs px-1.5 py-0.2" />
      )}
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </>
  );
};

/** Desktop drop-down that groups related pages ("همکاران", "مدیریت"), or holds what did not fit ("بیشتر"). */
const NavGroup: React.FC<{ entry: NavGroupEntry; activeTab: ActiveTab; onSelect: (tab: ActiveTab) => void; alignEnd?: boolean }> = ({
  entry,
  activeTab,
  onSelect,
  alignEnd = false,
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

  const items = groupItems(entry);
  const active = items.some((i) => i.id === activeTab);
  const waiting = entry.more && items.some((i) => i.badge !== undefined);
  const menuId = `nav-group-${entry.id}`;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-current={active ? 'page' : undefined}
        aria-label={waiting ? `${entry.label} (موارد تازه)` : undefined}
        className={desktopButtonClass(active)}
      >
        <EntryFace entry={entry} activeTab={activeTab} open={open} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-full ${alignEnd ? 'left-0' : 'right-0'} mt-1.5 min-w-48 max-h-[70vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-line p-1.5 z-50 text-right`}
        >
          {entry.sections.map((section, index) => (
            <div key={section.title ?? index} role="group" aria-label={section.title} className={index > 0 ? 'mt-1 pt-1 border-t border-line' : ''}>
              {section.title && <div className="px-3 pt-1.5 pb-1 text-xs font-bold text-faint">{section.title}</div>}
              {section.items.map((item) => (
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
                    item.id === activeTab ? 'bg-brand-soft text-brand-strong' : 'text-ink hover:bg-surface'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 text-right">{item.label}</span>
                  <Badge item={item} className="text-xs px-1.5 py-0.5" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * How many of the leading desktop entries fit on the bar. The bar measures an unseen copy of every button
 * (and of «بیشتر» and the pinned entries after it) and moves what does not fit into «بیشتر», so the
 * page never scrolls sideways, whatever the screen width, the badges or the person's pages.
 */
function useFittingCount(count: number, signature: string) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fitting, setFitting] = useState(count);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const fit = () => {
      const widths = Array.from(measure.children, (child) => Math.ceil(child.getBoundingClientRect().width));
      const pinned = widths.slice(count + 1).reduce((sum, width) => sum + GAP_PX + width, 0);
      const available = row.clientWidth - pinned;
      const lead = widths.slice(0, count);
      const all = lead.reduce((sum, width, i) => sum + width + (i > 0 ? GAP_PX : 0), 0);
      if (all <= available) {
        setFitting(count);
        return;
      }
      const more = widths[count] + GAP_PX;
      let used = 0;
      let n = 0;
      while (n < count && used + (n > 0 ? GAP_PX : 0) + lead[n] + more <= available) {
        used += (n > 0 ? GAP_PX : 0) + lead[n];
        n += 1;
      }
      setFitting(n);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [count, signature]);
  return { rowRef, measureRef, fitting: Math.min(fitting, count) };
}

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
    badge: dueTodoCount > 0 ? `${toPersianDigits(dueTodoCount)} یادداشت` : undefined,
    badgeColor: 'bg-sky-200 text-sky-950'
  };
  const systems: NavItem = { id: 'systems', label: 'سامانه‌ها', icon: <LayoutGrid className="w-4 h-4" /> };
  const pollsItem: NavItem = {
    id: 'polls',
    label: 'نظرسنجی‌ها',
    icon: <Vote className="w-4 h-4" />,
    badge: activePollsCount > 0 ? `${toPersianDigits(activePollsCount)} جدید` : undefined,
    badgeColor: 'bg-brand-strong/30 text-line'
  };
  const newsItem: NavItem = {
    id: 'news',
    label: 'اخبار و اطلاعیه‌ها',
    icon: <Newspaper className="w-4 h-4" />,
    badge: pendingAckCount > 0
      ? `${toPersianDigits(pendingAckCount)} بخشنامه`
      : unreadNewsCount > 0 ? `${toPersianDigits(unreadNewsCount)} نخوانده` : undefined,
    badgeColor: pendingAckCount > 0 ? 'bg-amber-400 text-amber-950' : 'bg-brand-strong/30 text-line'
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
    items.length === 0 ? [] : items.length === 1 ? [{ kind: 'item', item: items[0] }] : [{ kind: 'group', id, label, icon, sections: [{ items }] }];
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
  ];
  // «مدیریت» always stays at the end of the bar; what does not fit goes into «بیشتر» just before it.
  const pinnedEntries = groupOrItem('admin', 'مدیریت', <ShieldCheck className="w-4 h-4" />, adminItems);
  const entryKey = (entry: NavEntry) => (entry.kind === 'item' ? entry.item.id : entry.id);
  const signature = [...desktopEntries, ...pinnedEntries]
    .map((entry) => (entry.kind === 'item' ? `${entry.item.id}:${entry.item.badge ?? ''}` : `${entry.id}:${groupItems(entry).map((i) => `${i.id}${i.badge ?? ''}`).join()}`))
    .join('|') + `|${activeTab}`;
  const { rowRef, measureRef, fitting } = useFittingCount(desktopEntries.length, signature);
  const overflow = desktopEntries.slice(fitting);
  const moreEntry: NavGroupEntry = {
    kind: 'group',
    id: 'more',
    label: 'بیشتر',
    icon: <Ellipsis className="w-4 h-4" />,
    more: true,
    sections: overflow.map((entry) => (entry.kind === 'item' ? { items: [entry.item] } : { title: entry.label, items: groupItems(entry) })),
  };
  // Single pages that follow one another share one untitled section of «بیشتر».
  moreEntry.sections = moreEntry.sections.reduce<NavSection[]>((merged, section) => {
    const last = merged[merged.length - 1];
    if (!section.title && last && !last.title) last.items = [...last.items, ...section.items];
    else merged.push({ ...section, items: [...section.items] });
    return merged;
  }, []);

  // The phone drawer has room for everything, with management pages under their own heading.
  const mobileSections: { title?: string; items: NavItem[] }[] = [
    { items: shown([dashboard, systems, newsItem, pollsItem, documents, guides, ...colleagueItems, training, calendar, ...todosItem, ...suggestions]) },
    ...(adminItems.length > 0 ? [{ title: 'مدیریت', items: adminItems }] : []),
  ];

  return (
    <>
      {/* Desktop Navigation Top Bar / Sub-header */}
      <nav className="hidden lg:block bg-brand-deep text-line border-b border-brand-deep shadow-inner relative z-30" aria-label="منوی اصلی">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={rowRef} className="relative flex items-center gap-1 py-1.5">
            {desktopEntries.slice(0, fitting).map((entry) => {
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
                  className={`${desktopButtonClass(isActive)} shrink-0`}
                >
                  <EntryFace entry={entry} activeTab={activeTab} />
                </button>
              );
            })}
            {overflow.length > 0 && <NavGroup entry={moreEntry} activeTab={activeTab} onSelect={(tab) => setActiveTab(tab)} alignEnd />}
            {pinnedEntries.map((entry) =>
              entry.kind === 'group' ? (
                <NavGroup key={entry.id} entry={entry} activeTab={activeTab} onSelect={(tab) => setActiveTab(tab)} alignEnd />
              ) : (
                <button
                  key={entry.item.id}
                  onClick={() => setActiveTab(entry.item.id)}
                  aria-current={activeTab === entry.item.id ? 'page' : undefined}
                  className={`${desktopButtonClass(activeTab === entry.item.id)} shrink-0`}
                >
                  <EntryFace entry={entry} activeTab={activeTab} />
                </button>
              ),
            )}
            {/* Unseen copy of every button, «بیشتر» and the pinned entries, measured to decide what fits. */}
            {/* It is clipped to the bar, so it never widens the page. */}
            <div aria-hidden="true" inert className="absolute inset-0 overflow-hidden invisible pointer-events-none">
              <div ref={measureRef} className="flex gap-1 w-max">
                {[...desktopEntries, moreEntry, ...pinnedEntries].map((entry) => (
                  <span key={entryKey(entry)} className={desktopButtonClass(false)}>
                    <EntryFace entry={entry} activeTab={activeTab} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {isMobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-brand-deep/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobileNav}
          />

          <div className="relative flex-1 max-w-xs w-full h-full overflow-y-auto overscroll-contain bg-brand-deep text-line p-5 flex flex-col justify-between gap-4 shadow-2xl z-10 text-right" role="dialog" aria-modal="true" aria-label="منوی پرتال">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-white">پرتال رویا طرح داخلی</span>
                  <span className="text-xs text-line/80">ROYA Surface Center</span>
                </div>
                <button
                  onClick={onCloseMobileNav}
                  aria-label="بستن منو"
                  className="p-2 rounded-lg text-line hover:text-white hover:bg-white/10"
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
                  className="w-full flex items-center justify-center gap-2 p-3 mb-4 rounded-xl bg-white text-brand-deep text-xs font-black"
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
                    className="w-10 h-10 rounded-full border-2 border-brand text-xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {currentUser.firstName} {currentUser.lastName}
                    </div>
                    <div className="text-xs text-line/80 truncate">
                      {currentUser.position}
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Items */}
              {mobileSections.map((section, index) => (
                <div key={section.title ?? index} className={index > 0 ? 'mt-4 pt-4 border-t border-white/10' : ''}>
                  {section.title && <div className="px-3.5 pb-2 text-xs font-bold text-line/70">{section.title}</div>}
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
                              ? 'bg-brand text-white shadow-md'
                              : 'text-on-brand-muted hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {item.icon}
                            <span>{item.label}</span>
                          </div>
                          <Badge item={item} className="text-xs px-2 py-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 text-xs text-line/80 text-center">
              شرکت رویا طرح داخلی © {toPersianDigits(currentJalaliYear())}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
