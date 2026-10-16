ALTER TABLE "mail_decision" DROP CONSTRAINT "mail_decision_outcome_check";--> statement-breakpoint
ALTER TABLE "mail_decision" DROP CONSTRAINT "mail_decision_decided_by_check";--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_channel_check";--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "submitted_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "provider_thread_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "header_message_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "references" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "direction" text DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "relevance" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "sender" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "skipped_attachments" jsonb;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_connection_id_mail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_connection_thread_idx" ON "message" USING btree ("connection_id","provider_thread_id");--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_outcome_check" CHECK ("mail_decision"."outcome" in ('work', 'skipped', 'pending', 'unsure', 'not_work'));--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_decided_by_check" CHECK ("mail_decision"."decided_by" in ('sender_always', 'sender_never', 'contact', 'thread', 'esign', 'spam', 'trash', 'draft', 'sent', 'bulk', 'tab', 'model', 'analysis', 'person', 'gone'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_direction_check" CHECK ("message"."direction" in ('received', 'sent'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_relevance_check" CHECK ("message"."relevance" in ('sure', 'unsure'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_check" CHECK ("message"."channel" in ('paste', 'upload', 'gmail', 'gmail_addon', 'forwarded_email'));