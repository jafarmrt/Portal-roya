import React, { lazy, Suspense, useState } from 'react';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { PortalProvider, usePortal } from './context/PortalContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { MobileBottomBar } from './components/common/MobileBottomBar';
import { Setup } from './components/Setup';
import { LoginModal, LoginPage } from './components/LoginPage';
import { ForcePasswordChangePage } from './components/ChangePasswordModal';
import { CompleteProfilePage } from './components/CompleteProfilePage';
import { DashboardModule } from './components/dashboard/DashboardModule';
import { ErrorBoundary, loadModule } from './components/common/ErrorBoundary';
import { SiteBanner } from './components/common/SiteBanner';
import { InstallApp } from './components/common/InstallApp';
import { VersionInfo } from './components/common/VersionInfo';
import { currentJalaliYear, toPersianDigits } from './lib/jalali';
import { useTabBadge } from './lib/tabBadge';
import { tabOn } from './lib/features';
import { KudosListener } from './components/online/KudosListener';
import { useAppearance } from './lib/appearance';

// Secondary modules load on demand to keep the first download small.
const named = <T,>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loadModule(loader)().then((m) => ({ default: m[key] as unknown as React.ComponentType })));

const PollsModule = named(() => import('./components/polls/PollsModule'), 'PollsModule');
const ColleaguesDirectory = named(() => import('./components/colleagues/ColleaguesDirectory'), 'ColleaguesDirectory');
const OrgChartModule = named(() => import('./components/colleagues/OrgChartModule'), 'OrgChartModule');
const GlobalSearchModule = named(() => import('./components/search/GlobalSearchModule'), 'GlobalSearchModule');
const NewsModule = named(() => import('./components/news/NewsModule'), 'NewsModule');
const DocumentsModule = named(() => import('./components/documents/DocumentsModule'), 'DocumentsModule');
const GuidesModule = named(() => import('./components/guides/GuidesModule'), 'GuidesModule');
const DepartmentsModule = named(() => import('./components/departments/DepartmentsModule'), 'DepartmentsModule');
const TrainingModule = named(() => import('./components/training/TrainingModule'), 'TrainingModule');
const CalendarModule = named(() => import('./components/calendar/CalendarModule'), 'CalendarModule');
const NotificationsInbox = named(() => import('./components/notifications/NotificationsInbox'), 'NotificationsInbox');
const SystemsModule = named(() => import('./components/systems/SystemsModule'), 'SystemsModule');
const ReportsModule = named(() => import('./components/reports/ReportsModule'), 'ReportsModule');
const PeopleManagement = named(() => import('./components/colleagues/PeopleManagement'), 'PeopleManagement');
const AdminSettingsModule = named(() => import('./components/admin/AdminSettingsModule'), 'AdminSettingsModule');
const AuditLogModule = named(() => import('./components/admin/AuditLogModule'), 'AuditLogModule');
const SuggestionsModule = named(() => import('./components/suggestions/SuggestionsModule'), 'SuggestionsModule');
const TodosPage = named(() => import('./components/todos/TodosPage'), 'TodosPage');

const FullScreenLoader: React.FC<{ text: string }> = ({ text }) => (
  <div className="min-h-screen bg-page flex flex-col items-center justify-center gap-4" role="status">
    <Loader2 className="w-10 h-10 text-brand animate-spin" />
    <p className="text-muted font-medium text-sm">{text}</p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-page flex flex-col items-center justify-center p-6">
    <div role="alert" className="bg-white p-8 rounded-3xl shadow-sm border border-red-300 max-w-md w-full text-center space-y-4">
      <div className="w-12 h-12 bg-brand-soft text-brand rounded-2xl flex items-center justify-center mx-auto">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-ink">خطا در بارگذاری پرتال</h2>
      <p className="text-sm text-muted">{message}</p>
      <button onClick={() => window.location.reload()} className="w-full py-3 bg-brand text-white font-bold rounded-xl mt-4 hover:bg-brand-hover transition-colors">
        تلاش دوباره
      </button>
    </div>
  </div>
);

/** Shown to guests in place of a page that needs a signed-in user. */
const LoginRequired: React.FC<{ message: string }> = ({ message }) => {
  const { requestLogin } = usePortal();
  return (
    <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-3xl border border-line text-center space-y-4">
      <div className="w-12 h-12 bg-brand-soft text-brand-strong rounded-2xl flex items-center justify-center mx-auto">
        <LogIn className="w-6 h-6" />
      </div>
      <p className="text-sm text-ink-soft leading-relaxed">{message}</p>
      <button onClick={() => requestLogin()} className="w-full py-3 bg-brand-strong hover:bg-brand-deep text-white font-bold rounded-xl transition-colors">
        ورود به پرتال
      </button>
    </div>
  );
};

/** In place of a part of the portal that is not switched on yet (e.g. an old link to it). */
const NotAvailable: React.FC = () => {
  const { setActiveTab } = usePortal();
  return (
    <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-3xl border border-line text-center space-y-4">
      <p className="text-sm text-ink-soft leading-relaxed">این بخش فعلاً در پرتال در دسترس نیست.</p>
      <button onClick={() => setActiveTab('dashboard')} className="w-full py-3 bg-brand-strong hover:bg-brand-deep text-white font-bold rounded-xl transition-colors">
        رفتن به داشبورد
      </button>
    </div>
  );
};

/** Reminds guests they are reading in view-only mode. */
const GuestBanner: React.FC = () => {
  const { requestLogin } = usePortal();
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900" role="status">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>شما به صورت مهمان در حال مشاهدهٔ پرتال هستید. برای ثبت نظر، رأی، تبریک و دیدن اعلان‌های خود وارد شوید.</span>
        <button onClick={() => requestLogin()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-900 text-white font-bold hover:bg-amber-950">
          <LogIn className="w-3.5 h-3.5" /> ورود
        </button>
      </div>
    </div>
  );
};

const MainContent: React.FC = () => {
  const { activeTab, isSetupComplete, authChecked, currentUser, isGuest, appSettings, isLoading, error, can, isAdmin, notifications, featureOn } = usePortal();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  useTabBadge(notifications.filter((n) => !n.isRead).length);

  if (!authChecked) return <FullScreenLoader text="در حال اتصال به پرتال..." />;
  if (error && isSetupComplete === null) return <ErrorScreen message={error} />;
  if (isSetupComplete === false) return <Setup />;
  if (!currentUser && !isGuest) return <LoginPage />;
  if (currentUser?.mustChangePassword) return <ForcePasswordChangePage />;
  if (currentUser?.needsProfile) return <CompleteProfilePage />;
  // Keep the page on screen while it reloads after signing in or out.
  if (isLoading && !appSettings) return <FullScreenLoader text="در حال دریافت اطلاعات پرتال..." />;
  if (error) return <ErrorScreen message={error} />;

  const directoryHidden = isGuest && !appSettings?.guestDirectory;
  const directoryNotice = 'دفتر تلفن و اطلاعات همکاران فقط برای کاربران واردشده نمایش داده می‌شود.';

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col font-sans pb-16 lg:pb-0" dir="rtl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-50 bg-white px-3 py-2 rounded-lg shadow">
        پرش به محتوای اصلی
      </a>

      <Header onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} isMobileNavOpen={isMobileNavOpen} />
      <Navigation isMobileNavOpen={isMobileNavOpen} onCloseMobileNav={() => setIsMobileNavOpen(false)} />
      {isGuest && <GuestBanner />}
      <SiteBanner />

      <main id="main" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>}>
            {tabOn(appSettings, activeTab) ? (
              // Each part of the portal fades in softly when you move to it.
              <div key={activeTab} className="page-enter">
                {activeTab === 'dashboard' && <DashboardModule />}
                {activeTab === 'polls' && <PollsModule />}
                {activeTab === 'colleagues' && (directoryHidden ? <LoginRequired message={directoryNotice} /> : <ColleaguesDirectory />)}
                {activeTab === 'orgchart' && (directoryHidden ? <LoginRequired message={directoryNotice} /> : <OrgChartModule />)}
                {activeTab === 'departments' && (directoryHidden ? <LoginRequired message={directoryNotice} /> : <DepartmentsModule />)}
                {activeTab === 'search' && <GlobalSearchModule />}
                {activeTab === 'news' && <NewsModule />}
                {activeTab === 'documents' && <DocumentsModule />}
                {activeTab === 'guides' && <GuidesModule />}
                {activeTab === 'training' && <TrainingModule />}
                {activeTab === 'calendar' && <CalendarModule />}
                {activeTab === 'notifications' &&
                  (isGuest ? <LoginRequired message="برای دیدن اعلان‌های خود وارد حساب کاربری شوید." /> : <NotificationsInbox />)}
                {activeTab === 'suggestions' &&
                  (isGuest ? <LoginRequired message="برای فرستادن انتقاد یا پیشنهاد وارد حساب کاربری شوید." /> : <SuggestionsModule />)}
                {activeTab === 'todos' &&
                  (isGuest ? <LoginRequired message="برای دیدن یادداشت‌های خود وارد حساب کاربری شوید." /> : <TodosPage />)}
                {activeTab === 'systems' && <SystemsModule />}
                {activeTab === 'reports' && can('reports.view') && <ReportsModule />}
                {activeTab === 'people' && can('users.manage') && <PeopleManagement />}
                {activeTab === 'admin' && (isAdmin || can('settings.manage')) && <AdminSettingsModule />}
                {activeTab === 'audit' && isAdmin && <AuditLogModule />}
              </div>
            ) : (
              <NotAvailable />
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      <MobileBottomBar />
      {currentUser && featureOn('onlineColleagues') && <KudosListener emojis={appSettings?.kudosEmojis ?? []} />}
      {isGuest && <LoginModal />}

      <footer className="bg-surface text-muted border-t border-line py-6 mt-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div>
            <span className="font-bold text-ink">شرکت رویا طرح داخلی (ROYA Surface Center)</span>
            <p className="text-xs text-muted mt-0.5">پرتال اطلاع‌رسانی، اخبار، اطلاعیه‌ها و ارتباط همکاران</p>
          </div>
          <div className="flex flex-col items-center sm:items-end gap-1 text-xs text-muted">
            <span>© {toPersianDigits(currentJalaliYear())}</span>
            <VersionInfo />
            <InstallApp />
          </div>
        </div>
      </footer>
    </div>
  );
};

/** Keeps the page's look in step with the person's choice (and the device, for «مثل دستگاه»). */
const AppearanceSync: React.FC = () => {
  useAppearance();
  return null;
};

export default function App() {
  return (
    <ErrorBoundary fullScreen>
      <PortalProvider>
        <Toaster position="bottom-left" containerClassName="portal-toaster" toastOptions={{ style: { background: '#333', color: '#fff', fontFamily: 'inherit' } }} />
        <AppearanceSync />
        <MainContent />
      </PortalProvider>
    </ErrorBoundary>
  );
}
