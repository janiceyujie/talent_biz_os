CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_id" uuid,
	"direction" text NOT NULL,
	"installment" text DEFAULT 'regular' NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'TWD' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"tax_included" boolean DEFAULT false NOT NULL,
	"recorded_on" date NOT NULL,
	"due_on" date,
	"status" text DEFAULT 'expected' NOT NULL,
	"settled_amount" numeric(12, 2),
	"settled_on" date,
	"method" text,
	"invoice_ref" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_direction_check" CHECK ("payment"."direction" in ('in', 'out')),
	CONSTRAINT "payment_installment_check" CHECK ("payment"."installment" in ('regular', 'deposit', 'balance')),
	CONSTRAINT "payment_status_check" CHECK ("payment"."status" in ('expected', 'settled', 'cancelled')),
	CONSTRAINT "payment_currency_check" CHECK ("payment"."currency" = 'TWD'),
	CONSTRAINT "payment_tax_rate_check" CHECK ("payment"."tax_rate" between 0 and 100),
	CONSTRAINT "payment_amount_check" CHECK ("payment"."amount" >= 0 and ("payment"."settled_amount" is null or "payment"."settled_amount" >= 0)),
	CONSTRAINT "payment_settled_check" CHECK (("payment"."status" = 'settled') = ("payment"."settled_on" is not null))
);
--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_talent_status_due_idx" ON "payment" USING btree ("talent_id","status","due_on");--> statement-breakpoint
CREATE INDEX "payment_project_idx" ON "payment" USING btree ("project_id");