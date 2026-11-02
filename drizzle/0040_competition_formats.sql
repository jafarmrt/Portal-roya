ALTER TABLE "event_competitions" ADD COLUMN "format" text DEFAULT 'knockout' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_competitions" ADD COLUMN "rank_by" text DEFAULT 'high' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_competitions" ADD COLUMN "champion_pick_id" text;--> statement-breakpoint
ALTER TABLE "event_competitions" ADD COLUMN "words" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_competitions" ADD COLUMN "used_words" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_matches" ADD COLUMN "done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "event_matches" SET "done" = true WHERE "winner_id" IS NOT NULL;