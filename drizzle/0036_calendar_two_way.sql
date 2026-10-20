ALTER TABLE "calendar_event" ADD COLUMN "deleted_in_google_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "suggested_project_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ADD COLUMN "pushed" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_import_source" ADD COLUMN "own" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_suggested_project_id_project_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;