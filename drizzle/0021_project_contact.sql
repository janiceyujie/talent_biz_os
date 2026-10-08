CREATE TABLE "project_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_contact_project_contact" UNIQUE("project_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "project_contact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_contact_project_idx" ON "project_contact" USING btree ("project_id");