const fs = require('fs');

let dashCode = fs.readFileSync('src/components/dashboard/DashboardModule.tsx', 'utf8');
dashCode = dashCode.replace("import { MoodDashboardWidget } from './MoodDashboardWidget';\n", "");
dashCode = dashCode.replace("<MoodDashboardWidget />\n", "");
fs.writeFileSync('src/components/dashboard/DashboardModule.tsx', dashCode);
