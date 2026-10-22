CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"region" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"agency" text NOT NULL,
	"url" text NOT NULL,
	"opens_on" date,
	"closes_on" date,
	"source_status" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"rules" jsonb,
	"content_hash" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_source_external" UNIQUE("source","external_id"),
	CONSTRAINT "opportunity_region_check" CHECK ("opportunity"."region" in ('TW', 'US')),
	CONSTRAINT "opportunity_kind_check" CHECK ("opportunity"."kind" in ('grant', 'competition', 'showcase', 'residency')),
	CONSTRAINT "opportunity_source_status_check" CHECK ("opportunity"."source_status" in ('posted', 'forecasted', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "opportunity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "opportunity_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"project_id" uuid,
	"stage" text DEFAULT 'preparing' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_application_talent_opportunity" UNIQUE("talent_id","opportunity_id"),
	CONSTRAINT "opportunity_application_stage_check" CHECK ("opportunity_application"."stage" in ('preparing', 'submitted', 'awarded', 'not_selected', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "opportunity_application" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "opportunity_source" (
	"id" text PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"failure" text
);
--> statement-breakpoint
ALTER TABLE "opportunity_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "opportunity_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"todo_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_task_todo" UNIQUE("todo_id"),
	CONSTRAINT "opportunity_task_kind_check" CHECK ("opportunity_task"."kind" in ('submission', 'eligibility', 'proposal', 'budget', 'agreement', 'report', 'settlement', 'custom'))
);
--> statement-breakpoint
ALTER TABLE "opportunity_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_source_opportunity_source_id_fk" FOREIGN KEY ("source") REFERENCES "public"."opportunity_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_task" ADD CONSTRAINT "opportunity_task_application_id_opportunity_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."opportunity_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_task" ADD CONSTRAINT "opportunity_task_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_region_closes_idx" ON "opportunity" USING btree ("region","closes_on");--> statement-breakpoint
CREATE INDEX "opportunity_task_application_idx" ON "opportunity_task" USING btree ("application_id");