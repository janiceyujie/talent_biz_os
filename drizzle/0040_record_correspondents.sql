CREATE TABLE "project_correspondent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"message_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_correspondent_project_email" UNIQUE("project_id","email")
);
--> statement-breakpoint
ALTER TABLE "project_correspondent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_correspondent" ADD CONSTRAINT "project_correspondent_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_correspondent" ADD CONSTRAINT "project_correspondent_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_correspondent_talent_email_idx" ON "project_correspondent" USING btree ("talent_id","email");