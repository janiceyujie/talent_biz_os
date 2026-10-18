ALTER TABLE "mail_decision" DROP CONSTRAINT "mail_decision_decided_by_check";--> statement-breakpoint
ALTER TABLE "mail_decision" DROP CONSTRAINT "mail_decision_kind_check";--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "kind" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "notice" jsonb;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_decided_by_check" CHECK ("mail_decision"."decided_by" in ('sender_always', 'sender_never', 'contact', 'thread', 'esign', 'spam', 'trash', 'draft', 'sent', 'bulk', 'tab', 'model', 'analysis', 'person', 'gone', 'expired'));--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_kind_check" CHECK ("mail_decision"."kind" in ('offer', 'negotiation', 'contract', 'logistics', 'payment', 'bank_notice', 'press', 'newsletter', 'marketing', 'receipt', 'personal', 'notification', 'other'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_kind_check" CHECK ("message"."kind" in ('message', 'payment_notice'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_notice_check" CHECK (("message"."kind" = 'payment_notice') = ("message"."notice" is not null) and ("message"."kind" <> 'payment_notice' or "message"."body_text" is null));