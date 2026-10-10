CREATE TABLE "mail_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"connected_by" uuid,
	"provider" text DEFAULT 'gmail' NOT NULL,
	"account_email" text NOT NULL,
	"account_subject" text NOT NULL,
	"scopes" text NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"refresh_token_nonce" text NOT NULL,
	"refresh_token_tag" text NOT NULL,
	"data_key_wrapped" text NOT NULL,
	"key_id" text NOT NULL,
	"history_id" text,
	"watch_expires_at" timestamp with time zone,
	"history_mode" text NOT NULL,
	"history_done_at" timestamp with time zone,
	"status" text DEFAULT 'connected' NOT NULL,
	"failure" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_connection_talent_account" UNIQUE("talent_id","provider","account_subject"),
	CONSTRAINT "mail_connection_status_check" CHECK ("mail_connection"."status" in ('connected', 'reconnect_needed', 'error', 'disconnecting')),
	CONSTRAINT "mail_connection_history_mode_check" CHECK ("mail_connection"."history_mode" in ('30_days', 'new_only'))
);
--> statement-breakpoint
ALTER TABLE "mail_connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_connection" ADD CONSTRAINT "mail_connection_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_connection" ADD CONSTRAINT "mail_connection_connected_by_person_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_connection_talent_idx" ON "mail_connection" USING btree ("talent_id");