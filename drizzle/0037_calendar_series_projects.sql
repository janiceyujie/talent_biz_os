CREATE TABLE "calendar_series_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"series_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_series_project_connection_series" UNIQUE("connection_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "calendar_series_project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_event" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "calendar_series_project" ADD CONSTRAINT "calendar_series_project_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_series_project" ADD CONSTRAINT "calendar_series_project_connection_id_calendar_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_series_project" ADD CONSTRAINT "calendar_series_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;