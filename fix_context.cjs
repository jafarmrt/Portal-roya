const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// Import AppSettings type
code = code.replace(
  "NotificationItem,\n  ActiveTab,\n  SearchResultItem,\n  MoodState,\n  UserMood\n} from '../types';",
  "NotificationItem,\n  ActiveTab,\n  SearchResultItem,\n  MoodState,\n  UserMood,\n  AppSettings\n} from '../types';"
);

// Add to context type
code = code.replace(
  "  isAuthModalOpen: boolean;\n  setIsAuthModalOpen: (isOpen: boolean) => void;\n",
  "  isAuthModalOpen: boolean;\n  setIsAuthModalOpen: (isOpen: boolean) => void;\n  appSettings: AppSettings | null;\n  updateSettings: (settings: AppSettings) => void;\n"
);

// Add state inside PortalProvider
code = code.replace(
  "const [error, setError] = useState<string | null>(null);",
  "const [error, setError] = useState<string | null>(null);\n  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);"
);

// Fetch settings in Promise.all
code = code.replace(
  "fetch('/api/new_colleagues').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت همکاران جدید'))",
  "fetch('/api/new_colleagues').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت همکاران جدید')),\n      fetch('/api/settings').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت تنظیمات'))"
);

// Handle results
code = code.replace(
  ".then(([pollsData, newsData, employeesData, trainingsData, calendarEventsData, newColleaguesData]) => {",
  ".then(([pollsData, newsData, employeesData, trainingsData, calendarEventsData, newColleaguesData, settingsData]) => {\n      setAppSettings(settingsData);"
);

// Add event listener for settings update
code = code.replace(
  "eventSource.addEventListener('new_colleague_added', (e) => {",
  "eventSource.addEventListener('settings_updated', (e) => {\n      try { setAppSettings(JSON.parse(e.data)); } catch(err) {}\n    });\n    eventSource.addEventListener('new_colleague_added', (e) => {"
);

// Add updateSettings function
code = code.replace(
  "const getGlobalSearchResults = (query: string): SearchResultItem[] => {",
  `const updateSettings = async (settings: AppSettings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        toast.success('تنظیمات با موفقیت به‌روزرسانی شد.');
      } else {
        toast.error('خطا در به‌روزرسانی تنظیمات');
      }
    } catch(e) {
      console.error(e);
      toast.error('خطای شبکه در ارتباط با سرور');
    }
  };

  const getGlobalSearchResults = (query: string): SearchResultItem[] => {`
);

// Add to returned context
code = code.replace(
  "isAuthModalOpen,\n        setIsAuthModalOpen",
  "isAuthModalOpen,\n        setIsAuthModalOpen,\n        appSettings,\n        updateSettings"
);

fs.writeFileSync('src/context/PortalContext.tsx', code);
