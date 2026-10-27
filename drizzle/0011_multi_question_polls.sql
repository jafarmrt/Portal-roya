CREATE TABLE "poll_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"response_id" integer NOT NULL,
	"question_id" text NOT NULL,
	"option_id" text,
	"rating" integer,
	"text" text
);
--> statement-breakpoint
CREATE TABLE "poll_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"poll_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" text NOT NULL,
	"user_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "anonymous" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "results_visibility" text DEFAULT 'after_answer' NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "show_text_answers" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "target_departments" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "target_locations" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "target_roles" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "target_user_ids" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "reminded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "auto_reminded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "poll_options" ADD COLUMN "question_id" text;
--> statement-breakpoint
INSERT INTO "poll_questions" ("id", "poll_id", "position", "type", "text", "required")
  SELECT 'q_' || "id", "id", 0, CASE WHEN "type" = 'free_text' THEN 'text' ELSE 'single' END, '', true FROM "polls";
--> statement-breakpoint
UPDATE "poll_options" SET "question_id" = 'q_' || "poll_id";
--> statement-breakpoint
ALTER TABLE "poll_options" ALTER COLUMN "question_id" SET NOT NULL;
--> statement-breakpoint
INSERT INTO "poll_responses" ("poll_id", "user_id", "submitted_at") SELECT "poll_id", "user_id", "submitted_at" FROM "poll_votes";
--> statement-breakpoint
INSERT INTO "poll_answers" ("response_id", "question_id", "option_id", "text")
  SELECT r."id", 'q_' || v."poll_id", v."option_id", v."free_text"
  FROM "poll_votes" v JOIN "poll_responses" r ON r."poll_id" = v."poll_id" AND r."user_id" = v."user_id";
--> statement-breakpoint
UPDATE "polls" SET "target_departments" = ARRAY["department"] WHERE "department" <> 'all';
--> statement-breakpoint
UPDATE "polls" SET "show_text_answers" = true;
--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_response_id_poll_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."poll_responses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_question_id_poll_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."poll_questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_questions" ADD CONSTRAINT "poll_questions_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_responses" ADD CONSTRAINT "poll_responses_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "poll_answers_question_idx" ON "poll_answers" USING btree ("question_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "poll_responses_poll_user_uq" ON "poll_responses" USING btree ("poll_id","user_id");
--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_question_id_poll_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."poll_questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP TABLE "poll_votes" CASCADE;
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN "department";
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN "type";
