ALTER TABLE "calendar_connection" ADD COLUMN "sync_token" text;--> statement-breakpoint
ALTER TABLE "calendar_import_source" ADD COLUMN "sync_token" text;