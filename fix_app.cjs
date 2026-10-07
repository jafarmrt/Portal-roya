const fs = require('fs');

// App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf8');
appCode = appCode.replace(
  "import { SettingsModule } from './components/settings/SettingsModule';",
  "import { ReportsModule } from './components/reports/ReportsModule';"
);
appCode = appCode.replace(
  "{activeTab === 'settings' && currentUser?.role === 'manager' && <SettingsModule />}",
  "{activeTab === 'reports' && currentUser?.role === 'manager' && <ReportsModule />}"
);
fs.writeFileSync('src/App.tsx', appCode);

// Navigation.tsx
let navCode = fs.readFileSync('src/components/Navigation.tsx', 'utf8');
navCode = navCode.replace(
  "navItems.push({ id: 'settings', label: 'تنظیمات سیستم', icon: <Settings className=\"w-4 h-4\" /> });",
  "navItems.push({ id: 'reports', label: 'گزارشات', icon: <Settings className=\"w-4 h-4\" /> });"
);
navCode = navCode.replace(
  "import {",
  "import { BarChart2,"
);
navCode = navCode.replace(
  "icon: <Settings className=\"w-4 h-4\" />",
  "icon: <BarChart2 className=\"w-4 h-4\" />"
);
fs.writeFileSync('src/components/Navigation.tsx', navCode);

// types.ts
let typesCode = fs.readFileSync('src/types.ts', 'utf8');
typesCode = typesCode.replace(
  "| 'settings';",
  "| 'reports';"
);
fs.writeFileSync('src/types.ts', typesCode);
