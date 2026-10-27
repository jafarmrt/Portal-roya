CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_summaries" (
	"month" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
-- Until now the portal did not note when colleagues used it; the latest thing each one did stands in.
UPDATE "employees" AS e SET "last_seen_at" = s."at"
FROM (
	SELECT "user_id", max("at") AS "at" FROM (
		SELECT "user_id", "read_at" AS "at" FROM "news_reads"
		UNION ALL SELECT "user_id", "acknowledged_at" FROM "news_reads" WHERE "acknowledged_at" IS NOT NULL
		UNION ALL SELECT "user_id", "created_at" FROM "news_likes"
		UNION ALL SELECT "user_id", "submitted_at" FROM "moods"
		UNION ALL SELECT "user_id", "submitted_at" FROM "poll_responses"
		UNION ALL SELECT "user_id", "created_at" FROM "training_enrollments"
		UNION ALL SELECT "user_id", "responded_at" FROM "calendar_rsvps"
		UNION ALL SELECT "user_id", "acknowledged_at" FROM "document_acks"
	) AS "activity"
	GROUP BY "user_id"
) AS s
WHERE s."user_id" = e."id";
