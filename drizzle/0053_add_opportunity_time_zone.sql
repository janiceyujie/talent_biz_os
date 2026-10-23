-- Each call's dates are days in its funding body's time zone (decision 0024).
-- Calls already read get their region's: Taipei for Taiwan, Grants.gov's
-- Eastern for the US; the next daily read sets each one from its source.
ALTER TABLE "opportunity" ADD COLUMN "time_zone" text NOT NULL DEFAULT 'Asia/Taipei';--> statement-breakpoint
UPDATE "opportunity" SET "time_zone" = 'America/New_York' WHERE "region" = 'US';--> statement-breakpoint
ALTER TABLE "opportunity" ALTER COLUMN "time_zone" DROP DEFAULT;
