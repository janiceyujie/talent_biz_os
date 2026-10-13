CREATE TABLE "mail_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"decided_by" text,
	"classifier_version" text NOT NULL,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_decision_connection_message" UNIQUE("connection_id","provider_message_id"),
	CONSTRAINT "mail_decision_outcome_check" CHECK ("mail_decision"."outcome" in ('work', 'skipped', 'pending')),
	CONSTRAINT "mail_decision_decided_by_check" CHECK ("mail_decision"."decided_by" in ('sender_always', 'sender_never', 'contact', 'thread', 'esign', 'spam', 'trash', 'draft', 'sent', 'bulk', 'person'))
);
--> statement-breakpoint
ALTER TABLE "mail_decision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mail_sender_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"verdict" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_sender_rule_talent_value" UNIQUE("talent_id","kind","value"),
	CONSTRAINT "mail_sender_rule_kind_check" CHECK ("mail_sender_rule"."kind" in ('address', 'domain')),
	CONSTRAINT "mail_sender_rule_verdict_check" CHECK ("mail_sender_rule"."verdict" in ('always', 'never'))
);
--> statement-breakpoint
ALTER TABLE "mail_sender_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_connection" ADD COLUMN "sync_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_connection_id_mail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_sender_rule" ADD CONSTRAINT "mail_sender_rule_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_sender_rule" ADD CONSTRAINT "mail_sender_rule_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_decision_connection_outcome_idx" ON "mail_decision" USING btree ("connection_id","outcome","received_at");--> statement-breakpoint
CREATE INDEX "mail_decision_connection_thread_idx" ON "mail_decision" USING btree ("connection_id","provider_thread_id");