CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"project_id" uuid,
	"number" text NOT NULL,
	"issue_on" date NOT NULL,
	"due_on" date NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"storage_key" text,
	"message_id" text,
	"auto_gmail_draft" boolean DEFAULT false NOT NULL,
	"gmail_connection_id" uuid,
	"gmail_account_subject" text,
	"gmail_account_email" text,
	"gmail_draft_id" text,
	"gmail_message_id" text,
	"gmail_error" text,
	"gmail_checked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_talent_number_unique" UNIQUE("talent_id","number"),
	CONSTRAINT "invoice_dates_check" CHECK ("invoice"."due_on" >= "invoice"."issue_on"),
	CONSTRAINT "invoice_status_check" CHECK ("invoice"."status" in ('scheduled', 'draft', 'sending', 'sent', 'delivery_unknown', 'cancelled', 'draft_queued', 'draft_creating', 'gmail_draft', 'draft_unknown', 'draft_missing'))
);
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_counter" (
	"talent_id" uuid PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_counter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tax_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"state" char(2) NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"county" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"interstate_rate" numeric(7, 4),
	"food_rate" numeric(7, 4),
	"food_interstate_rate" numeric(7, 4),
	"valid_from" date NOT NULL,
	"valid_through" date,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "tax_rate_range" CHECK ("tax_rate"."rate" >= 0 and "tax_rate"."rate" <= 100),
	CONSTRAINT "tax_rate_dates" CHECK ("tax_rate"."valid_through" is null or "tax_rate"."valid_through" >= "tax_rate"."valid_from"),
	CONSTRAINT "tax_rate_kind" CHECK ("tax_rate"."kind" in ('component', 'combined'))
);
--> statement-breakpoint
CREATE TABLE "tax_rate_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" char(2) NOT NULL,
	"provider" text NOT NULL,
	"source_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_storage_key" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"row_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"state" char(2) NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"scope" text NOT NULL,
	"rate" numeric(7, 4),
	"source_url" text NOT NULL,
	"source_hash" text,
	"source_storage_key" text,
	"checked_at" timestamp with time zone NOT NULL,
	"source_status" text NOT NULL,
	"valid_from" date,
	"valid_through" date,
	"date_basis" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reasons" jsonb NOT NULL,
	"notes" text NOT NULL,
	CONSTRAINT "tax_reference_rate" CHECK ("tax_reference"."rate" is null or ("tax_reference"."rate" >= 0 and "tax_reference"."rate" <= 100)),
	CONSTRAINT "tax_reference_dates" CHECK ("tax_reference"."valid_from" is null or "tax_reference"."valid_through" is null or "tax_reference"."valid_through" >= "tax_reference"."valid_from"),
	CONSTRAINT "tax_reference_pending" CHECK ("tax_reference"."status" = 'pending'),
	CONSTRAINT "tax_reference_evidence" CHECK ("tax_reference"."source_status" = 'pending' or ("tax_reference"."source_status" = 'retained' and "tax_reference"."source_hash" is not null and "tax_reference"."source_storage_key" is not null)),
	CONSTRAINT "tax_reference_level" CHECK ("tax_reference"."level" in ('state', 'local', 'combined', 'localSummary')),
	CONSTRAINT "tax_reference_date_basis" CHECK ("tax_reference"."date_basis" in ('effective', 'snapshot', 'administrative', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "tax_reference_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"manifest_storage_key" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"row_count" integer NOT NULL,
	CONSTRAINT "tax_reference_release_contentHash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "tax_service_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" char(2) NOT NULL,
	"category" text NOT NULL,
	"delivery" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"treatment" text DEFAULT 'unknown' NOT NULL,
	"source_url" text,
	"content_hash" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"valid_from" date,
	"valid_through" date,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "tax_rule_review" CHECK ("tax_service_rule"."status" <> 'reviewed' or ("tax_service_rule"."source_url" is not null and "tax_service_rule"."valid_from" is not null and "tax_service_rule"."valid_through" is not null and "tax_service_rule"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "tax_source" (
	"state" char(2) PRIMARY KEY NOT NULL,
	"directory_url" text NOT NULL,
	"rate_index_url" text,
	"boundary_index_url" text,
	"coverage" text DEFAULT 'pending' NOT NULL,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "tax_rate" SET DATA TYPE numeric(7, 4);--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "tax_rate" SET DATA TYPE numeric(7, 4);--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "invoice_on" date;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_gmail_connection_id_mail_connection_id_fk" FOREIGN KEY ("gmail_connection_id") REFERENCES "public"."mail_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_approved_by_person_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counter" ADD CONSTRAINT "invoice_counter_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate" ADD CONSTRAINT "tax_rate_batch_id_tax_rate_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tax_rate_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_batch" ADD CONSTRAINT "tax_rate_batch_state_tax_source_state_fk" FOREIGN KEY ("state") REFERENCES "public"."tax_source"("state") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_reference" ADD CONSTRAINT "tax_reference_release_id_tax_reference_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."tax_reference_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_reference" ADD CONSTRAINT "tax_reference_state_tax_source_state_fk" FOREIGN KEY ("state") REFERENCES "public"."tax_source"("state") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_service_rule" ADD CONSTRAINT "tax_service_rule_state_tax_source_state_fk" FOREIGN KEY ("state") REFERENCES "public"."tax_source"("state") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_active_payment_unique" ON "invoice" USING btree ("payment_id") WHERE "invoice"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "invoice_talent_list_idx" ON "invoice" USING btree ("talent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "invoice_schedule_idx" ON "invoice" USING btree ("status","issue_on");--> statement-breakpoint
CREATE INDEX "tax_rate_lookup" ON "tax_rate" USING btree ("state","kind","name");--> statement-breakpoint
CREATE INDEX "tax_rate_batch_lookup" ON "tax_rate" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rate_revision" ON "tax_rate" USING btree ("batch_id","code","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_batch_revision" ON "tax_rate_batch" USING btree ("state","content_hash");--> statement-breakpoint
CREATE INDEX "tax_reference_lookup" ON "tax_reference" USING btree ("release_id","state","level","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_reference_revision" ON "tax_reference" USING btree ("release_id","state","code");--> statement-breakpoint
CREATE INDEX "tax_rule_lookup" ON "tax_service_rule" USING btree ("state","category","delivery");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rule_revision" ON "tax_service_rule" USING btree ("state","category","delivery","content_hash");--> statement-breakpoint
CREATE INDEX "payment_talent_invoice_on_idx" ON "payment" USING btree ("talent_id","invoice_on");