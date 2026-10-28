ALTER TABLE "kudos" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "kudos_to_idx" ON "kudos" USING btree ("to_id","created_at");--> statement-breakpoint
-- Emoji are shown in a banner now, not as notifications: the old ones are taken out of the inbox, and
-- emoji sent before this version do not pop up again as banners.
DELETE FROM "notifications" WHERE "type" = 'kudos';--> statement-breakpoint
UPDATE "kudos" SET "dismissed_at" = now() WHERE "dismissed_at" IS NULL;
