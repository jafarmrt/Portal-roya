ALTER TABLE "settings" ADD COLUMN "guest_access" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "guest_directory" boolean DEFAULT false NOT NULL;