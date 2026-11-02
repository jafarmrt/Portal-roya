CREATE TABLE "event_quiz_answers" (
	"question_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"choice" integer NOT NULL,
	"ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_quiz_answers_question_id_employee_id_pk" PRIMARY KEY("question_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_quiz_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"options" text[] NOT NULL,
	"correct" integer NOT NULL,
	"seconds" integer DEFAULT 20 NOT NULL,
	"asked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "quiz_state" jsonb;--> statement-breakpoint
ALTER TABLE "event_quiz_answers" ADD CONSTRAINT "event_quiz_answers_question_id_event_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."event_quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_quiz_answers" ADD CONSTRAINT "event_quiz_answers_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_quiz_questions" ADD CONSTRAINT "event_quiz_questions_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_quiz_questions_event_idx" ON "event_quiz_questions" USING btree ("event_id");