CREATE TABLE "occasion_announcements" (
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"jalali_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occasion_announcements_kind_subject_id_jalali_year_pk" PRIMARY KEY("kind","subject_id","jalali_year")
);
--> statement-breakpoint
ALTER TABLE "birthday_wishes" ADD COLUMN "occasion" text DEFAULT 'birthday' NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_wishes" ADD COLUMN "design" text DEFAULT 'confetti' NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_wishes" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_wishes" ADD COLUMN "reaction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "hide_anniversary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "founding_date" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "founding_message" text DEFAULT '' NOT NULL;