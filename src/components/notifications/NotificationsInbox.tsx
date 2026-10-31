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

export const NotificationsInbox: React.FC = () => {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    setActiveTab
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
        return <Cake className="w-5 h-5 text-pink-600" />;
      case 'poll':
        return <Vote className="w-5 h-5 text-indigo-600" />;
      case 'training':
        return <GraduationCap className="w-5 h-5 text-blue-600" />;
      case 'calendar':
        return <CalendarDays className="w-5 h-5 text-sky-700" />;
      case 'welcome':
        return <User className="w-5 h-5 text-emerald-600" />;
      case 'document':
        return <FileText className="w-5 h-5 text-stone-600" />;
      case 'suggestion':
        return <MessageSquareText className="w-5 h-5 text-indigo-700" />;
      case 'kudos':
        return <Heart className="w-5 h-5 text-rose-600" />;
      case 'system':
        return <ServerCog className="w-5 h-5 text-amber-700" />;
      default:
        return <Newspaper className="w-5 h-5 text-red-600" />;
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

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifs.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-line space-y-2">
            <Bell className="w-10 h-10 text-faint mx-auto" />
            <p className="text-sm font-bold text-muted">اعلانی در این بخش یافت نشد.</p>
          </div>
        ) : (
          filteredNotifs.map((notif) => (
            <div
              key={notif.id}
              className={`p-5 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                !notif.isRead
                  ? 'bg-surface border-brand shadow-xs'
                  : 'bg-white border-line opacity-80'
              }`}
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <div className="p-3 bg-white rounded-2xl shadow-2xs border border-line">
                  {getNotifIcon(notif.type)}
                </div>

                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-brand inline-block"></span>
                    )}
                    <h3 className="text-sm font-bold text-ink">{notif.title}</h3>
                    <span className="text-xs text-faint mr-auto">{timeAgo(notif.date)}</span>
                  </div>

                  <p className="text-xs text-muted leading-relaxed">{notif.message}</p>

                  {notif.linkTab && (
                    <button
                      onClick={() => {
                        markNotificationRead(notif.id);
                        setActiveTab(notif.linkTab!, notif.linkId);
                      }}
                      className="tap-area text-xs font-bold text-brand hover:underline pt-1 inline-block"
                    >
                      مشاهده در بخش مربوطه »
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!notif.isRead && (
                  <button
                    onClick={() => markNotificationRead(notif.id)}
                    className="p-1.5 text-brand-strong hover:bg-sage-soft rounded-lg text-xs"
                    title="علامت‌گذاری به عنوان خوانده شده"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => deleteNotification(notif.id)}
                  className="p-1.5 text-faint hover:text-warm hover:bg-warm-soft rounded-lg"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
