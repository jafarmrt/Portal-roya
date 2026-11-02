CREATE TABLE "event_idea_likes" (
	"idea_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_idea_likes_idea_id_employee_id_pk" PRIMARY KEY("idea_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"text" text NOT NULL,
	"by_id" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"doing" boolean DEFAULT false NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"replied_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_song_votes" (
	"song_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_song_votes_song_id_employee_id_pk" PRIMARY KEY("song_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "event_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"artist" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"key" text NOT NULL,
	"by_id" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_idea_likes" ADD CONSTRAINT "event_idea_likes_idea_id_event_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."event_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_idea_likes" ADD CONSTRAINT "event_idea_likes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ideas" ADD CONSTRAINT "event_ideas_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ideas" ADD CONSTRAINT "event_ideas_by_id_employees_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_song_votes" ADD CONSTRAINT "event_song_votes_song_id_event_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."event_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_song_votes" ADD CONSTRAINT "event_song_votes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_songs" ADD CONSTRAINT "event_songs_event_id_special_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_songs" ADD CONSTRAINT "event_songs_by_id_employees_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_ideas_event_idx" ON "event_ideas" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_songs_key_idx" ON "event_songs" USING btree ("event_id","key");