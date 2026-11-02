CREATE TABLE "event_competitions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"icon" text DEFAULT '🏆' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'individual' NOT NULL,
	"team_min" integer DEFAULT 1 NOT NULL,
	"team_max" integer DEFAULT 1 NOT NULL,
	"capacity" integer DEFAULT 8 NOT NULL,
	"scoring" text DEFAULT 'points' NOT NULL,
	"tie_rule" text DEFAULT 'organizer' NOT NULL,
	"third_place" boolean DEFAULT false NOT NULL,
	"stage_policy" text DEFAULT 'final' NOT NULL,
	"day_place" text DEFAULT '' NOT NULL,
	"day_start" text DEFAULT '10:00' NOT NULL,
	"slot_minutes" integer DEFAULT 20 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"drawn_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"champion_announced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"captain_id" text NOT NULL,
	"status" text DEFAULT 'in' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_entry_members" (
	"competition_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_entry_members_competition_id_employee_id_pk" PRIMARY KEY("competition_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"match_id" text,
	"by_id" text,
	"action" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"round" integer NOT NULL,
	"slot" integer NOT NULL,
	"third" boolean DEFAULT false NOT NULL,
	"entry_a" text,
	"entry_b" text,
	"score_a" integer,
	"score_b" integer,
	"tie_a" integer,
	"tie_b" integer,
	"winner_id" text,
	"bye" boolean DEFAULT false NOT NULL,
	"walkover" boolean DEFAULT false NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"on_stage" boolean DEFAULT false NOT NULL,
	"day" text DEFAULT '' NOT NULL,
	"time" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"result_by_id" text,
	"result_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"overdue_reminded_at" timestamp with time zone,
	"announced_pair" text
);
--> statement-breakpoint
CREATE TABLE "event_objections" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"match_id" text NOT NULL,
	"by_id" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by_id" text,
	"decision" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_screens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"code" text NOT NULL,
	"event_id" text,
	"paired_by_id" text,
	"paired_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_screens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "special_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"theme" text DEFAULT 'yalda' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"program_date" text NOT NULL,
	"program_time" text DEFAULT '15:00' NOT NULL,
	"program_place" text DEFAULT '' NOT NULL,
	"signup_end" text NOT NULL,
	"show_until" text NOT NULL,
	"test_phase" text,
	"organizer_ids" text[] DEFAULT '{}' NOT NULL,
	"jury_ids" text[] DEFAULT '{}' NOT NULL,
	"jury_head_id" text,
	"jury_photos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"screen" jsonb,
	"sent_reminders" text[] DEFAULT '{}' NOT NULL,
	"activated_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_competitions" ADD CONSTRAINT "event_competitions_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entries" ADD CONSTRAINT "event_entries_competition_id_event_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."event_competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entries" ADD CONSTRAINT "event_entries_captain_id_employees_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entry_members" ADD CONSTRAINT "event_entry_members_competition_id_event_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."event_competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entry_members" ADD CONSTRAINT "event_entry_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entry_members" ADD CONSTRAINT "event_entry_members_entry_id_event_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."event_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_matches" ADD CONSTRAINT "event_matches_competition_id_event_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."event_competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_matches" ADD CONSTRAINT "event_matches_entry_a_event_entries_id_fk" FOREIGN KEY ("entry_a") REFERENCES "public"."event_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_matches" ADD CONSTRAINT "event_matches_entry_b_event_entries_id_fk" FOREIGN KEY ("entry_b") REFERENCES "public"."event_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_objections" ADD CONSTRAINT "event_objections_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_objections" ADD CONSTRAINT "event_objections_match_id_event_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."event_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_objections" ADD CONSTRAINT "event_objections_by_id_employees_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_screens" ADD CONSTRAINT "event_screens_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_events" ADD CONSTRAINT "special_events_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_competitions_event_idx" ON "event_competitions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_entries_competition_idx" ON "event_entries" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "event_entry_members_entry_idx" ON "event_entry_members" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "event_log_event_idx" ON "event_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_matches_competition_idx" ON "event_matches" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "event_objections_event_idx" ON "event_objections" USING btree ("event_id");