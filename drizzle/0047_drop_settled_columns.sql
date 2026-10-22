ALTER TABLE "payment" DROP CONSTRAINT "payment_settled_check";--> statement-breakpoint
ALTER TABLE "payment" DROP CONSTRAINT "payment_amount_check";--> statement-breakpoint
ALTER TABLE "payment" DROP COLUMN "settled_amount";--> statement-breakpoint
ALTER TABLE "payment" DROP COLUMN "settled_on";--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_check" CHECK ("payment"."amount" >= 0);