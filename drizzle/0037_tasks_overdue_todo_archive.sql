ALTER TABLE "assigned_tasks" ADD COLUMN "overdue_reminded_on" text;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD COLUMN "reassigned_to" text;--> statement-breakpoint
ALTER TABLE "personal_todos" ADD COLUMN "restored_at" timestamp with time zone;