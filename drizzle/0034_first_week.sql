ALTER TABLE "employees" ADD COLUMN "first_week_done" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "first_week_steps" text[] DEFAULT '{}' NOT NULL;