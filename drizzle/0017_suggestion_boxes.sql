CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"box" text NOT NULL,
	"kind" text DEFAULT 'suggestion' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"sender_id" text,
	"tracking_hash" text,
	"reply" text,
	"replied_by_id" text,
	"replied_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_sender_id_employees_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_replied_by_id_employees_id_fk" FOREIGN KEY ("replied_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_box_idx" ON "suggestions" USING btree ("box");--> statement-breakpoint
CREATE INDEX "suggestions_sender_idx" ON "suggestions" USING btree ("sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suggestions_tracking_idx" ON "suggestions" USING btree ("tracking_hash");