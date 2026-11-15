ALTER TABLE "recognitions" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "report_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "report_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "report_closed_by_id" text;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_report_closed_by_id_employees_id_fk" FOREIGN KEY ("report_closed_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;