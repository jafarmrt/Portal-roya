ALTER TABLE "personal_todos" ADD COLUMN "reminded_before_on" text;--> statement-breakpoint
ALTER TABLE "personal_todos" ADD COLUMN "remind" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_todos" ADD COLUMN "important" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_todos" ADD COLUMN "repeat" text;--> statement-breakpoint
ALTER TABLE "personal_todos" ADD COLUMN "previous_id" text;--> statement-breakpoint
ALTER TABLE "personal_todos" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "dashboard_default_order" text[] DEFAULT '{}' NOT NULL;