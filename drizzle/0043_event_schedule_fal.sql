CREATE TABLE "event_fals" (
	"event_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"verse" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_fals_event_id_employee_id_pk" PRIMARY KEY("event_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "schedule" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_fals" ADD CONSTRAINT "event_fals_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_fals" ADD CONSTRAINT "event_fals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;