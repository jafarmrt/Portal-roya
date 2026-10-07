import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import {
  Bell,
  CheckCircle2,
  Trash2,
  Filter,
  Cake,
  Vote,
  Newspaper,
  GraduationCap,
  User,
  Sparkles
} from 'lucide-react';

export const NotificationsInbox: React.FC = () => {
  const {
    notifications,
    currentUser,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    setActiveTab
  } = usePortal();

  const [typeFilter, setTypeFilter] = useState<string>('all');

  const userNotifs = notifications.filter(
    n => n.targetUserId === 'all' || (currentUser && n.targetUserId === currentUser.id)
  );

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
      case 'welcome':
        return <User className="w-5 h-5 text-emerald-600" />;
      default:
        return <Newspaper className="w-5 h-5 text-red-600" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <Bell className="w-3.5 h-3.5" />
              <span>مرکز مدیریت اعلان‌های شخصی‌سازی شده</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">صندوق ورودی پیام‌ها و اعلان‌های شما</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              اطلاع‌رسانی‌های هوشمند درباره تولد همکاران، نظرسنجی‌های دپارتمان، دوره‌های آموزشی ثبت‌نامی و اخبار سازمان.
            </p>
          </div>

          <button
            onClick={markAllNotificationsRead}
            className="px-4 py-2.5 text-xs font-bold text-[#2D2D2D] bg-white hover:bg-[#E6E0D5] rounded-xl shadow-md transition-all flex items-center gap-1.5 self-start sm:self-auto"
          >
            <CheckCircle2 className="w-4 h-4 text-[#991b1b]" />
            <span>علامت‌گذاری همه به عنوان خوانده شده</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] shadow-xs flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'all'
              ? 'bg-[#7f1d1d] text-white shadow-xs'
              : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
          }`}
        >
          همه اعلان‌ها ({userNotifs.length})
        </button>

        <button
          onClick={() => setTypeFilter('unread')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'unread'
              ? 'bg-[#dc2626] text-white shadow-xs'
              : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
          }`}
        >
          خوانده نشده ({userNotifs.filter(n => !n.isRead).length})
        </button>

        <button
          onClick={() => setTypeFilter('poll')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'poll'
              ? 'bg-[#991b1b] text-white shadow-xs'
              : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
          }`}
        >
          نظرسنجی‌ها
        </button>

        <button
          onClick={() => setTypeFilter('training')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'training'
              ? 'bg-[#991b1b] text-white shadow-xs'
              : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
          }`}
        >
          آموزش
        </button>

        <button
          onClick={() => setTypeFilter('birthday')}
          className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
            typeFilter === 'birthday'
              ? 'bg-[#dc2626] text-white shadow-xs'
              : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
          }`}
        >
          تولد
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifs.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5] space-y-2">
            <Bell className="w-10 h-10 text-[#8C867A] mx-auto" />
            <p className="text-sm font-bold text-[#6E6A60]">اعلانی در این بخش یافت نشد.</p>
          </div>
        ) : (
          filteredNotifs.map((notif) => (
            <div
              key={notif.id}
              className={`p-5 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                !notif.isRead
                  ? 'bg-[#F5F2ED] border-[#dc2626] shadow-xs'
                  : 'bg-white border-[#E6E0D5] opacity-80'
              }`}
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <div className="p-3 bg-white rounded-2xl shadow-2xs border border-[#E6E0D5]">
                  {getNotifIcon(notif.type)}
                </div>

                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#dc2626] inline-block animate-pulse"></span>
                    )}
                    <h3 className="text-sm font-bold text-[#2D2D2D]">{notif.title}</h3>
                    <span className="text-[10px] text-[#8C867A] mr-auto">{notif.date}</span>
                  </div>

                  <p className="text-xs text-[#6E6A60] leading-relaxed">{notif.message}</p>

                  {notif.linkTab && (
                    <button
                      onClick={() => {
                        markNotificationRead(notif.id);
                        setActiveTab(notif.linkTab!);
                      }}
                      className="text-xs font-bold text-[#dc2626] hover:underline pt-1 inline-block"
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
                    className="p-1.5 text-[#991b1b] hover:bg-[#EBF2E8] rounded-lg text-xs"
                    title="علامت‌گذاری به عنوان خوانده شده"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => deleteNotification(notif.id)}
                  className="p-1.5 text-[#8C867A] hover:text-[#D97B5F] hover:bg-[#FBF0EC] rounded-lg"
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
