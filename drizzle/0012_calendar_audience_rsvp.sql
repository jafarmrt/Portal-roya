CREATE TABLE "calendar_rsvps" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"attending" boolean NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_rsvps_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "target_departments" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "target_locations" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "target_roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "target_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "notify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "rsvp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "calendar_rsvps" ADD CONSTRAINT "calendar_rsvps_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_rsvps" ADD CONSTRAINT "calendar_rsvps_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Events added before this version never promised notifications, so they get no surprise reminders;
-- a calendar manager can turn them on in the event's form. Training entries are reminded by the training itself.
UPDATE "calendar_events" SET "notify" = false;
