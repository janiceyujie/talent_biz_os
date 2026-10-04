CREATE TABLE "ai_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid,
	"person_id" uuid,
	"message_id" uuid,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text,
	"status" text NOT NULL,
	"failure_code" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"replayed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_call_status_check" CHECK ("ai_call"."status" in ('ok', 'error'))
);
--> statement-breakpoint
ALTER TABLE "ai_call" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_talent_created_idx" ON "ai_call" USING btree ("talent_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_call_message_idx" ON "ai_call" USING btree ("message_id");