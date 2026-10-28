CREATE TABLE "kudos" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"emoji" text NOT NULL,
	"label" text NOT NULL,
	"reply_to_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "show_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "accept_kudos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "kudos_emojis" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_from_id_employees_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_to_id_employees_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudos_from_idx" ON "kudos" USING btree ("from_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kudos_reply_idx" ON "kudos" USING btree ("reply_to_id");