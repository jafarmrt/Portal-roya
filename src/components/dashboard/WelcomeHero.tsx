import React, { useEffect, useState } from 'react';
import moment from 'moment-jalaali';
import { LayoutDashboard, Newspaper, Vote } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { daysUntilBirthday, toPersianDigits, todayJalali } from '../../lib/jalali';
import { dayOccasions, formatHijri } from '../../lib/occasions';
import { greetingFor, todaySummary } from './todaySummary';

const pillClass = 'px-3 py-2 sm:px-4 sm:py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 text-right transition-colors';

/**
 * The red welcome at the top of the dashboard: a greeting for the time of day, today's date and
 * occasion, and one line about the person's day (circulars, today's events, notes due, polls,
 * colleagues' birthdays, unread news). Counts that are zero are not shown at all; on a quiet day the
 * card simply wishes a good day.
 */
export const WelcomeHero: React.FC<{ canArrange: boolean; onArrange: () => void }> = ({ canArrange, onArrange }) => {
  const { currentUser, isGuest, news, polls, todos, calendarEvents, employees, customHolidays, featureOn, setActiveTab, isLoaded } = usePortal();
  // The greeting follows the clock if the page stays open.
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = moment();
  const today = todayJalali();
  const weekday = JALALI_WEEKDAYS[(now.day() + 1) % 7];
  const dateText = toPersianDigits(`${weekday}، ${now.jDate()} ${JALALI_MONTHS[now.jMonth()]} ${now.jYear()}`);
  const hijri = formatHijri(now.jYear(), now.jMonth() + 1, now.jDate());
  const occasion = dayOccasions(customHolidays, now.jYear(), now.jMonth() + 1, now.jDate());

  const published = news.filter((n) => n.status === 'published');
  const unreadNews = published.filter((n) => !n.isRead).length;
  const openPolls = polls.filter((p) => p.isActive && (isGuest || p.forMe) && !p.hasVoted).length;
  // Until the main lists have arrived the card says nothing about them (never "all read" by mistake).
  const ready = isLoaded('news') && isLoaded('polls');

  const parts = currentUser && ready
    ? todaySummary({
        pendingAcks: published.filter((n) => n.requiresAck && !n.acknowledgedAt).length,
        eventsToday: calendarEvents
          .filter((e) => e.forMe && e.date === today && !e.trainingId)
          .map((e) => ({ title: e.title, time: e.time ?? '' })),
        dueNotes: featureOn('todos') ? todos.filter((t) => !t.doneAt && t.dueDate !== null && t.dueDate <= today).length : 0,
        birthdaysToday: employees
          .filter((e) => e.isActive && e.id !== currentUser.id && daysUntilBirthday(e.birthDay) === 0)
          .map((e) => `${e.firstName} ${e.lastName}`),
      })
    : [];

  const title = currentUser ? `${greetingFor(hour)}، ${currentUser.firstName} عزیز 👋` : 'خوش آمدید 👋';
  const showPolls = featureOn('polls') && ready && openPolls > 0;
  const showNews = ready && (isGuest ? published.length > 0 : unreadNews > 0);

  return (
    <div className="bg-gradient-to-r from-brand-deep via-brand-strong to-red-500 rounded-3xl p-4 sm:p-6 text-white shadow-card relative overflow-hidden">
      <div className="absolute top-0 left-0 -ml-12 -mt-12 w-64 h-64 rounded-full bg-brand/20 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-white">{title}</h1>
          <p className="text-on-brand-muted text-xs sm:text-sm leading-relaxed">
            امروز {dateText}<span className="hidden sm:inline"> ({hijri})</span>
            {occasion && <span className="font-bold text-white">؛ {occasion.title}{occasion.isHoliday ? ' (تعطیل رسمی)' : ''}</span>}
          </p>
          {currentUser && ready && (parts.length > 0 || !(showPolls || showNews)) && (
            <p className="text-white text-sm leading-relaxed max-w-2xl">
              {parts.length > 0 ? parts.join(' · ') : 'کاری منتظر شما نیست؛ روز خوبی داشته باشید ☕'}
            </p>
          )}
          {isGuest && (
            <p className="text-on-brand-muted text-xs sm:text-sm leading-relaxed">برای شرکت در نظرسنجی‌ها و ثبت تبریک و نظر، وارد حساب کاربری خود شوید.</p>
          )}
        </div>

        {(showPolls || showNews || canArrange) && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {showPolls && (
              <button onClick={() => setActiveTab('polls')} className={pillClass}>
                <div className="text-xs text-on-brand-muted">نظرسنجی‌ها</div>
                <div className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                  <Vote className="w-4 h-4 text-sage" />
                  <span>{toPersianDigits(openPolls)} {isGuest ? 'در حال رأی‌گیری' : 'منتظر رأی شما'}</span>
                </div>
              </button>
            )}
            {showNews && (
              <button onClick={() => setActiveTab('news')} className={pillClass}>
                <div className="text-xs text-on-brand-muted">{isGuest ? 'اخبار و اطلاعیه‌ها' : 'اخبار نخوانده'}</div>
                <div className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                  <Newspaper className="w-4 h-4" />
                  <span>{toPersianDigits(isGuest ? published.length : unreadNews)} مورد</span>
                </div>
              </button>
            )}
            {canArrange && (
              <button
                onClick={onArrange}
                aria-label="چیدمان داشبورد"
                title="چیدمان داشبورد"
                className="self-stretch px-3 py-2 sm:py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 text-xs font-bold text-on-brand-muted flex items-center gap-1.5 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">چیدمان داشبورد</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
