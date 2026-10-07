import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { BirthdayCard } from './BirthdayCard';
import { WorkAnniversaryWidget } from './WorkAnniversaryWidget';
import { QuickSystemsWidget } from './QuickSystemsWidget';
import { MoodTrackerWidget } from './MoodTrackerWidget';
import { WelcomeNewColleagueCard } from './WelcomeNewColleagueCard';
import { DashboardCalendar } from './DashboardCalendar';
import moment from 'moment-jalaali';
import { JALALI_MONTHS, JALALI_WEEKDAYS } from '../../data/holidays';
import {
  Vote,
  Users,
  Newspaper,
  GraduationCap,
  Calendar,
  Search,
  PhoneCall,
  ChevronLeft,
  Heart,
  Sparkles,
  Building2,
  Clock,
  Pin
} from 'lucide-react';

export const DashboardModule: React.FC = () => {
  const {
    currentUser,
    news,
    polls,
    trainings,
    setActiveTab,
    employees,
    globalSearchQuery,
    setGlobalSearchQuery,
    isLoggedIn,
    openLoginModal
  } = usePortal();

  const activePoll = polls.find(p => p.isActive);

  const pinnedNews = news.filter(n => n.isPinned);
  const upcomingTraining = trainings[0];
  const today = moment();
  const todayDayIndex = (today.day() + 1) % 7;
  const todayStr = `${JALALI_WEEKDAYS[todayDayIndex]}، ${today.jDate()} ${JALALI_MONTHS[today.jMonth()]} ${today.jYear()}`; // Mapping JS day to Sat-first array


  return (
    <div className="space-y-6">
      
      {/* Hero Welcome Banner */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 -ml-12 -mt-12 w-64 h-64 rounded-full bg-[#dc2626]/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <Sparkles className="w-3.5 h-3.5" />
              <span>پرتال سازمانی رویا طرح داخلی | ROYA Surface Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              {currentUser ? `سلام، ${currentUser.firstName} ${currentUser.lastName} عزیز 👋` : 'به پرتال سازمانی رویا طرح داخلی خوش آمدید 👋'}
            </h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-xl leading-relaxed">
              به پرتال یکپارچه رویا طرح داخلی خوش آمدید. امروز {todayStr} است.
            </p>
          </div>

          {/* Quick Stat Pill Cards */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab('polls')}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl backdrop-blur-xs border border-white/10 text-right transition-all"
            >
              <div className="text-[10px] text-[#E6E0D5]">نظرسنجی‌های فعال</div>
              <div className="text-base font-black text-white flex items-center gap-1.5">
                <Vote className="w-4 h-4 text-[#9BB088]" />
                <span>{polls.filter(p => p.isActive).length} نظرسنجی</span>
              </div>
            </button>

            {currentUser ? (
              <button
                onClick={() => setActiveTab('colleagues')}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl backdrop-blur-xs border border-white/10 text-right transition-all"
              >
                <div className="text-[10px] text-[#E6E0D5]">شماره داخلی شما</div>
                <div className="text-base font-black text-white flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-[#D97B5F]" />
                  <span>{currentUser.extension}</span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => openLoginModal('جهت دسترسی به پنل شخصی، ثبت‌نام کارگاه‌ها و مشارکت در گفتگوها وارد شوید.')}
                className="px-4 py-2.5 bg-white/15 hover:bg-white/25 rounded-2xl backdrop-blur-xs border border-white/20 text-right transition-all"
              >
                <div className="text-[10px] text-[#E6E0D5]">حساب کاربری همکاران</div>
                <div className="text-base font-black text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#E6E0D5]" />
                  <span>ورود همکاران</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <WorkAnniversaryWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: News Highlights, Active Poll, Training */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Mood Tracker */}
          <MoodTrackerWidget />

          {/* Mood Dashboard (Manager) */}
          
          {/* Pinned / Latest News Section */}
          <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#F5F2ED] text-[#dc2626] rounded-xl">
                  <Newspaper className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#2D2D2D]">آخرین اخبار و اطلاعیه‌ها</h3>
                  <p className="text-xs text-[#6E6A60]">اطلاع‌رسانی‌های رسمی مدیریت و دپارتمان‌ها</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('news')}
                className="text-xs font-bold text-[#dc2626] hover:underline flex items-center gap-1"
              >
                <span>مشاهده همه اخبار</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {news.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  onClick={() => setActiveTab('news')}
                  className="p-4 bg-[#F5F2ED]/60 hover:bg-[#F5F2ED] rounded-2xl border border-[#E6E0D5] cursor-pointer transition-all space-y-2 group"
                >
                  <img
                    src={item.image || undefined}
                    alt={item.title}
                    className="w-full h-32 object-cover rounded-xl group-hover:opacity-95 transition-opacity"
                  />
                  <div className="flex items-center justify-between text-[10px] text-[#6E6A60]">
                    <span className="font-bold text-[#dc2626]">{item.category}</span>
                    <span>{item.date}</span>
                  </div>
                  <h4 className="text-xs font-bold text-[#2D2D2D] line-clamp-2 group-hover:text-[#dc2626] transition-colors">
                    {item.title}
                  </h4>
                </div>
              ))}
            </div>
          </div>

 

          
          {/* Welcome New Colleagues Wall */}
          <WelcomeNewColleagueCard />

          {/* Active Poll Spotlight Card */}
          {activePoll && (
            <div className="bg-gradient-to-br from-[#F5F2ED] via-white to-[#F7F3ED] rounded-3xl p-6 border border-[#E6E0D5] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#dc2626] text-white rounded-xl">
                    <Vote className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#2D2D2D]">نظرسنجی ویژه سازمان</h3>
                    <p className="text-xs text-[#6E6A60]">نظرسنجی فعال جهت دریافت نظرات همکاران</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-[#D97B5F] text-white text-xs font-bold rounded-full animate-pulse">
                  در حال رای‌گیری
                </span>
              </div>

              <div className="py-4 space-y-2">
                <h4 className="text-sm font-bold text-[#2D2D2D]">{activePoll.title}</h4>
                <p className="text-xs text-[#6E6A60] leading-relaxed">{activePoll.description}</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#6E6A60] font-medium">
                  مجموع شرکت‌کنندگان: <strong>{activePoll.totalVotes} نفر</strong>
                </span>
                <button
                  onClick={() => setActiveTab('polls')}
                  className="px-5 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>شرکت در نظرسنجی و ثبت رای</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          

        
                 

                 </div>

        {/* Right Column: Birthdays & Upcoming Training Widget */}
        <div className="space-y-6">
          
          {/* Dashboard Calendar Widget */}
          <DashboardCalendar />

          {/* Quick Systems Widget */}
          <QuickSystemsWidget />

          {/* Birthday Celebrations Card */}
          <BirthdayCard />

          {/* Upcoming Training Highlight */}
          {upcomingTraining && (
            <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#EFEFEA] text-[#991b1b] rounded-xl">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#2D2D2D]">کارگاه آموزشی پیش‌رو</h3>
                    <p className="text-xs text-[#6E6A60]">برنامه آموزش سازمانی رویا</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#2D2D2D] leading-snug">{upcomingTraining.title}</h4>
                <p className="text-xs text-[#6E6A60] leading-relaxed line-clamp-2">{upcomingTraining.description}</p>
                <div className="text-xs text-[#6E6A60] space-y-1 pt-1">
                  <div>مدرس: <strong>{upcomingTraining.instructor}</strong></div>
                  <div>تاریخ: <strong>{upcomingTraining.date}</strong> (ساعت {upcomingTraining.time})</div>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('training')}
                className="w-full py-2 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl transition-colors text-center block mt-2"
              >
                مشاهده جزییات و ثبت‌نام
              </button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
