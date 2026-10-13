ALTER TABLE "mail_decision" DROP CONSTRAINT "mail_decision_outcome_check";--> statement-breakpoint
ALTER TABLE "mail_decision" DROP CONSTRAINT "mail_decision_decided_by_check";--> statement-breakpoint
ALTER TABLE "mail_decision" ADD COLUMN "score" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "mail_decision" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_kind_check" CHECK ("mail_decision"."kind" in ('offer', 'negotiation', 'contract', 'logistics', 'payment', 'press', 'newsletter', 'marketing', 'receipt', 'personal', 'notification', 'other'));--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_score_check" CHECK ("mail_decision"."score" between 0 and 1);--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_outcome_check" CHECK ("mail_decision"."outcome" in ('work', 'skipped', 'pending', 'unsure'));--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_decided_by_check" CHECK ("mail_decision"."decided_by" in ('sender_always', 'sender_never', 'contact', 'thread', 'esign', 'spam', 'trash', 'draft', 'sent', 'bulk', 'tab', 'model', 'person', 'gone'));