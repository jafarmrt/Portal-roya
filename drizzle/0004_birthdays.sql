CREATE TABLE "birthday_announcements" (
	"employee_id" text NOT NULL,
	"jalali_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "birthday_announcements_employee_id_jalali_year_pk" PRIMARY KEY("employee_id","jalali_year")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "hide_birthday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_announcements" ADD CONSTRAINT "birthday_announcements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;