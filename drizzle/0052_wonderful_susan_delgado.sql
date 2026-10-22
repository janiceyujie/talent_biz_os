ALTER TABLE "grant_opportunity" ADD COLUMN "kind" text DEFAULT 'grant' NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunity" ADD COLUMN "eligibility" jsonb;--> statement-breakpoint
CREATE INDEX "grant_opportunity_kind_idx" ON "grant_opportunity" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "grant_opportunity" ADD CONSTRAINT "grant_opportunity_kind_check" CHECK ("grant_opportunity"."kind" in ('grant', 'competition', 'exhibition', 'showcase'));