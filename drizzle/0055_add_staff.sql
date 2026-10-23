CREATE TABLE "staff" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"note" text NOT NULL,
	CONSTRAINT "staff_role_check" CHECK ("staff"."role" in ('support', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;