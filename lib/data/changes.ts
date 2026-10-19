import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// What the screens compare to notice work done elsewhere (components/app/live-refresh.tsx):
// one short mark that changes when anything the app data shows changes, whoever changed it:
// the worker, a teammate, another tab. Counts catch deletes, the latest timestamps catch
// inserts and edits. Cheap enough to ask for every few seconds.

// The talent's tables the screens show, and the column that moves when a row changes.
const tables = [
  ["project", "updated_at"],
  ["project_contact", "created_at"],
  ["project_organization", "created_at"],
  ["contact", "updated_at"],
  ["organization", "updated_at"],
  ["organization_distinct", "created_at"],
  ["payment", "updated_at"],
  ["calendar_event", "updated_at"],
  ["todo", "updated_at"],
  ["reply_template", "updated_at"],
  ["contract", "updated_at"],
  ["file", "created_at"],
  ["message", "updated_at"],
  ["message_analysis", "created_at"],
  ["mail_connection", "updated_at"],
  ["mail_decision", "updated_at"],
  ["mail_sender_rule", "created_at"],
  ["membership", "created_at"],
  ["preference", "updated_at"],
  ["calendar_connection", "updated_at"],
] as const;

/** A fingerprint of everything this person's screens show for this talent; equal marks mean nothing changed. */
export async function changeMark(talentId: string, personId: string): Promise<string> {
  const parts = tables.map(
    ([table, column]) =>
      sql`(select count(*) || ':' || coalesce(max(${sql.raw(column)})::text, '') from ${sql.raw(table)} where talent_id = ${talentId})`,
  );
  const [row] = await db.execute<{ mark: string }>(sql`
    select md5(concat_ws('|',
      ${sql.join(parts, sql`, `)},
      (select updated_at::text from talent where id = ${talentId}),
      (select concat_ws(',', status, last_synced_at, sync_requested_at) from mail_connection where talent_id = ${talentId}),
      (select max(s.last_imported_at)::text from calendar_import_source s join calendar_connection c on c.id = s.connection_id
        where c.talent_id = ${talentId} and c.person_id = ${personId})
    )) as mark`);
  return row.mark;
}
