CREATE TABLE "assistant_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"scope" text DEFAULT 'talent' NOT NULL,
	"talent_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversation_scope_check" CHECK ("assistant_conversation"."scope" in ('talent', 'portfolio')),
	CONSTRAINT "assistant_conversation_talent_check" CHECK (("assistant_conversation"."scope" = 'talent') = ("assistant_conversation"."talent_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "assistant_conversation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assistant_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_message_role_check" CHECK ("assistant_message"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
ALTER TABLE "assistant_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversation_id_assistant_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversation_person_talent_updated_idx" ON "assistant_conversation" USING btree ("person_id","talent_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "assistant_message_conversation_created_idx" ON "assistant_message" USING btree ("conversation_id","created_at");