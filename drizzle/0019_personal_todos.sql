CREATE TABLE "personal_todos" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"due_date" text,
	"source_type" text,
	"source_id" text,
	"done_at" timestamp with time zone,
	"reminded_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_todos" ADD CONSTRAINT "personal_todos_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_todos_user_idx" ON "personal_todos" USING btree ("user_id");