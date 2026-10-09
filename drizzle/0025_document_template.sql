CREATE TABLE "document_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario" text NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"intro" text NOT NULL,
	"sections" jsonb NOT NULL,
	"body" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_hash" char(64) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_template_version" UNIQUE("scenario","kind","locale","version"),
	CONSTRAINT "document_template_content" UNIQUE("scenario","kind","locale","content_hash"),
	CONSTRAINT "document_template_kind_check" CHECK ("document_template"."kind" in ('contract', 'quote')),
	CONSTRAINT "document_template_locale_check" CHECK ("document_template"."locale" in ('en', 'zh-TW')),
	CONSTRAINT "document_template_version_check" CHECK ("document_template"."version" > 0),
	CONSTRAINT "document_template_size_check" CHECK ("document_template"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "document_template_published" ON "document_template" USING btree ("scenario","kind","locale") WHERE "document_template"."published";