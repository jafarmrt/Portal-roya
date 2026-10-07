const fs = require('fs');
let text = fs.readFileSync('CHANGELOG.md', 'utf8');

const newVersion = `
## [1.3.0] - 2026-08-03
### Added
- **Work Anniversary**: Added a new widget that celebrates the user's organizational anniversary.
- **Mood Tracker**: Added a daily mood tracker for users that provides a motivational message based on their mood.
- **Mood Dashboard**: Added a chart for system administrators to view the overall mood of the organization (using Recharts).
- **Calendar Enhancements**: Clicking on a date in the dashboard calendar now opens a modal with a summary of the events for that day.

### Changed
- **Color Theme**: Changed the primary brand color from natural tones to Red (#dc2626) as requested.
- **Typography**: Replaced the default font with Vazirmatn.
- **Dashboard Layout**: Reorganized dashboard widgets, moving News to the top and Polls to the bottom.
`;

text = text.replace('## [1.2.0]', newVersion + '\n## [1.2.0]');
fs.writeFileSync('CHANGELOG.md', text);
