CREATE TABLE "signup_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"note" text,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "signup_allowlist_email_unique" UNIQUE("email"),
	CONSTRAINT "signup_allowlist_email_check" CHECK ("signup_allowlist"."email" = lower(btrim("signup_allowlist"."email")))
);
--> statement-breakpoint
ALTER TABLE "signup_allowlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD CONSTRAINT "signup_allowlist_invited_by_person_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;