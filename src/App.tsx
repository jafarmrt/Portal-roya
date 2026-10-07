import React, { useState } from 'react';
import { PortalProvider, usePortal } from './context/PortalContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { DashboardModule } from './components/dashboard/DashboardModule';
import { PollsModule } from './components/polls/PollsModule';
import { ColleaguesDirectory } from './components/colleagues/ColleaguesDirectory';
import { GlobalSearchModule } from './components/search/GlobalSearchModule';
import { NewsModule } from './components/news/NewsModule';
import { TrainingModule } from './components/training/TrainingModule';
import { CalendarModule } from './components/calendar/CalendarModule';
import { NotificationsInbox } from './components/notifications/NotificationsInbox';

import { LoginModal } from './components/LoginModal';
import { MobileBottomBar } from './components/common/MobileBottomBar';
import { Setup } from './components/Setup';
import { SystemsModule } from './components/systems/SystemsModule';
import { ReportsModule } from './components/reports/ReportsModule';
import { Loader2, AlertCircle } from 'lucide-react';
import { Toaster } from 'react-hot-toast';


const MainContent: React.FC = () => {

  const { activeTab, isSetupComplete, isLoading, error, currentUser } = usePortal();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-[#dc2626] animate-spin" />
        <p className="text-[#6e6a60] font-medium text-sm animate-pulse">در حال دریافت اطلاعات پرتال...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-[#fca5a5] max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-[#fef2f2] text-[#dc2626] rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#2d2d2d]">خطا در بارگذاری</h2>
          <p className="text-sm text-[#6e6a60]">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-[#dc2626] text-white font-bold rounded-xl mt-4 hover:bg-[#b91c1c] transition-colors">
            تلاش مجدد
          </button>
        </div>
      </div>
    );
  }

  if (isSetupComplete === false) {
    return <Setup />;
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D2D2D] flex flex-col font-sans pb-16 lg:pb-0" dir="rtl">
      {/* Contextual Login Modal */}
      <LoginModal />

      {/* Top Sticky Header */}
      <Header
        onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
        isMobileNavOpen={isMobileNavOpen}
      />

      {/* Primary Tab Navigation */}
      <Navigation
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />

      {/* Main Container View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && <DashboardModule />}
        {activeTab === 'polls' && <PollsModule />}
        {activeTab === 'colleagues' && <ColleaguesDirectory />}
        {activeTab === 'search' && <GlobalSearchModule />}
        {activeTab === 'news' && <NewsModule />}
        {activeTab === 'training' && <TrainingModule />}
        {activeTab === 'calendar' && <CalendarModule />}
        {activeTab === 'notifications' && <NotificationsInbox />}
        {activeTab === 'systems' && <SystemsModule />}
        {activeTab === 'reports' && currentUser?.role === 'manager' && <ReportsModule />}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomBar />

      {/* Footer */}
      <footer className="bg-[#7f1d1d] text-[#E6E0D5] border-t border-[#7f1d1d] py-6 mt-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div>
            <span className="font-bold text-white">شرکت رویا طرح داخلی (ROYA Surface Center)</span>
            <p className="text-[11px] text-[#A8A295] mt-0.5">پرتال جامع اتوماسیون، نظرسنجی، اطلاعیه‌ها و پروفایل همکاران</p>
          </div>
          <div className="text-[11px] text-[#A8A295]">
            طراحی شده با هویت بصری سازمانی رویا © 1403
          </div>
        </div>
      </footer>

    </div>
  );
};

export default function App() {
  return (
    <PortalProvider>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#333', color: '#fff' } }} />
      <MainContent />
    </PortalProvider>
  );
}
