CREATE TABLE "preference" (
	"person_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preference_person_id_talent_id_key_pk" PRIMARY KEY("person_id","talent_id","key")
);
--> statement-breakpoint
ALTER TABLE "preference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "preference" ADD CONSTRAINT "preference_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference" ADD CONSTRAINT "preference_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;