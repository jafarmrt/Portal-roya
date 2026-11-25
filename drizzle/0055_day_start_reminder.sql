ALTER TABLE "employees" ADD COLUMN "day_start_reminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "day_start_reminded_on" text;