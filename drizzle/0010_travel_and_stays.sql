ALTER TABLE "calendar_event" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "end_time" time(0);--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "end_time_zone" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "transport_mode" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "operator" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "service_number" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "destination" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "seat" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "hotel_name" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_transport_mode_check" CHECK ("calendar_event"."transport_mode" in ('high_speed_rail', 'train', 'flight', 'transfer', 'other'));--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_end_check" CHECK (("calendar_event"."end_date" is null) = ("calendar_event"."end_time" is null) and ("calendar_event"."end_date" is null) = ("calendar_event"."end_time_zone" is null));