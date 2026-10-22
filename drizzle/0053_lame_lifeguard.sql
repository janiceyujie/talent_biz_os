CREATE TABLE "grant_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"old_opens_on" date,
	"new_opens_on" date,
	"old_closes_on" date,
	"new_closes_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grant_change_revision_unique" UNIQUE("opportunity_id","revision"),
	CONSTRAINT "grant_change_kind_check" CHECK ("grant_change"."kind" in ('new', 'dates'))
);
--> statement-breakpoint
ALTER TABLE "grant_change" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grant_opportunity" ADD COLUMN "notice_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunity" ADD COLUMN "disciplines" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_change" ADD CONSTRAINT "grant_change_opportunity_id_grant_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."grant_opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grant_change_created_idx" ON "grant_change" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "grant_change_opportunity_idx" ON "grant_change" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "grant_opportunity_disciplines_idx" ON "grant_opportunity" USING gin ("disciplines");--> statement-breakpoint
ALTER TABLE "grant_opportunity" ADD CONSTRAINT "grant_opportunity_disciplines_check" CHECK ("grant_opportunity"."disciplines" <@ ARRAY['music','photography','film','fashion','design','visual_art','performing_arts','literature','multidisciplinary']::text[]);