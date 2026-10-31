import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { timeAgo, toPersianDigits } from '../../lib/jalali';
import {
  Bell,
  MessageSquareText,
  CheckCircle2,
  Trash2,
  Cake,
  CalendarDays,
  Vote,
  Newspaper,
  GraduationCap,
  User,
  FileText,
  ServerCog,
  Heart
} from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { secondaryButtonClass } from '../common/Modal';
import { EmptyState, SkeletonRows } from '../common/Placeholder';
import { groupByDay, plainTitle } from './notificationList';

export const NotificationsInbox: React.FC = () => {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    setActiveTab,
    isLoaded
  } = usePortal();

  const [typeFilter, setTypeFilter] = useState<string>('all');

  const userNotifs = notifications;

  const filteredNotifs = userNotifs.filter(n => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'unread') return !n.isRead;
    return n.type === typeFilter;
  });

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'birthday':
        return <Cake className="w-4 h-4 text-pink-600" />;
      case 'poll':
        return <Vote className="w-4 h-4 text-indigo-600" />;
      case 'training':
        return <GraduationCap className="w-4 h-4 text-blue-600" />;
      case 'calendar':
        return <CalendarDays className="w-4 h-4 text-sky-700" />;
      case 'welcome':
        return <User className="w-4 h-4 text-emerald-600" />;
      case 'document':
        return <FileText className="w-4 h-4 text-stone-600" />;
      case 'suggestion':
        return <MessageSquareText className="w-4 h-4 text-indigo-700" />;
      case 'kudos':
        return <Heart className="w-4 h-4 text-rose-600" />;
      case 'system':
        return <ServerCog className="w-4 h-4 text-amber-700" />;
      default:
        return <Newspaper className="w-4 h-4 text-red-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageHeader icon={<Bell />} title="اعلان‌های من" description="تولد همکاران، نظرسنجی‌ها، دوره‌ها، رویدادها و اخباری که به شما مربوط است.">
        <button onClick={markAllNotificationsRead} className={secondaryButtonClass}>
          <CheckCircle2 className="w-4 h-4 text-brand-strong" />
          <span>خواندن همه</span>
        </button>
      </PageHeader>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-line shadow-xs flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'all'
              ? 'bg-brand-deep text-white shadow-xs'
              : 'bg-surface hover:bg-line text-ink'
          }`}
        >
          همه اعلان‌ها ({toPersianDigits(userNotifs.length)})
        </button>

        <button
          onClick={() => setTypeFilter('unread')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'unread'
              ? 'bg-brand text-white shadow-xs'
              : 'bg-surface hover:bg-line text-ink'
          }`}
        >
          خوانده نشده ({toPersianDigits(userNotifs.filter(n => !n.isRead).length)})
        </button>

        <button
          onClick={() => setTypeFilter('poll')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'poll'
              ? 'bg-brand-strong text-white shadow-xs'
              : 'bg-surface hover:bg-line text-ink'
          }`}
        >
          نظرسنجی‌ها
        </button>

        <button
          onClick={() => setTypeFilter('training')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'training'
              ? 'bg-brand-strong text-white shadow-xs'
              : 'bg-surface hover:bg-line text-ink'
          }`}
        >
          آموزش
        </button>

        <button
          onClick={() => setTypeFilter('calendar')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'calendar'
              ? 'bg-brand-strong text-white shadow-xs'
              : 'bg-surface hover:bg-line text-ink'
          }`}
        >
          تقویم
        </button>

        <button
          onClick={() => setTypeFilter('birthday')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'birthday'
              ? 'bg-brand text-white shadow-xs'
              : 'bg-surface hover:bg-line text-ink'
          }`}
        >
          تولد
        </button>
      </div>

      {/* Notifications, under «امروز», «دیروز», «این هفته» and «قبل‌تر» */}
      {!isLoaded('notifications') ? (
        <SkeletonRows rows={4} tall />
      ) : filteredNotifs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-line/70 shadow-card">
          <EmptyState
            icon={<Bell />}
            title={typeFilter === 'unread' ? 'همهٔ اعلان‌ها را خوانده‌اید' : typeFilter === 'all' ? 'هنوز اعلانی ندارید' : 'اعلانی از این نوع نیست'}
            hint={typeFilter === 'all' ? 'تولد همکاران، نظرسنجی‌ها، دوره‌ها و اخباری که به شما مربوط است اینجا جمع می‌شود.' : undefined}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groupByDay(filteredNotifs).map((group) => (
            <section key={group.key} aria-label={group.label} className="space-y-2">
              <h2 className="text-xs font-bold text-muted px-1">{group.label}</h2>
              <ul className="bg-white rounded-2xl border border-line/70 shadow-card divide-y divide-line overflow-hidden">
                {group.items.map((notif) => {
                  const open = notif.linkTab
                    ? () => {
                        markNotificationRead(notif.id);
                        setActiveTab(notif.linkTab!, notif.linkId);
                      }
                    : undefined;
                  return (
                    <li key={notif.id} className={`flex items-start gap-3 p-3 sm:p-4 transition-colors ${notif.isRead ? '' : 'bg-brand-soft/60'}`}>
                      <div className="w-9 h-9 shrink-0 rounded-xl bg-surface flex items-center justify-center">{getNotifIcon(notif.type)}</div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          {!notif.isRead && <span className="w-2 h-2 shrink-0 rounded-full bg-brand" aria-label="خوانده نشده" role="img" />}
                          <h3 className={`text-sm min-w-0 ${notif.isRead ? 'font-semibold text-ink-soft' : 'font-bold text-ink'}`}>{plainTitle(notif.title)}</h3>
                          <span className="text-xs text-faint mr-auto shrink-0">{timeAgo(notif.date)}</span>
                        </div>
                        <p className="text-xs text-muted leading-relaxed">{notif.message}</p>
                        {open && (
                          <button onClick={open} className="tap-area text-xs font-bold text-brand hover:underline pt-0.5 inline-block">
                            مشاهده در بخش مربوطه »
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {!notif.isRead && (
                          <button
                            onClick={() => markNotificationRead(notif.id)}
                            className="p-1.5 text-brand-strong hover:bg-sage-soft rounded-lg"
                            title="علامت‌گذاری به عنوان خوانده شده"
                            aria-label="خواندم"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notif.id)}
                          className="p-1.5 text-faint hover:text-warm hover:bg-warm-soft rounded-lg"
                          title="حذف"
                          aria-label="حذف اعلان"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

    </div>
  );
};
