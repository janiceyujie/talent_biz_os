CREATE TABLE "opportunity_page" (
	"url" text PRIMARY KEY NOT NULL,
	"tracked_id" text NOT NULL,
	"role" text NOT NULL,
	"text_hash" text,
	"calls" integer,
	"model_version" text,
	"prompt_version" text,
	"checked_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"failure" text,
	CONSTRAINT "opportunity_page_role_check" CHECK ("opportunity_page"."role" in ('list', 'announcement'))
);
--> statement-breakpoint
ALTER TABLE "opportunity_page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opportunity" ADD COLUMN "passages" jsonb;