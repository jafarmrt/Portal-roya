# Changelog

All notable changes to the Roya Tarh Dakheli Organization Portal will be documented in this file.


## [2.2.0] - 2026-10-26
بهبود رابط و تجربهٔ کاربری.

### دسترسی سریع به سامانه‌های سازمان
- دکمهٔ «سامانه‌ها» در هدر همهٔ صفحات (روی موبایل هم) که فهرست همهٔ سامانه‌ها را باز می‌کند؛ هر سامانه در زبانهٔ جدید باز می‌شود.
- نوار «سامانه‌های سازمان» درست زیر بنر خوش‌آمد داشبورد، بدون نیاز به اسکرول. همهٔ سامانه‌ها نمایش داده می‌شوند (نه فقط ۴ تا).
- «سامانه‌ها» به منوی اصلی دسکتاپ اضافه شد.
- مدیر می‌تواند ترتیب سامانه‌ها را تغییر دهد؛ آیکون‌ها نام فارسی دارند و آیکون‌های تازه (ایمیل، حسابداری، انبار و ...) اضافه شد.
- سامانه‌ای که آدرسش ثبت نشده، غیرفعال و با توضیح نمایش داده می‌شود (قبلاً خود پرتال را در زبانهٔ جدید باز می‌کرد).

### پنجره‌های بازشو
- بالای کارت همکار (عکس و نام) زیر بنر قرمز بریده می‌شد؛ اصلاح شد و دکمه‌های بستن و ویرایش همیشه دیده می‌شوند.
- همهٔ پنجره‌ها (ویرایش پروفایل، نظرسنجی، تقویم، نتایج نظرسنجی و ...) یک قالب مشترک دارند: هیچ‌وقت از ارتفاع صفحه بلندتر نمی‌شوند، سرتیتر و دکمه‌های ذخیره ثابت می‌مانند و فقط محتوا اسکرول می‌خورد. روی موبایل از پایین صفحه باز می‌شوند.
- تقویم انتخاب تاریخ دیگر داخل پنجره بریده نمی‌شود و اگر جا نباشد رو به بالا باز می‌شود؛ Esc فقط تقویم را می‌بندد.
- صفحهٔ پشت پنجره هنگام باز بودن آن اسکرول نمی‌خورد.
- منوی کشویی موبایل اسکرول می‌خورد تا گزینه‌های پایین (گزارش‌ها، تنظیمات) روی گوشی‌های کوچک پنهان نمانند.
- جستجوی سریع (Ctrl+K) و منوهای اعلان روی صفحه‌های کوتاه و موبایل کامل دیده می‌شوند.

### سایر
- گزینهٔ «ویرایش اطلاعات من» در منوی حساب کاربری.
- منوهای هدر با کلیک بیرون از آن‌ها بسته می‌شوند.
- رفع اسکرول افقی کل صفحه در تقویم سازمانی روی موبایل.
- بنرهای بالای صفحات و لوگو روی موبایل جمع‌وجورتر شدند؛ پیام‌ها دیگر زیر نوار پایین موبایل نمی‌روند.

## [2.1.0] - 2026-10-26

### Changed
- The server is bundled with all its dependencies into `server-dist/index.cjs`, so the build runs without `node_modules`.
- GitHub Actions publishes a ready-to-run bundle (`roya-portal.tar.gz`) as a release for every green commit on `main`.
- `deploy/update.sh` installs or updates from that release with no git or npm on the server. It backs up the database, keeps the last 3 versions, rolls back if the health check fails, and under cron skips a version that already failed.
- `deploy/INSTALL-PM2.md` rewritten for the release-based install.

## [2.0.0] - 2026-10-26
بازنویسی برای استقرار روی سرور داخلی شرکت.

### امنیت
- ورود با نام کاربری و رمز روی سرور، نشست در کوکی HttpOnly؛ حذف هدر قابل جعل `X-User-Id` و دکمه‌های ورود آزمایشی.
- ذخیرهٔ رمزها با bcrypt، تغییر رمز، رمز موقت برای همکار جدید و اجبار به تغییر آن در اولین ورود، قفل حساب پس از ۵ تلاش ناموفق.
- لزوم ورود برای همهٔ APIها و فایل‌ها، بررسی دسترسی مدیر روی سرور، اعتبارسنجی همهٔ ورودی‌ها با zod، helmet و محدودیت تعداد درخواست ورود.

### داده‌ها
- انتقال همهٔ داده‌هایی که فقط در مرورگر بود به سرور: اعلان‌ها، لایک‌ها، پیام‌های تبریک و خوش‌آمد، ویرایش پروفایل، مهارت‌ها و سوابق، تعطیلات سفارشی و سامانه‌ها.
- رأی یکتا در نظرسنجی با قید پایگاه داده، اعمال مهلت نظرسنجی روی سرور، migrationهای خودکار پایگاه داده.

### اطلاع‌رسانی
- بخشنامه با «مطالعه کردم» و گزارش خوانده‌ها/نخوانده‌ها برای مدیر.
- ارسال خبر برای واحدهای مشخص، زمان‌بندی انتشار و تاریخ انقضا، تصویر و پیوست (PDF، Word، Excel…) با بارگذاری روی سرور.
- کتابخانهٔ اسناد و فرم‌ها، چارت سازمانی، ایمیل اخبار فوری از طریق SMTP داخلی، به‌روزرسانی زنده و لینک مستقیم از اعلان به خبر.
- صفحهٔ تنظیمات مدیر برای واحدها و دسته‌بندی‌ها، گزارش میزان دیده‌شدن اطلاعیه‌ها.

### زیرساخت
- حذف وابستگی‌های ابری (Firebase، Google Fonts) و فونت وزیرمتن محلی.
- Dockerfile و docker-compose، نمونهٔ تنظیم nginx، راهنمای نصب و پشتیبان‌گیری، ESLint، تست‌های خودکار و CI.
- حذف اسکریپت‌های موقت و فایل‌های بلااستفاده از مخزن.

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
