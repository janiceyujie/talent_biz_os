ALTER TABLE "message" ADD COLUMN "recipients" text;--> statement-breakpoint
ALTER TABLE "todo" ADD COLUMN "completed_by_message_id" uuid;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_completed_by_message_id_message_id_fk" FOREIGN KEY ("completed_by_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;