CREATE TABLE "calendar_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"auth_account_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"external_calendar_id" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"dirty" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connection_person_talent" UNIQUE("person_id","talent_id","provider"),
	CONSTRAINT "calendar_connection_status_check" CHECK ("calendar_connection"."status" in ('connected', 'needs_reconnect', 'error'))
);
--> statement-breakpoint
ALTER TABLE "calendar_connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_event_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"event_id" uuid,
	"external_event_id" text NOT NULL,
	"etag" text,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "calendar_event_sync_connection_event" UNIQUE("connection_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_auth_account_id_auth_account_id_fk" FOREIGN KEY ("auth_account_id") REFERENCES "public"."auth_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ADD CONSTRAINT "calendar_event_sync_connection_id_calendar_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ADD CONSTRAINT "calendar_event_sync_event_id_calendar_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_connection_talent_idx" ON "calendar_connection" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "calendar_event_sync_connection_idx" ON "calendar_event_sync" USING btree ("connection_id");