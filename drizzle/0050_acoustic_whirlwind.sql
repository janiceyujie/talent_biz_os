CREATE TABLE "grant_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"project_id" uuid,
	"stage" text DEFAULT 'preparing' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grant_application_talent_opportunity" UNIQUE("talent_id","opportunity_id"),
	CONSTRAINT "grant_application_stage_check" CHECK ("grant_application"."stage" in ('preparing', 'submitted', 'awarded', 'not_selected', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "grant_application" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grant_opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"region" text NOT NULL,
	"title" text NOT NULL,
	"agency" text NOT NULL,
	"url" text NOT NULL,
	"opens_on" date,
	"closes_on" date,
	"source_status" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grant_opportunity_source_external" UNIQUE("source","external_id"),
	CONSTRAINT "grant_opportunity_region_check" CHECK ("grant_opportunity"."region" in ('TW', 'US')),
	CONSTRAINT "grant_opportunity_status_check" CHECK ("grant_opportunity"."source_status" in ('posted', 'forecasted', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "grant_opportunity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grant_source" (
	"id" text PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"failure" text
);
--> statement-breakpoint
ALTER TABLE "grant_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grant_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"todo_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grant_task_todo_unique" UNIQUE("todo_id"),
	CONSTRAINT "grant_task_kind_check" CHECK ("grant_task"."kind" in ('eligibility', 'proposal', 'budget', 'submission', 'agreement', 'receipts', 'report', 'settlement', 'custom'))
);
--> statement-breakpoint
ALTER TABLE "grant_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grant_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"regions" jsonb DEFAULT '["TW","US"]'::jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grant_watch_person_talent" UNIQUE("person_id","talent_id")
);
--> statement-breakpoint
ALTER TABLE "grant_watch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "manager_entitlement" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'basic' NOT NULL,
	"artist_limit" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'local_trial' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manager_entitlement_plan_check" CHECK ("manager_entitlement"."plan" in ('basic', 'pro', 'manager')),
	CONSTRAINT "manager_entitlement_source_check" CHECK ("manager_entitlement"."source" in ('local_trial', 'subscription')),
	CONSTRAINT "manager_entitlement_limit_check" CHECK ("manager_entitlement"."artist_limit" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "manager_entitlement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD COLUMN "import_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD COLUMN "import_failure" text;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD COLUMN "requested_by" uuid;--> statement-breakpoint
ALTER TABLE "grant_application" ADD CONSTRAINT "grant_application_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_application" ADD CONSTRAINT "grant_application_opportunity_id_grant_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."grant_opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_application" ADD CONSTRAINT "grant_application_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity" ADD CONSTRAINT "grant_opportunity_source_grant_source_id_fk" FOREIGN KEY ("source") REFERENCES "public"."grant_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_task" ADD CONSTRAINT "grant_task_application_id_grant_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."grant_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_task" ADD CONSTRAINT "grant_task_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_watch" ADD CONSTRAINT "grant_watch_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_watch" ADD CONSTRAINT "grant_watch_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_entitlement" ADD CONSTRAINT "manager_entitlement_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grant_application_talent_idx" ON "grant_application" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "grant_opportunity_region_close_idx" ON "grant_opportunity" USING btree ("region","closes_on");--> statement-breakpoint
CREATE INDEX "grant_task_application_idx" ON "grant_task" USING btree ("application_id");--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_requested_by_person_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_decision" ADD CONSTRAINT "mail_decision_import_status_check" CHECK ("mail_decision"."import_status" in ('idle', 'queued', 'imported', 'error'));