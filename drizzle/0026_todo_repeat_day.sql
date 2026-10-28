ALTER TABLE "personal_todos" ADD COLUMN "repeat_day" integer;--> statement-breakpoint
-- Monthly notes written before keep the day they are due on now.
UPDATE "personal_todos" SET "repeat_day" = CAST(substring("due_date" from 9 for 2) AS integer) WHERE "repeat" = 'monthly' AND "due_date" IS NOT NULL;
