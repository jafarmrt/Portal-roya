CREATE TABLE "document_acks" (
	"document_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_acks_document_id_user_id_pk" PRIMARY KEY("document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"version" integer NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "version_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "requires_ack" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ack_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ack_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "target_departments" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "target_locations" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "target_roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "target_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_acks" ADD CONSTRAINT "document_acks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_acks" ADD CONSTRAINT "document_acks_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_employees_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_doc_version_uq" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Documents uploaded before versions existed were last changed when they were uploaded.
UPDATE "documents" SET "updated_at" = "created_at";
