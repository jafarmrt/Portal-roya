CREATE TABLE "day_step_counts" (
	"date" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "day_step_counts_date_kind_outcome_pk" PRIMARY KEY("date","kind","outcome")
);
