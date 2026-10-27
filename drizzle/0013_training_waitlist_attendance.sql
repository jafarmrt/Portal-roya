CREATE TABLE "training_feedback" (
	"training_id" text NOT NULL,
	"user_id" text NOT NULL,
	"satisfaction" integer NOT NULL,
	"usefulness" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_feedback_training_id_user_id_pk" PRIMARY KEY("training_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "status" text DEFAULT 'enrolled' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "attended" boolean;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "instructor_id" text;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "materials" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "feedback_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_instructor_id_employees_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;