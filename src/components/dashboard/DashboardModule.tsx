import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { BirthdayCard } from './BirthdayCard';
import { MyCelebrationCard } from './MyCelebrationCard';
import { FeatureIntroCard } from './FeatureIntroCard';
import { InstallInvite } from '../common/InstallApp';
import { DayThemeBanner } from './DayThemeBanner';
import { QuickSystemsWidget } from './QuickSystemsWidget';
import { MoodTrackerWidget } from './MoodTrackerWidget';
import { WelcomeNewColleagueCard } from './WelcomeNewColleagueCard';
import { DashboardCalendar } from './DashboardCalendar';
import { isCardOn } from './dashboardCards';
import { DashboardLayoutModal } from './DashboardLayoutModal';
import { dashboardOrder, DASHBOARD_LAYOUT, type DashboardCardKey } from '../../../shared/dashboard';
import { MobileFold } from './MobileFold';
import { MyTasksCard } from './MyTasksCard';
import { PersonalTodosCard } from './PersonalTodosCard';
import { OnlineColleaguesCard } from '../online/OnlineColleaguesCard';
import { NoticeBoard } from '../notices/NoticeBoard';
import moment from 'moment-jalaali';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import { formatDate, toPersianDigits, todayJalali } from '../../lib/jalali';
import { dayOccasions, formatHijri } from '../../lib/occasions';
import {
  Vote,
  Newspaper,
  GraduationCap,
  ChevronLeft,
  Sparkles,
  Pin,
  FileCheck2,
  AlertTriangle,
  CalendarDays,
  LayoutDashboard
} from 'lucide-react';

export const DashboardModule: React.FC = () => {
  const {
    currentUser,
    isGuest,
    news,
    polls,
    trainings,
    setActiveTab,
    appSettings,
    customHolidays,
    featureOn,
  } = usePortal();
  const on = (id: Parameters<typeof isCardOn>[1]) => isCardOn(appSettings, id);
  const [arranging, setArranging] = useState(false);
  // The person's own order of the cards: one column on a phone, and the same order inside each part
  // of the page on a computer (see shared/dashboard.ts). Fixed banners come before them (order 1-2).
  const cardOrder = dashboardOrder(appSettings?.dashboardOrder ?? [], appSettings?.dashboardDefaultOrder ?? []);
  const place = (id: DashboardCardKey): React.CSSProperties => ({ order: 10 + cardOrder.indexOf(id) });
  const canArrange = Boolean(currentUser) && featureOn('dashboardLayout');
  // The cards switched on for this person, whether or not they have something to show today.
  const arrangeable = DASHBOARD_LAYOUT.map((c) => c.id).filter((id) => id === 'news' || on(id));

  const activePoll = polls.find(p => p.isActive && (isGuest || p.forMe) && !p.hasVoted);
  const publishedNews = news.filter(n => n.status === 'published');
  // Read and acknowledgement state is personal, so guests just see what is published.
  const pendingAcks = isGuest ? [] : publishedNews.filter(n => n.requiresAck && !n.acknowledgedAt);
  const unreadCount = publishedNews.filter(n => !n.isRead).length;
  const openPollsCount = polls.filter(p => p.isActive && (isGuest || p.forMe) && !p.hasVoted).length;
  const latestNews = publishedNews.filter(n => !pendingAcks.includes(n)).slice(0, 4);
  const today = todayJalali();
  const upcomingTraining = [...trainings].filter(t => t.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const now = moment();
  const todayDayIndex = (now.day() + 1) % 7; // JS Sunday-first to Saturday-first
  const todayStr = toPersianDigits(`${JALALI_WEEKDAYS[todayDayIndex]}، ${now.jDate()} ${JALALI_MONTHS[now.jMonth()]} ${now.jYear()}`);
  const todayHijri = formatHijri(now.jYear(), now.jMonth() + 1, now.jDate());
  const todayOccasions = dayOccasions(customHolidays, now.jYear(), now.jMonth() + 1, now.jDate());


  // On phones the cards are one column; from lg the cards across the top come first, then the two
  // columns. Either way each card's place comes from the person's order. Wrappers of cards that render nothing are hidden.
  return (
    <div className="flex flex-col gap-6 [&>*:empty]:hidden">
      {/* Hero Welcome Banner */}
      <div className="bg-gradient-to-r from-brand-deep via-brand-strong to-red-500 rounded-3xl p-4 sm:p-6 text-white shadow-card relative overflow-hidden">
        <div className="absolute top-0 left-0 -ml-12 -mt-12 w-64 h-64 rounded-full bg-brand/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-2">
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/30 text-line text-xs font-semibold border border-brand/40">
              <Sparkles className="w-3.5 h-3.5" />
              <span>پرتال سازمانی رویا طرح داخلی | ROYA Surface Center</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white">
              {currentUser ? `سلام، ${currentUser.firstName} ${currentUser.lastName} عزیز 👋` : 'خوش آمدید 👋'}
            </h1>
            <p className="text-line text-xs sm:text-sm max-w-xl leading-relaxed">
              امروز {todayStr} ({todayHijri}) است.
              {todayOccasions && <span className="font-bold text-white"> {todayOccasions.title}{todayOccasions.isHoliday ? ' (تعطیل رسمی)' : ''}.</span>}
              {isGuest
                ? ' برای شرکت در نظرسنجی‌ها و ثبت تبریک و نظر، وارد حساب کاربری خود شوید.'
                : unreadCount > 0 ? ` ${toPersianDigits(unreadCount)} خبر یا اطلاعیهٔ نخوانده دارید.` : ' همهٔ اخبار را خوانده‌اید.'}
            </p>
          </div>

          {/* Quick Stat Pill Cards */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {featureOn('polls') && (
              <button
                onClick={() => setActiveTab('polls')}
                className="px-3 py-2 sm:px-4 sm:py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 text-right transition-all"
              >
                <div className="text-xs text-line">نظرسنجی‌ها</div>
                <div className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                  <Vote className="w-4 h-4 text-sage" />
                  <span>{toPersianDigits(openPollsCount)} {isGuest ? 'در حال رأی‌گیری' : 'در انتظار رأی شما'}</span>
                </div>
              </button>
            )}

            <button
              onClick={() => setActiveTab('news')}
              className="px-3 py-2 sm:px-4 sm:py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 text-right transition-all"
            >
              <div className="text-xs text-line">{isGuest ? 'اخبار و اطلاعیه‌ها' : 'اخبار نخوانده'}</div>
              <div className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                <Newspaper className="w-4 h-4 text-line" />
                <span>{toPersianDigits(isGuest ? publishedNews.length : unreadCount)} مورد</span>
              </div>
            </button>

            {canArrange && (
              <button
                onClick={() => setArranging(true)}
                aria-label="چیدمان داشبورد"
                title="چیدمان داشبورد"
                className="self-stretch px-3 py-2 sm:py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 text-xs font-bold text-line flex items-center gap-1.5 transition-all"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">چیدمان داشبورد</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nowruz, the seasons, Yalda, the feasts and the founding day; quiet on days of mourning */}
      <div className="order-1">
        <DayThemeBanner />
      </div>

      {/* On a phone: an invitation to install the portal on the home screen */}
      <div className="order-1">
        <InstallInvite />
      </div>

      {/* Parts of the portal introduced in the last two weeks */}
      <div className="order-1">
        <FeatureIntroCard />
      </div>

      {/* «تابلوی اعلانات»: short notices that are not news, in full, above the cards */}
      {on('notices') && (
        <div className="order-2">
          <NoticeBoard />
        </div>
      )}

      {/* Organisation apps sit at the very top so they are reachable without scrolling */}
      {on('systems') && (
        <div style={place('systems')}>
          <QuickSystemsWidget />
        </div>
      )}

      {on('anniversary') && !isGuest && (
        <div style={place('anniversary')}>
          <MyCelebrationCard />
        </div>
      )}

      {!on('myTasks') && pendingAcks.length > 0 && (
        <section className="order-2 bg-amber-50 border border-amber-300 rounded-3xl p-5 sm:p-6 space-y-3" aria-labelledby="pending-acks-title">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
            <h2 id="pending-acks-title" className="text-sm font-black text-amber-900">
              {toPersianDigits(pendingAcks.length)} بخشنامه منتظر مطالعه و تأیید شماست
            </h2>
          </div>
          <ul className="space-y-2">
            {pendingAcks.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab('news', item.id)}
                  className="w-full flex items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-amber-200 hover:border-amber-500 text-right transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileCheck2 className="w-4 h-4 text-amber-700 shrink-0" />
                    <span className="text-xs font-bold text-ink truncate">{item.title}</span>
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">{formatDate(item.publishAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* On phones the grid and its columns step aside (display: contents) so their cards can be reordered */}
      <div className="contents lg:grid lg:grid-cols-3 lg:gap-6 lg:order-[100]">
        {/* Wide column: news, new colleagues, the featured poll, the calendar and the next course */}
        <div className="contents lg:flex lg:flex-col lg:col-span-2 lg:gap-6 [&>*:empty]:hidden">
          {/* Pinned / Latest News Section */}
          <div style={place('news')} className="bg-white rounded-3xl p-5 sm:p-6 border border-line/70 shadow-card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-surface text-brand rounded-xl">
                  <Newspaper className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-ink">آخرین اخبار و اطلاعیه‌ها</h3>
                  <p className="text-xs text-muted">اطلاع‌رسانی‌های رسمی مدیریت و دپارتمان‌ها</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('news')}
                className="tap-area text-xs font-bold text-brand hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>مشاهده همه اخبار</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {latestNews.length === 0 ? (
              <p className="text-xs text-muted py-6 text-center">هنوز خبری منتشر نشده است.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {latestNews.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab('news', item.id)}
                    className="p-4 bg-surface/70 hover:bg-surface-strong rounded-2xl cursor-pointer transition-colors space-y-2 group text-right"
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="w-full h-32 object-cover rounded-xl group-hover:opacity-95 transition-opacity"
                      />
                    )}
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span className="font-bold text-brand flex items-center gap-1">
                        {item.isPinned && <Pin className="w-3 h-3" />}
                        {item.category}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {!item.isRead && <span className="w-2 h-2 rounded-full bg-red-600" aria-label="نخوانده" />}
                        {formatDate(item.publishAt)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-ink leading-relaxed line-clamp-2 group-hover:text-brand transition-colors">
                      {item.title}
                    </h4>
                  </button>
                ))}
              </div>
            )}
          </div>


          {/* Welcome New Colleagues Wall */}
          {on('welcome') && (
            <div style={place('welcome')}>
              <WelcomeNewColleagueCard />
            </div>
          )}

          {/* Active Poll Spotlight Card */}
          {on('poll') && activePoll && (
            <MobileFold id="poll" title="نظرسنجی ویژه" icon={<Vote className="w-4 h-4" />} style={place('poll')}>
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-line/70 shadow-card relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-brand text-white rounded-xl">
                      <Vote className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-ink">نظرسنجی ویژه سازمان</h3>
                      <p className="text-xs text-muted">نظرسنجی فعال جهت دریافت نظرات همکاران</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-warm text-white text-xs font-bold rounded-full">
                    در حال رای‌گیری
                  </span>
                </div>

                <div className="py-4 space-y-2">
                  <h4 className="text-sm font-bold text-ink">{activePoll.title}</h4>
                  <p className="text-xs text-muted leading-relaxed">{activePoll.description}</p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted font-medium">
                    {toPersianDigits(activePoll.questions.length)} سؤال · تاکنون <strong>{toPersianDigits(activePoll.responseCount)} نفر</strong> پاسخ داده‌اند
                  </span>
                  <button
                    onClick={() => setActiveTab('polls', activePoll.id)}
                    className="px-5 py-2.5 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                  >
                    <span>شرکت در نظرسنجی</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </MobileFold>
          )}
          {/* Dashboard Calendar Widget */}
          {on('calendar') && (
            <MobileFold id="calendar" title="تقویم" icon={<CalendarDays className="w-4 h-4" />} style={place('calendar')}>
              <DashboardCalendar />
            </MobileFold>
          )}

          {/* Upcoming Training Highlight */}
          {on('training') && upcomingTraining && (
            <MobileFold id="training" title="کارگاه آموزشی پیش‌رو" icon={<GraduationCap className="w-4 h-4" />} style={place('training')}>
              <div className="bg-white rounded-3xl p-6 border border-line/70 shadow-card space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-surface-strong text-brand-strong rounded-xl">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-ink">کارگاه آموزشی پیش‌رو</h3>
                      <p className="text-xs text-muted">برنامه آموزش سازمانی رویا</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-ink leading-snug">{upcomingTraining.title}</h4>
                  <p className="text-xs text-muted leading-relaxed line-clamp-2">{upcomingTraining.description}</p>
                  <div className="text-xs text-muted space-y-1 pt-1">
                    <div>مدرس: <strong>{upcomingTraining.instructor}</strong></div>
                    <div>تاریخ: <strong>{formatDate(upcomingTraining.date)}</strong>{upcomingTraining.time && ` (ساعت ${toPersianDigits(upcomingTraining.time)})`}</div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('training', upcomingTraining.id)}
                  className="w-full py-2 bg-brand-strong hover:bg-brand-deep text-white text-xs font-bold rounded-xl transition-colors text-center block mt-2"
                >
                  مشاهده جزییات و ثبت‌نام
                </button>
              </div>
            </MobileFold>
          )}
        </div>

        {/* Side column (on the left): what the person has to do, the online colleagues, birthdays and mood */}
        <div className="contents lg:flex lg:flex-col lg:gap-6 [&>*:empty]:hidden">
          {/* What this person still has to do; when the card is switched off, circulars are still listed */}
          {on('myTasks') && !isGuest && (
            <div style={place('myTasks')}>
              <MyTasksCard />
            </div>
          )}

          {/* The person's own to-do notes, right under what the portal asks of them */}
          {on('todos') && !isGuest && (
            <div style={place('todos')}>
              <PersonalTodosCard />
            </div>
          )}

          {/* Colleagues who have the portal open, and a ready-made emoji to one of them */}
          {on('online') && !isGuest && (
            <div style={place('online')}>
              <OnlineColleaguesCard />
            </div>
          )}

          {/* Birthday Celebrations Card */}
          {on('birthdays') && (
            <div style={place('birthdays')}>
              <BirthdayCard />
            </div>
          )}

          {/* Mood check-in (anonymous in reports) */}
          {on('mood') && !isGuest && (
            <div style={place('mood')}>
              <MoodTrackerWidget />
            </div>
          )}

        </div>

      </div>

      {arranging && <DashboardLayoutModal shown={arrangeable} onClose={() => setArranging(false)} />}
    </div>
  );
};
