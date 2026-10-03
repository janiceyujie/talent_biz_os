CREATE TABLE "reply_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_type" text NOT NULL,
	"kind" text NOT NULL,
	"language" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tone" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reply_template_kind_check" CHECK ("reply_template"."kind" in ('template', 'past_reply'))
);
--> statement-breakpoint
ALTER TABLE "reply_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reply_template" ADD CONSTRAINT "reply_template_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reply_template_talent_type_idx" ON "reply_template" USING btree ("talent_id","project_type");