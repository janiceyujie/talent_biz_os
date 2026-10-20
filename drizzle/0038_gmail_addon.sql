CREATE TABLE "gmail_addon_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"google_subject" text NOT NULL,
	"google_email" text NOT NULL,
	"last_talent_id" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_addon_link_google_subject_unique" UNIQUE("google_subject")
);
--> statement-breakpoint
ALTER TABLE "gmail_addon_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gmail_addon_link_request" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"google_subject" text NOT NULL,
	"google_email" text NOT NULL,
	"person_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gmail_addon_link_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "mailbox_subject" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "chosen_project_id" uuid;--> statement-breakpoint
ALTER TABLE "gmail_addon_link" ADD CONSTRAINT "gmail_addon_link_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_addon_link" ADD CONSTRAINT "gmail_addon_link_last_talent_id_talent_id_fk" FOREIGN KEY ("last_talent_id") REFERENCES "public"."talent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_addon_link_request" ADD CONSTRAINT "gmail_addon_link_request_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gmail_addon_link_person_idx" ON "gmail_addon_link" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "gmail_addon_link_request_subject_idx" ON "gmail_addon_link_request" USING btree ("google_subject");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_chosen_project_id_project_id_fk" FOREIGN KEY ("chosen_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_mailbox_thread_idx" ON "message" USING btree ("talent_id","mailbox_subject","provider_thread_id");--> statement-breakpoint
-- Email from a connected mailbox: its Google account, and the dedup key by that account rather than
-- the connection, so a reconnect (a new connection id) and the add-on make the same key (docs/design/gmail-addon.md).
UPDATE "message" AS m SET "mailbox_subject" = c."account_subject", "dedup_key" = 'gmail:' || c."account_subject" || ':' || m."external_ref"
FROM "mail_connection" AS c
WHERE m."connection_id" = c."id" AND m."channel" = 'gmail' AND m."external_ref" IS NOT NULL;
