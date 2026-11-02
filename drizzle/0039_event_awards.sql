CREATE TABLE "event_award_opt_outs" (
	"event_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_award_opt_outs_event_id_employee_id_pk" PRIMARY KEY("event_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_award_votes" (
	"award_id" text NOT NULL,
	"juror_id" text NOT NULL,
	"nominee_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_award_votes_award_id_juror_id_pk" PRIMARY KEY("award_id","juror_id")
);
--> statement-breakpoint
CREATE TABLE "event_awards" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"icon" text DEFAULT '🏅' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"winner_id" text,
	"tie_ids" text[] DEFAULT '{}' NOT NULL,
	"picked_id" text,
	"decided_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_nominations" (
	"id" text PRIMARY KEY NOT NULL,
	"award_id" text NOT NULL,
	"nominator_id" text NOT NULL,
	"nominee_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_nominees" (
	"award_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"added_by_id" text,
	"note" text DEFAULT '' NOT NULL,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"removed_by_id" text,
	"removed_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_nominees_award_id_employee_id_pk" PRIMARY KEY("award_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "awards_shortlisted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "awards_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "special_events" ADD COLUMN "awards_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_award_opt_outs" ADD CONSTRAINT "event_award_opt_outs_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_award_opt_outs" ADD CONSTRAINT "event_award_opt_outs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_award_votes" ADD CONSTRAINT "event_award_votes_award_id_event_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."event_awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_award_votes" ADD CONSTRAINT "event_award_votes_juror_id_employees_id_fk" FOREIGN KEY ("juror_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_award_votes" ADD CONSTRAINT "event_award_votes_nominee_id_employees_id_fk" FOREIGN KEY ("nominee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_awards" ADD CONSTRAINT "event_awards_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_awards" ADD CONSTRAINT "event_awards_winner_id_employees_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_nominations" ADD CONSTRAINT "event_nominations_award_id_event_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."event_awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_nominations" ADD CONSTRAINT "event_nominations_nominator_id_employees_id_fk" FOREIGN KEY ("nominator_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_nominations" ADD CONSTRAINT "event_nominations_nominee_id_employees_id_fk" FOREIGN KEY ("nominee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_nominees" ADD CONSTRAINT "event_nominees_award_id_event_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."event_awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_nominees" ADD CONSTRAINT "event_nominees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_awards_event_idx" ON "event_awards" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_nominations_award_nominator_idx" ON "event_nominations" USING btree ("award_id","nominator_id");--> statement-breakpoint
CREATE INDEX "event_nominations_nominee_idx" ON "event_nominations" USING btree ("award_id","nominee_id");