CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"message_id" uuid,
	"project_id" uuid,
	"position" integer,
	"role" text NOT NULL,
	"category" text,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"filename" text,
	"size_bytes" bigint NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_message_position" UNIQUE("message_id","position"),
	CONSTRAINT "file_role_check" CHECK ("file"."role" in ('body', 'attachment', 'screenshot', 'upload')),
	CONSTRAINT "file_category_check" CHECK ("file"."category" in ('contract', 'asset', 'invoice', 'other')),
	CONSTRAINT "file_size_check" CHECK ("file"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_talent_idx" ON "file" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "file_project_idx" ON "file" USING btree ("project_id");