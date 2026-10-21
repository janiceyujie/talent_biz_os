-- Who the person corresponds with on each project (decision 0019), from the messages already filed:
-- a received email's sender, the recipients of the person's own reply, or the email a pasted
-- message's latest analysis gives. Notices aren't messages (kind), so they're left out.
WITH filed AS (
  SELECT m.talent_id, m.project_id, m.received_at, m.direction, m.sender, m.recipients,
    (SELECT a.analysis FROM message_analysis a WHERE a.message_id = m.id ORDER BY a.created_at DESC LIMIT 1) AS analysis
  FROM message m
  WHERE m.status = 'confirmed' AND m.project_id IS NOT NULL AND m.kind = 'message'
), entries AS (
  -- A To line splits on commas outside quoted names.
  SELECT talent_id, project_id, received_at, trim(part) AS entry
  FROM filed, regexp_split_to_table(filed.recipients, ',(?=(?:[^"]*"[^"]*")*[^"]*$)') AS part
  WHERE direction = 'sent' AND recipients IS NOT NULL
  UNION ALL
  SELECT talent_id, project_id, received_at, sender FROM filed WHERE direction = 'received' AND sender IS NOT NULL
  UNION ALL
  SELECT talent_id, project_id, received_at,
    coalesce(analysis #>> '{counterparty,name}', '') || ' <' || (analysis #>> '{counterparty,email}') || '>'
  FROM filed
  WHERE direction = 'received' AND sender IS NULL AND coalesce(analysis #>> '{counterparty,email}', '') <> ''
), parsed AS (
  SELECT talent_id, project_id, received_at,
    lower(trim(coalesce(substring(entry from '<([^<>]+)>\s*$'), entry))) AS email,
    trim(both '"' from trim(coalesce(substring(entry from '^\s*(.*?)\s*<[^<>]+>\s*$'), ''))) AS name
  FROM entries
)
INSERT INTO "project_correspondent" ("talent_id", "project_id", "email", "name", "last_at", "message_count")
SELECT talent_id, project_id, email,
  coalesce((array_agg(name ORDER BY received_at DESC) FILTER (WHERE name <> ''))[1], ''),
  max(received_at), count(*)
FROM parsed
WHERE email LIKE '%_@_%'
GROUP BY talent_id, project_id, email
ON CONFLICT ("project_id", "email") DO NOTHING;
