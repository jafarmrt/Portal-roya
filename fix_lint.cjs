const fs = require('fs');

// Fix App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf8');
appCode = appCode.replace(
  "{activeTab === 'settings' && userRole === 'manager' && <SettingsModule />}",
  "{activeTab === 'settings' && currentUser?.role === 'manager' && <SettingsModule />}"
);
fs.writeFileSync('src/App.tsx', appCode);

// Fix PortalContext.tsx
let portalCode = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// The type AppSettings wasn't imported properly maybe?
if (!portalCode.includes("import {") || !portalCode.includes("AppSettings")) {
  // Let's just import it at the top if needed
  portalCode = portalCode.replace(
    "import { UserProfile, Poll, NewsItem, TrainingProgram, NotificationItem, ActiveTab, SearchResultItem, MoodState, UserMood } from '../types';",
    "import { UserProfile, Poll, NewsItem, TrainingProgram, NotificationItem, ActiveTab, SearchResultItem, MoodState, UserMood, AppSettings } from '../types';"
  );
}

fs.writeFileSync('src/context/PortalContext.tsx', portalCode);

