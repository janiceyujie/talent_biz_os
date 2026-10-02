CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"start_date" date NOT NULL,
	"start_time" time(0),
	"time_zone" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_status_check" CHECK ("calendar_event"."status" in ('proposed', 'confirmed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "calendar_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "todo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_id" uuid,
	"payment_id" uuid,
	"type" text DEFAULT 'custom' NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"due_time" time(0),
	"time_zone" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_type_check" CHECK ("todo"."type" in ('reply', 'follow_up', 'review_contract', 'review_contract_change', 'confirm_event', 'payment_due', 'confirm_logistics', 'deliverable', 'milestone', 'custom')),
	CONSTRAINT "todo_status_check" CHECK ("todo"."status" in ('open', 'done', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "todo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_talent_start_idx" ON "calendar_event" USING btree ("talent_id","start_date");--> statement-breakpoint
CREATE INDEX "calendar_event_project_idx" ON "calendar_event" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "todo_talent_status_due_idx" ON "todo" USING btree ("talent_id","status","due_date");--> statement-breakpoint
CREATE INDEX "todo_project_idx" ON "todo" USING btree ("project_id");