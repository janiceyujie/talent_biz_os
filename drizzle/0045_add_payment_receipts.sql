CREATE TABLE "payment_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"cash" numeric(12, 2) NOT NULL,
	"withheld" numeric(12, 2) DEFAULT 0 NOT NULL,
	"note" text,
	"replaces_id" uuid,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipt_amounts_check" CHECK ("payment_receipt"."cash" >= 0 and "payment_receipt"."withheld" >= 0),
	CONSTRAINT "payment_receipt_withdrawn_check" CHECK (not "payment_receipt"."withdrawn" or ("payment_receipt"."replaces_id" is not null and "payment_receipt"."cash" = 0 and "payment_receipt"."withheld" = 0))
);
--> statement-breakpoint
ALTER TABLE "payment_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_replaces_id_payment_receipt_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."payment_receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_recorded_by_person_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_receipt_payment_idx" ON "payment_receipt" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipt_replaces_once" ON "payment_receipt" USING btree ("replaces_id");