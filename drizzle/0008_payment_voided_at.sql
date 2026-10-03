-- A payment is voided (作廢), not archived: a mistaken or duplicate entry that
-- drops out of every total. Same data, clearer name; existing values carry over.
ALTER TABLE "payment" RENAME COLUMN "archived_at" TO "voided_at";
