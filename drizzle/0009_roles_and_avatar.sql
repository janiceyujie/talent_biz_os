ALTER TABLE "talent" DROP CONSTRAINT "talent_vertical_check";--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "avatar_appearance" text DEFAULT 'non_binary' NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_avatar_appearance_check" CHECK ("person"."avatar_appearance" in ('female', 'male', 'non_binary'));--> statement-breakpoint
ALTER TABLE "talent" ADD CONSTRAINT "talent_vertical_check" CHECK ("talent"."vertical" in ('music', 'influencer', 'model', 'video', 'other'));