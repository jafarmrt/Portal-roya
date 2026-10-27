CREATE TABLE "news_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"news_id" text NOT NULL,
	"asker_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answered_by_id" text,
	"answered_at" timestamp with time zone,
	"is_public" boolean DEFAULT false NOT NULL,
	"public_question" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"news_id" text NOT NULL,
	"editor_id" text,
	"action" text NOT NULL,
	"changed" text[] DEFAULT '{}' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "news_questions" ADD CONSTRAINT "news_questions_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_questions" ADD CONSTRAINT "news_questions_asker_id_employees_id_fk" FOREIGN KEY ("asker_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_questions" ADD CONSTRAINT "news_questions_answered_by_id_employees_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_revisions" ADD CONSTRAINT "news_revisions_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_revisions" ADD CONSTRAINT "news_revisions_editor_id_employees_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_templates" ADD CONSTRAINT "news_templates_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_questions_news_idx" ON "news_questions" USING btree ("news_id");--> statement-breakpoint
CREATE INDEX "news_revisions_news_idx" ON "news_revisions" USING btree ("news_id");--> statement-breakpoint
-- Ready-made templates for the recurring announcements in the development plan (ب۶). Publishers fill in the [بخش‌های داخل کروشه].
INSERT INTO "news_templates" ("id", "name", "title", "summary", "content", "category", "is_urgent", "requires_ack", "tags") VALUES
('tpl-holiday', 'تعطیلی', 'تعطیلی [روز و تاریخ]', 'به اطلاع همکاران می‌رساند [روز و تاریخ] به مناسبت [مناسبت] تعطیل است.', '<p>همکاران گرامی،</p><p>به اطلاع می‌رساند [روز و تاریخ] به مناسبت [مناسبت] همهٔ واحدهای شرکت تعطیل است و کار از [روز بازگشت] از سر گرفته می‌شود.</p><p>[توضیح بیشتر، مثلاً کشیک انبار]</p>', 'اطلاعیه مهم', false, false, ARRAY['تعطیلی']),
('tpl-hours', 'تغییر ساعت کاری', 'ساعت کاری از [تاریخ شروع] تغییر می‌کند', 'از [تاریخ شروع] ساعت کاری از [ساعت شروع] تا [ساعت پایان] است.', '<p>همکاران گرامی،</p><p>از [تاریخ شروع] تا [تاریخ پایان] ساعت کاری از [ساعت شروع] تا [ساعت پایان] خواهد بود.</p><p>دلیل تغییر: [دلیل]</p>', 'بخشنامه', false, true, ARRAY['ساعت کاری']),
('tpl-outage', 'قطعی سامانه', 'قطعی [نام سامانه] در [روز و تاریخ]', '[نام سامانه] [روز و تاریخ] از ساعت [ساعت شروع] تا [ساعت پایان] در دسترس نیست.', '<p>همکاران گرامی،</p><p>به دلیل [دلیل قطعی]، [نام سامانه] [روز و تاریخ] از ساعت [ساعت شروع] تا [ساعت پایان] در دسترس نخواهد بود.</p><p>لطفاً کارهای ضروری را پیش از این زمان انجام دهید. اگر مشکلی پیش آمد با [نام و داخلی پشتیبان] تماس بگیرید.</p>', 'اطلاعیه مهم', true, false, ARRAY['قطعی سامانه']),
('tpl-condolence', 'تسلیت', 'تسلیت به [نام همکار]', 'درگذشت [نسبت] همکار گرامی، [نام همکار]، را تسلیت می‌گوییم.', '<p>درگذشت [نسبت] همکار گرامی، [نام همکار] ([واحد])، را به ایشان و خانوادهٔ محترمشان تسلیت می‌گوییم و برای بازماندگان صبر آرزو داریم.</p><p>مراسم: [زمان و مکان مراسم]</p>', 'اخبار سازمان', false, false, ARRAY['تسلیت']),
('tpl-greeting', 'تبریک مناسبت', '[نام مناسبت] مبارک', 'فرارسیدن [نام مناسبت] را به همهٔ همکاران تبریک می‌گوییم.', '<p>همکاران گرامی،</p><p>فرارسیدن [نام مناسبت] را به شما و خانواده‌هایتان تبریک می‌گوییم.</p><p>[پیام مدیریت]</p>', 'رویداد و جشن', false, false, ARRAY['تبریک'])
ON CONFLICT ("id") DO NOTHING;
