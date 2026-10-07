const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

if (!code.includes("import { AppSettings }")) {
  code = code.replace(
    "import { UserProfile, Poll, NewsItem, TrainingProgram, NotificationItem, ActiveTab, SearchResultItem, MoodState, UserMood } from '../types';",
    "import { UserProfile, Poll, NewsItem, TrainingProgram, NotificationItem, ActiveTab, SearchResultItem, MoodState, UserMood, AppSettings } from '../types';"
  );
  
  // also check if we replaced it earlier using a multi-line match
  code = code.replace(
    "UserMood\n} from '../types';",
    "UserMood,\n  AppSettings\n} from '../types';"
  );
  
  code = "import { AppSettings } from '../types';\n" + code;
}

fs.writeFileSync('src/context/PortalContext.tsx', code);
