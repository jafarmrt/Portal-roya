CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "roles" ("id", "name", "description", "permissions", "is_system") VALUES
	('admin', 'ادمین برنامه', 'دسترسی کامل به همهٔ بخش‌ها، کاربران و تنظیم نقش‌ها', '{}', true),
	('manager', 'مدیر', 'انتشار محتوا و مشاهدهٔ گزارش‌ها', '{news.manage,polls.manage,trainings.manage,calendar.manage,documents.manage,comments.moderate,reports.view}', true),
	('employee', 'کارشناس', 'مشاهدهٔ محتوا و مشارکت در نظرسنجی‌ها', '{}', true);
--> statement-breakpoint
-- Before roles existed, every 'manager' had full control of the portal, so they keep it as admins.
UPDATE "employees" SET "role" = 'admin' WHERE "role" = 'manager';
--> statement-breakpoint
UPDATE "employees" SET "role" = 'employee' WHERE "role" NOT IN ('admin', 'manager', 'employee');
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_roles_id_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE cascade;
