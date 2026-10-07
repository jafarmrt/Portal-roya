# Changelog

All notable changes to the Roya Tarh Dakheli Organization Portal will be documented in this file.


## [1.3.0] - 2026-08-03
### Added
- **Today's Date**: Display today's Jalali date on the Dashboard welcome banner.
- **Accurate Calendar Holidays**: Mapped fixed Solar holidays and computed 1403 Lunar-to-Solar dates for the calendar.
- **Interactive Calendar**: Complete redesign of Calendar module. Added Jalali grid calendar with month navigation. Added support for national and religious Iranian holidays. Displays daily employee birthdays alongside other events.
- **Real-Time Updates (SSE)**: Added Server-Sent Events to push updates (like new news items and poll changes) instantly to connected clients without reloading.
- **Loading & Error States**: Implemented global application loading states and robust error handling boundaries for network failures.
- **Role Based Access Control (RBAC)**: Added security middleware to API endpoints. Only managers can create polls, publish news, and access the global organizational mood dashboard.
- **API Layer (Phase 2)**: Added Express.js backend to serve as a full-stack application. Moved Polls logic to the server with PostgreSQL database to prevent cheating and duplicate votes. HR data (like passwords) are now stripped from API responses to keep sensitive data hidden.
- **Font Update**: Fixed the Vazirmatn font to apply correctly across the application via Tailwind configuration.
- **Cloud SQL Integration (Phase 1)**: Provisioned a PostgreSQL database using Cloud SQL, configured Firebase Authentication for secure API access, and set up Drizzle ORM for schema management.
- **Organizational Systems**: Added a dedicated 'Systems' module and dashboard widget providing quick access to organizational tools like CRM, Automation, and Attendance.
- **Work Anniversary**: Added a new widget that celebrates the user's organizational anniversary.
- **Mood Tracker**: Added a daily mood tracker for users that provides a motivational message based on their mood.
- **Mood Dashboard**: Added a chart for system administrators to view the overall mood of the organization (using Recharts).
- **Calendar Enhancements**: Clicking on a date in the dashboard calendar now opens a modal with a summary of the events for that day.

### Changed
- **Color Theme**: Changed the primary brand color from natural tones to Red (#dc2626) as requested.
- **Typography**: Replaced the default font with Vazirmatn.
- **Dashboard Layout**: Reorganized dashboard widgets, moving News to the top and Polls to the bottom.

## [1.2.0] - 2026-08-03
### Changed
- **Design Theme Update**: Applied the "Natural Tones" visual theme across the entire organizational portal while maintaining all HTML structure, components, and interactive features.
- **Color Palette & Styling**:
  - Warm neutral canvas background (`#FDFBF7`) with soft borders (`#E6E0D5`) and natural grey accents (`#F5F2ED`).
  - Dark forest green header banners (`from-[#2C3028] via-[#383D33] to-[#5B6350]`) replacing slate gradients.
  - Wood brown (`#8C7355`) and sage green (`#5B6350`) primary accent buttons and active badges replacing generic red/blue tones.
  - Terracotta (`#D97B5F`) subtle highlight accents for like buttons and alerts.
- **Updated Components**:
  - `App.tsx`, `Header.tsx`, `Navigation.tsx`, `RoyaLogo.tsx`
  - `DashboardModule.tsx`, `BirthdayCard.tsx`, `WelcomeNewColleagueCard.tsx`
  - `PollsModule.tsx`, `AddPollModal.tsx`
  - `ColleaguesDirectory.tsx`, `UserProfileModal.tsx`, `EditProfileModal.tsx`
  - `NewsModule.tsx`, `AddNewsModal.tsx`
  - `TrainingModule.tsx`, `AddTrainingModal.tsx`
  - `CalendarModule.tsx`
  - `NotificationsInbox.tsx`
