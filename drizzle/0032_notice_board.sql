CREATE TABLE "notice_dismissals" (
	"notice_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_dismissals_notice_id_employee_id_pk" PRIMARY KEY("notice_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"sender" text DEFAULT '' NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"target_departments" text[] DEFAULT '{}' NOT NULL,
	"target_locations" text[] DEFAULT '{}' NOT NULL,
	"target_roles" text[] DEFAULT '{}' NOT NULL,
	"target_user_ids" text[] DEFAULT '{}' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"notify" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notice_dismissals" ADD CONSTRAINT "notice_dismissals_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_dismissals" ADD CONSTRAINT "notice_dismissals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notices_ends_at_idx" ON "notices" USING btree ("ends_at");