CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_id" uuid,
	"submitted_by" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_ref" text,
	"received_at" timestamp with time zone NOT NULL,
	"body_text" text,
	"dedup_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_talent_dedup_key" UNIQUE("talent_id","dedup_key"),
	CONSTRAINT "message_channel_check" CHECK ("message"."channel" in ('paste', 'upload', 'gmail_addon', 'forwarded_email')),
	CONSTRAINT "message_status_check" CHECK ("message"."status" in ('pending', 'analyzed', 'confirmed', 'dismissed', 'error'))
);
--> statement-breakpoint
ALTER TABLE "message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "message_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"message_type" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"model_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_analysis_type_check" CHECK ("message_analysis"."message_type" in ('gig_offer', 'contract', 'payment_note', 'other')),
	CONSTRAINT "message_analysis_confidence_check" CHECK ("message_analysis"."confidence" between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "message_analysis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "todo" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_submitted_by_person_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_analysis" ADD CONSTRAINT "message_analysis_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_analysis" ADD CONSTRAINT "message_analysis_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_talent_status_idx" ON "message" USING btree ("talent_id","status");--> statement-breakpoint
CREATE INDEX "message_project_idx" ON "message" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "message_analysis_message_idx" ON "message_analysis" USING btree ("message_id","created_at");--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;