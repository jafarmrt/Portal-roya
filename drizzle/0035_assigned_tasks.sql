CREATE TABLE "assigned_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"assigner_id" text NOT NULL,
	"assignee_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"status_at" timestamp with time zone,
	"reminded_on" text,
	"assigner_hidden_at" timestamp with time zone,
	"assignee_hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_assigner_id_employees_id_fk" FOREIGN KEY ("assigner_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assigned_tasks_assignee_idx" ON "assigned_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "assigned_tasks_assigner_idx" ON "assigned_tasks" USING btree ("assigner_id");