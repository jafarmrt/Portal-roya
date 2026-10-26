ALTER TABLE "employees" ALTER COLUMN "username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "has_account" boolean DEFAULT true NOT NULL;