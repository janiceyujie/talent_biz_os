CREATE TABLE "organization_distinct" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"organization_a_id" uuid NOT NULL,
	"organization_b_id" uuid NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_distinct_pair" UNIQUE("organization_a_id","organization_b_id"),
	CONSTRAINT "organization_distinct_order" CHECK ("organization_distinct"."organization_a_id" < "organization_distinct"."organization_b_id")
);
--> statement-breakpoint
ALTER TABLE "organization_distinct" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_distinct" ADD CONSTRAINT "organization_distinct_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_distinct" ADD CONSTRAINT "organization_distinct_organization_a_id_organization_id_fk" FOREIGN KEY ("organization_a_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_distinct" ADD CONSTRAINT "organization_distinct_organization_b_id_organization_id_fk" FOREIGN KEY ("organization_b_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_distinct" ADD CONSTRAINT "organization_distinct_decided_by_person_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;