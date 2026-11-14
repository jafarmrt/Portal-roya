CREATE TABLE "recognition_reminders" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recognition_reminders_user_id_month_kind_pk" PRIMARY KEY("user_id","month","kind")
);
--> statement-breakpoint
CREATE TABLE "recognitions" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"amount" integer NOT NULL,
	"month" text NOT NULL,
	"parent_id" text,
	"value_id" text NOT NULL,
	"value_label" text NOT NULL,
	"value_tone" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"reaction" text DEFAULT '' NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"reversed_by_id" text,
	"reverse_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "recognition_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "recognition_rules" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "recognition_values" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recognition_reminders" ADD CONSTRAINT "recognition_reminders_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_from_id_employees_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_to_id_employees_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_parent_id_recognitions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."recognitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_reversed_by_id_employees_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recognitions_from_idx" ON "recognitions" USING btree ("from_id","month");--> statement-breakpoint
CREATE INDEX "recognitions_to_idx" ON "recognitions" USING btree ("to_id","created_at");--> statement-breakpoint
CREATE INDEX "recognitions_wall_idx" ON "recognitions" USING btree ("deliver_at");--> statement-breakpoint
CREATE INDEX "recognitions_parent_idx" ON "recognitions" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "recognitions_due_idx" ON "recognitions" USING btree ("deliver_at") WHERE "recognitions"."delivered_at" is null and "recognitions"."withdrawn_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recognitions_join_idx" ON "recognitions" USING btree ("parent_id","from_id") WHERE "recognitions"."parent_id" is not null and "recognitions"."withdrawn_at" is null;