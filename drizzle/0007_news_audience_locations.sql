ALTER TABLE "news" ADD COLUMN "target_locations" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "target_roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "target_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "content_format" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "ack_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "ack_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "ack_auto_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "ack_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "locations" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "dashboard_cards" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- The company's locations; any other place written in a profile is added at start-up (reconcileLocations).
UPDATE "settings" SET "locations" = ARRAY['شعبه شیراز', 'شعبه مشهد', 'شعبه قم', 'انبار', 'دفتر تهران طبقه اول', 'دفتر تهران طبقه دوم'] WHERE cardinality("locations") = 0;
