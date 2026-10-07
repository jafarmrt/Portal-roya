const fs = require('fs');
let code = fs.readFileSync('src/context/PortalContext.tsx', 'utf8');

// Remove import { INITIAL_... } from '../data/mockData';
code = code.replace(/import\s*{\s*INITIAL_[^}]*}\s*from\s*'..\/data\/mockData';/g, '');

code = code.replace(/useState<UserProfile\[\]>\(INITIAL_EMPLOYEES\)/g, 'useState<UserProfile[]>([])');
code = code.replace(/useState<Poll\[\]>\(INITIAL_POLLS\)/g, 'useState<Poll[]>([])');
code = code.replace(/useState<NewsItem\[\]>\(INITIAL_NEWS\)/g, 'useState<NewsItem[]>([])');
code = code.replace(/useState<NewColleagueWelcome\[\]>\(INITIAL_NEW_COLLEAGUES\)/g, 'useState<NewColleagueWelcome[]>([])');
code = code.replace(/useState<TrainingProgram\[\]>\(INITIAL_TRAININGS\)/g, 'useState<TrainingProgram[]>([])');
code = code.replace(/useState<CalendarEvent\[\]>\(INITIAL_CALENDAR_EVENTS\)/g, 'useState<CalendarEvent[]>([])');

code = code.replace(/return saved \? JSON.parse\(saved\) : INITIAL_NOTIFICATIONS;/g, 'return saved ? JSON.parse(saved) : [];');

code = code.replace(/setEmployees\(INITIAL_EMPLOYEES\);/g, 'setEmployees([]);');
code = code.replace(/setPolls\(INITIAL_POLLS\);/g, 'setPolls([]);');
code = code.replace(/setNews\(INITIAL_NEWS\);/g, 'setNews([]);');
code = code.replace(/setNewColleagues\(INITIAL_NEW_COLLEAGUES\);/g, 'setNewColleagues([]);');
code = code.replace(/setTrainings\(INITIAL_TRAININGS\);/g, 'setTrainings([]);');
code = code.replace(/setCalendarEvents\(INITIAL_CALENDAR_EVENTS\);/g, 'setCalendarEvents([]);');
code = code.replace(/setNotifications\(INITIAL_NOTIFICATIONS\);/g, 'setNotifications([]);');

fs.writeFileSync('src/context/PortalContext.tsx', code);
