CREATE TABLE "event_guesses" (
	"event_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_guesses_event_id_employee_id_pk" PRIMARY KEY("event_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_predictions" (
	"match_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"pick" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_predictions_match_id_employee_id_pk" PRIMARY KEY("match_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "guess_question" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "guess_answer" integer;--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "guess_revealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_guesses" ADD CONSTRAINT "event_guesses_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guesses" ADD CONSTRAINT "event_guesses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_predictions" ADD CONSTRAINT "event_predictions_match_id_event_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."event_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_predictions" ADD CONSTRAINT "event_predictions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;