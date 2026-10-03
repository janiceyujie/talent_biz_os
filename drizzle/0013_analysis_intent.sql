-- message_analysis.message_type (gig_offer / contract / payment_note / other) becomes
-- intent (what the message is doing; lib/ai/extraction/intents.ts), and each
-- analysis records the prompt version it was made with.
ALTER TABLE "message_analysis" DROP CONSTRAINT "message_analysis_type_check";--> statement-breakpoint
ALTER TABLE "message_analysis" RENAME COLUMN "message_type" TO "intent";--> statement-breakpoint
UPDATE "message_analysis" SET "intent" = CASE "intent" WHEN 'gig_offer' THEN 'inquiry' WHEN 'payment_note' THEN 'payment' WHEN 'contract' THEN 'contract' ELSE 'other' END;--> statement-breakpoint
ALTER TABLE "message_analysis" ADD CONSTRAINT "message_analysis_intent_check" CHECK ("message_analysis"."intent" in ('inquiry', 'negotiation', 'confirmation', 'contract', 'logistics', 'payment', 'cancellation', 'other'));--> statement-breakpoint
ALTER TABLE "message_analysis" ADD COLUMN "prompt_version" text NOT NULL DEFAULT 'before-registry';--> statement-breakpoint
ALTER TABLE "message_analysis" ALTER COLUMN "prompt_version" DROP DEFAULT;
