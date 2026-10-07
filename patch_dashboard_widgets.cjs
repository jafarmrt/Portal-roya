const fs = require('fs');
let code = fs.readFileSync('src/components/dashboard/DashboardModule.tsx', 'utf8');

// Add imports
code = code.replace(
  "import { WelcomeNewColleagueCard }",
  "import { WorkAnniversaryWidget } from './WorkAnniversaryWidget';\nimport { MoodTrackerWidget } from './MoodTrackerWidget';\nimport { MoodDashboardWidget } from './MoodDashboardWidget';\nimport { WelcomeNewColleagueCard }"
);

// Add WorkAnniversary right below Main Grid Section
code = code.replace(
  "{/* Main Grid Section */}\n      <div className=\"grid grid-cols-1 lg:grid-cols-3 gap-6\">",
  "{/* Main Grid Section */}\n      <WorkAnniversaryWidget />\n\n      <div className=\"grid grid-cols-1 lg:grid-cols-3 gap-6\">"
);

// Add MoodTracker right above News
const newsStart = "{/* Pinned / Latest News Section */}";
code = code.replace(
  newsStart,
  "{/* Mood Tracker */}\n          <MoodTrackerWidget />\n\n          {/* Mood Dashboard (Manager) */}\n          <MoodDashboardWidget />\n\n          " + newsStart
);

fs.writeFileSync('src/components/dashboard/DashboardModule.tsx', code);
