ALTER TABLE "signup_allowlist" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD COLUMN "added_by" uuid;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD COLUMN "locale" text DEFAULT 'zh-TW' NOT NULL;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD COLUMN "invitation_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD COLUMN "invitation_sent_by" uuid;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD COLUMN "withdrawn_by" uuid;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD CONSTRAINT "signup_allowlist_added_by_person_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD CONSTRAINT "signup_allowlist_invitation_sent_by_person_id_fk" FOREIGN KEY ("invitation_sent_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD CONSTRAINT "signup_allowlist_withdrawn_by_person_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD CONSTRAINT "signup_allowlist_locale_check" CHECK ("signup_allowlist"."locale" in ('zh-TW', 'en'));--> statement-breakpoint
ALTER TABLE "signup_allowlist" ADD CONSTRAINT "signup_allowlist_withdrawn_check" CHECK ("signup_allowlist"."withdrawn_at" is null or "signup_allowlist"."used_at" is null);