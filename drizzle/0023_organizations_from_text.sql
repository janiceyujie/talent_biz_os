-- Decision 0012: organisations from the partner and company text already stored.
-- A project's client is its partner text, as the person typed it. The one
-- exception: when that text is just its main contact's own name (linking a
-- contact wrote the name there), the contact's company is the client instead.
-- Names merge per talent, ignoring case and surrounding spaces; near-duplicates
-- are left for the person to merge. The text columns stay.
WITH project_client AS (
  SELECT p.id AS project_id, p.talent_id,
    CASE
      WHEN c.id IS NOT NULL AND lower(btrim(p.counterparty)) = lower(btrim(c.name)) AND NULLIF(btrim(c.company), '') IS NOT NULL
        THEN btrim(c.company)
      ELSE NULLIF(btrim(p.counterparty), '')
    END AS name
  FROM project p
  LEFT JOIN contact c ON c.id = p.counterparty_id
), names AS (
  SELECT talent_id, btrim(company) AS name FROM contact WHERE NULLIF(btrim(company), '') IS NOT NULL
  UNION ALL
  SELECT talent_id, name FROM project_client WHERE name IS NOT NULL
)
INSERT INTO "organization" ("talent_id", "name")
SELECT talent_id, min(name) FROM names GROUP BY talent_id, lower(name);
--> statement-breakpoint
-- People: linked to the organisation their company names.
UPDATE "contact" c SET "organization_id" = o.id
FROM "organization" o
WHERE o.talent_id = c.talent_id AND lower(o.name) = lower(btrim(c.company)) AND c.organization_id IS NULL;
--> statement-breakpoint
-- Each project's client, as its primary organisation.
INSERT INTO "project_organization" ("talent_id", "project_id", "organization_id", "is_primary")
SELECT p.talent_id, p.id, o.id, true
FROM project p
LEFT JOIN contact c ON c.id = p.counterparty_id
JOIN organization o ON o.talent_id = p.talent_id
  AND lower(o.name) = lower(
    CASE
      WHEN c.id IS NOT NULL AND lower(btrim(p.counterparty)) = lower(btrim(c.name)) AND NULLIF(btrim(c.company), '') IS NOT NULL
        THEN btrim(c.company)
      ELSE btrim(p.counterparty)
    END)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- The organisations of a project's people (its main contact and anyone else on
-- it) come onto the project too, without a role yet.
INSERT INTO "project_organization" ("talent_id", "project_id", "organization_id", "is_primary")
SELECT DISTINCT people.talent_id, people.project_id, c.organization_id, false
FROM (
  SELECT talent_id, id AS project_id, counterparty_id AS contact_id FROM project WHERE counterparty_id IS NOT NULL
  UNION ALL
  SELECT talent_id, project_id, contact_id FROM project_contact
) people
JOIN contact c ON c.id = people.contact_id
WHERE c.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- project.counterparty mirrors the primary organisation's name from here on.
UPDATE "project" p SET "counterparty" = o.name
FROM project_organization po
JOIN organization o ON o.id = po.organization_id
WHERE po.project_id = p.id AND po.is_primary AND p.counterparty <> o.name;
