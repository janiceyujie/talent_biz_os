ALTER TABLE "payment" DROP CONSTRAINT "payment_currency_check";--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_quote_currency_check";--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_currency_check" CHECK ("payment"."currency" in ('TWD', 'HKD', 'USD', 'JPY', 'EUR', 'GBP'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_quote_currency_check" CHECK ("project"."quote_currency" in ('TWD', 'HKD', 'USD', 'JPY', 'EUR', 'GBP'));