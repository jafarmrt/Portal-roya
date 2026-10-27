ALTER TABLE "calendar_events" ADD COLUMN "training_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "banner" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Link the calendar entries that trainings created before this version to their training.
UPDATE "calendar_events" e SET "training_id" = t."id"
FROM "trainings" t
WHERE e."type" = 'training' AND e."training_id" IS NULL AND e."date" = t."date" AND e."title" = 'دوره آموزشی: ' || t."title";
