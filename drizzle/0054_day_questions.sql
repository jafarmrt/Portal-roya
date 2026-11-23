CREATE TABLE "day_answers" (
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"question_id" text NOT NULL,
	"option" integer NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_answers_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "day_question_days" (
	"date" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"options" jsonb NOT NULL,
	"theme" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"pinned_date" text DEFAULT '' NOT NULL,
	"sample" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moods" ADD COLUMN "reasons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "day_step_order" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "day_answers" ADD CONSTRAINT "day_answers_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_answers" ADD CONSTRAINT "day_answers_question_id_day_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."day_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_question_days" ADD CONSTRAINT "day_question_days_question_id_day_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."day_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_answers_date_idx" ON "day_answers" USING btree ("date");