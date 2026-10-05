CREATE TABLE "calendar_import_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_import_source_connection_calendar" UNIQUE("connection_id","external_calendar_id")
);
--> statement-breakpoint
ALTER TABLE "calendar_import_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "external_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_event_id" text NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"start_time" time(0),
	"end_date" date,
	"end_time" time(0),
	"time_zone" text NOT NULL,
	"location" text,
	"html_link" text,
	CONSTRAINT "external_event_source_event" UNIQUE("source_id","external_event_id")
);
--> statement-breakpoint
ALTER TABLE "external_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_import_source" ADD CONSTRAINT "calendar_import_source_connection_id_calendar_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_source_id_calendar_import_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."calendar_import_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_event_source_start_idx" ON "external_event" USING btree ("source_id","start_date");