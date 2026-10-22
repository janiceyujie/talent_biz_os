ALTER TABLE "ai_call" ADD COLUMN "flags" text[];--> statement-breakpoint
CREATE INDEX "ai_call_person_created_idx" ON "ai_call" USING btree ("person_id","created_at");