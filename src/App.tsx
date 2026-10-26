import React, { lazy, Suspense, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { PortalProvider, usePortal } from './context/PortalContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { MobileBottomBar } from './components/common/MobileBottomBar';
import { Setup } from './components/Setup';
import { LoginPage } from './components/LoginPage';
import { ForcePasswordChangePage } from './components/ChangePasswordModal';
import { DashboardModule } from './components/dashboard/DashboardModule';
import { currentJalaliYear, toPersianDigits } from './lib/jalali';

// Secondary modules load on demand to keep the first download small.
const named = <T,>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as unknown as React.ComponentType })));

const PollsModule = named(() => import('./components/polls/PollsModule'), 'PollsModule');
const ColleaguesDirectory = named(() => import('./components/colleagues/ColleaguesDirectory'), 'ColleaguesDirectory');
const OrgChartModule = named(() => import('./components/colleagues/OrgChartModule'), 'OrgChartModule');
const GlobalSearchModule = named(() => import('./components/search/GlobalSearchModule'), 'GlobalSearchModule');
const NewsModule = named(() => import('./components/news/NewsModule'), 'NewsModule');
const DocumentsModule = named(() => import('./components/documents/DocumentsModule'), 'DocumentsModule');
const TrainingModule = named(() => import('./components/training/TrainingModule'), 'TrainingModule');
const CalendarModule = named(() => import('./components/calendar/CalendarModule'), 'CalendarModule');
const NotificationsInbox = named(() => import('./components/notifications/NotificationsInbox'), 'NotificationsInbox');
const SystemsModule = named(() => import('./components/systems/SystemsModule'), 'SystemsModule');
const ReportsModule = named(() => import('./components/reports/ReportsModule'), 'ReportsModule');
const AdminSettingsModule = named(() => import('./components/admin/AdminSettingsModule'), 'AdminSettingsModule');

const FullScreenLoader: React.FC<{ text: string }> = ({ text }) => (
  <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center gap-4" role="status">
    <Loader2 className="w-10 h-10 text-[#dc2626] animate-spin" />
    <p className="text-[#6e6a60] font-medium text-sm">{text}</p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6">
    <div role="alert" className="bg-white p-8 rounded-3xl shadow-sm border border-[#fca5a5] max-w-md w-full text-center space-y-4">
      <div className="w-12 h-12 bg-[#fef2f2] text-[#dc2626] rounded-2xl flex items-center justify-center mx-auto">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-[#2d2d2d]">خطا در بارگذاری پرتال</h2>
      <p className="text-sm text-[#6e6a60]">{message}</p>
      <button onClick={() => window.location.reload()} className="w-full py-3 bg-[#dc2626] text-white font-bold rounded-xl mt-4 hover:bg-[#b91c1c] transition-colors">
        تلاش دوباره
      </button>
    </div>
  </div>
);

const MainContent: React.FC = () => {
  const { activeTab, isSetupComplete, authChecked, currentUser, isLoading, error } = usePortal();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  if (!authChecked) return <FullScreenLoader text="در حال اتصال به پرتال..." />;
  if (error && isSetupComplete === null) return <ErrorScreen message={error} />;
  if (isSetupComplete === false) return <Setup />;
  if (!currentUser) return <LoginPage />;
  if (currentUser.mustChangePassword) return <ForcePasswordChangePage />;
  if (isLoading) return <FullScreenLoader text="در حال دریافت اطلاعات پرتال..." />;
  if (error) return <ErrorScreen message={error} />;

  const isManager = currentUser.role === 'manager';

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D2D2D] flex flex-col font-sans pb-16 lg:pb-0" dir="rtl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 bg-white px-3 py-2 rounded-lg shadow">
        پرش به محتوای اصلی
      </a>

      <Header onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} isMobileNavOpen={isMobileNavOpen} />
      <Navigation isMobileNavOpen={isMobileNavOpen} onCloseMobileNav={() => setIsMobileNavOpen(false)} />

      <main id="main" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>}>
          {activeTab === 'dashboard' && <DashboardModule />}
          {activeTab === 'polls' && <PollsModule />}
          {activeTab === 'colleagues' && <ColleaguesDirectory />}
          {activeTab === 'orgchart' && <OrgChartModule />}
          {activeTab === 'search' && <GlobalSearchModule />}
          {activeTab === 'news' && <NewsModule />}
          {activeTab === 'documents' && <DocumentsModule />}
          {activeTab === 'training' && <TrainingModule />}
          {activeTab === 'calendar' && <CalendarModule />}
          {activeTab === 'notifications' && <NotificationsInbox />}
          {activeTab === 'systems' && <SystemsModule />}
          {activeTab === 'reports' && isManager && <ReportsModule />}
          {activeTab === 'admin' && isManager && <AdminSettingsModule />}
        </Suspense>
      </main>

      <MobileBottomBar />

      <footer className="bg-[#7f1d1d] text-[#E6E0D5] border-t border-[#7f1d1d] py-6 mt-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div>
            <span className="font-bold text-white">شرکت رویا طرح داخلی (ROYA Surface Center)</span>
            <p className="text-[11px] text-[#E6E0D5]/80 mt-0.5">پرتال اطلاع‌رسانی، اخبار، اطلاعیه‌ها و ارتباط همکاران</p>
          </div>
          <div className="text-[11px] text-[#E6E0D5]/80">© {toPersianDigits(currentJalaliYear())}</div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <PortalProvider>
      <Toaster position="bottom-left" toastOptions={{ style: { background: '#333', color: '#fff', fontFamily: 'inherit' } }} />
      <MainContent />
    </PortalProvider>
  );
}
