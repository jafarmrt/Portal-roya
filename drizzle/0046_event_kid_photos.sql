CREATE TABLE "event_kid_guesses" (
	"photo_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"pick" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_kid_guesses_photo_id_employee_id_pk" PRIMARY KEY("photo_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_kid_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"url" text NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"shown_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "closing_news_id" text;--> statement-breakpoint
ALTER TABLE "event_kid_guesses" ADD CONSTRAINT "event_kid_guesses_photo_id_event_kid_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."event_kid_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_kid_guesses" ADD CONSTRAINT "event_kid_guesses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_kid_photos" ADD CONSTRAINT "event_kid_photos_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_kid_photos" ADD CONSTRAINT "event_kid_photos_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_kid_photos_person_idx" ON "event_kid_photos" USING btree ("event_id","employee_id");