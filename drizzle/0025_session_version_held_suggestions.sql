ALTER TABLE "employees" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "released" boolean DEFAULT true NOT NULL;