CREATE TABLE "notification_state" (
	"person_id" uuid NOT NULL,
	"notification_id" text NOT NULL,
	"read_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	CONSTRAINT "notification_state_person_id_notification_id_pk" PRIMARY KEY("person_id","notification_id")
);
--> statement-breakpoint
ALTER TABLE "notification_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;