CREATE TABLE "event_wheel_spins" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"winner_id" text NOT NULL,
	"prize" text DEFAULT '' NOT NULL,
	"reel" text[] NOT NULL,
	"absent" boolean DEFAULT false NOT NULL,
	"by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_wishes" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"by_id" text NOT NULL,
	"text" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_wheel_spins" ADD CONSTRAINT "event_wheel_spins_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_wheel_spins" ADD CONSTRAINT "event_wheel_spins_winner_id_employees_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_wishes" ADD CONSTRAINT "event_wishes_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_wishes" ADD CONSTRAINT "event_wishes_by_id_employees_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_wheel_spins_event_idx" ON "event_wheel_spins" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_wishes_event_idx" ON "event_wishes" USING btree ("event_id");