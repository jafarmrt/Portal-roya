-- The built-in roles are access levels, not ranks in the organisation, so they get names that say so.
-- A name an administrator already changed, or one another role already uses, is left as it is.
UPDATE "roles" SET "name" = 'ادمین پرتال' WHERE "id" = 'admin' AND "name" = 'ادمین برنامه' AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'ادمین پرتال');
--> statement-breakpoint
UPDATE "roles" SET "name" = 'ناشر محتوا' WHERE "id" = 'manager' AND "name" = 'مدیر' AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'ناشر محتوا');
--> statement-breakpoint
UPDATE "roles" SET "name" = 'همکار' WHERE "id" = 'employee' AND "name" = 'کارشناس' AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'همکار');
--> statement-breakpoint
UPDATE "roles" SET "description" = 'همهٔ بخش‌ها و تنظیمات پرتال، حساب‌های همکاران و سطح‌های دسترسی' WHERE "id" = 'admin' AND "description" = 'دسترسی کامل به همهٔ بخش‌ها، کاربران و تنظیم نقش‌ها';
--> statement-breakpoint
UPDATE "roles" SET "description" = 'انتشار خبر، نظرسنجی، دوره، رویداد و سند، و دیدن گزارش‌ها' WHERE "id" = 'manager' AND "description" = 'انتشار محتوا و مشاهدهٔ گزارش‌ها';
--> statement-breakpoint
UPDATE "roles" SET "description" = 'دیدن محتوا، شرکت در نظرسنجی‌ها و فرستادن پیام؛ بدون دسترسی مدیریتی' WHERE "id" = 'employee' AND "description" = 'مشاهدهٔ محتوا و مشارکت در نظرسنجی‌ها';
