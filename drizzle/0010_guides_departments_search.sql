CREATE TABLE "department_pages" (
	"department" text PRIMARY KEY NOT NULL,
	"head_id" text,
	"about" text DEFAULT '' NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_feedback" (
	"guide_id" text NOT NULL,
	"user_id" text NOT NULL,
	"helpful" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_feedback_guide_id_user_id_pk" PRIMARY KEY("guide_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"owner_id" text,
	"review_at" timestamp with time zone,
	"review_reminded_at" timestamp with time zone,
	"created_by_id" text NOT NULL,
	"updated_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_misses" (
	"query" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_text" text;--> statement-breakpoint
ALTER TABLE "department_pages" ADD CONSTRAINT "department_pages_head_id_employees_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_pages" ADD CONSTRAINT "department_pages_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_feedback" ADD CONSTRAINT "guide_feedback_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_feedback" ADD CONSTRAINT "guide_feedback_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;