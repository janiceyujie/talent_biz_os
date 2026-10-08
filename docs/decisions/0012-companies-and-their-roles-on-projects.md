# 0012 — Companies, their people, and their roles on projects

**Status:** Accepted (2026-10-07)

## Context

A partner is text in two unconnected places today: `project.counterparty` (the name on a project, such as "春浪國際") and `contact.company` (a free-text field on each person). Nothing ties them together. The app can't show everyone at one company or every project with it, and two spellings of one name become two partners. Partner insights group by a single contact, which only works when a company has exactly one person.

Deals often involve several organisations: a brand and its agency, an organiser and a venue, a label and a festival. Each organisation has more than one person: the main contact, finance, someone on site. Since `project_contact` (migration 0021), a project can list several people, but without their companies, so the screen can't say who works where.

## Decision

- **An `organization` table:** a company, organisation, band, or label the talent works with. It has a name and notes, and it can be archived like a contact. Artists stay contacts. A band or label is an organisation like any other, and its role on a project says what part it plays.
- **`contact.organization_id`** (optional): where a person works. One organisation has many contacts; a contact has one organisation or none (an independent, such as a freelance producer). Moving jobs means changing the link; past projects keep their people.
- **`project_organization`:** the organisations on a project, each with a **free-text role** (主辦, 經紀, 場地, 品牌…), the person's own words, as with people's roles. **Exactly one is primary**: the client. The primary organisation is what the projects list shows and what finance and partner insights group by.
- **`project_contact` stays:** the people on a project. The screen groups them under their organisation, with independents last.
- **`project.counterparty_id` stays the main contact,** the person intake matches incoming emails to.
- **`project.counterparty` (text) stays** and is kept in step with the primary organisation's name, so everything that reads it keeps working. It can go once nothing reads it.
- **Adding a person whose organisation isn't on the project adds the organisation too.** Adding an organisation suggests its contacts.
- **Every table is scoped to the talent,** like the rest.

### Migration of existing data

A data migration creates organisations from today's text: each distinct `contact.company` and `project.counterparty` per talent, merging exact matches after trimming spaces and ignoring case. It then links contacts and projects to them, making each project's organisation its primary one. The old text columns are kept, so nothing is lost. Near-duplicates ("春浪國際" and "春浪國際股份有限公司") are left for the person to merge; merging organisations is part of the organisation page.

### Near-duplicates

Organisations that may be one entered twice are suggested, never merged on their own (`lib/domain/organizations.ts`):

- **Names are normalised first:** full-width and half-width forms match, case and spacing are ignored, punctuation is dropped, and so are legal suffixes (股份有限公司, 有限公司, 公司, 工作室, Inc., Ltd., Co., Corp., LLC).
- **Strong matches:** the normalised names are equal, or their people share an email domain (free-mail domains such as gmail.com don't count).
- **Possible matches:** one normalised name contains the other (at least 3 characters), or two Latin-letter names are a letter or two apart.
- **Not a match:** names that differ only in their digits ("Studio 1" and "Studio 10").
- **"Not the same" is stored per pair** in `organization_distinct` (smaller id first, the workspace's decision, gone when either organisation is). A rename doesn't bring a pair back; an organisation's page lists its pairs with an undo.
- **Merging** asks which organisation to keep and its final name. It moves the other's people and its places on projects (one row where a project had both, the client if either was), mirrors the name into the partner text of projects it's the client of, and deletes the other, in one transaction.

### Moving someone to another organisation

The contact editor has an Organisation field. Mostly it fixes data entered under the wrong organisation (or none); sometimes it records a job change. A project groups its people by their current organisation, so moving someone also changes how they show on past projects. That's right for a correction, and slightly rewrites history for a job change. Recording who someone worked for on each project is left for later, if it matters.

### Screens

- **Artists & partners** gets an Organisations view, with possible duplicates above the list. A list leads to an organisation page: its people (add or remove), its projects with its role on each, and the money on projects it's the client of.
- **Partner insights** are per organisation: the signed projects it's the client of. Organisations that were never a client of signed work aren't listed.
- **The project's Partner card** lists organisations, primary first, each with its role and its people under it. It has "+ Add" for an organisation or a person, and a link to each organisation's page.
- **The new-project form** asks for the client organisation, using the same picker pattern as the partner field (search, or add new), and optionally its main contact.

## Alternatives considered

- **Keep companies as text on contacts and projects.** No migration, but the duplicates and the missing "everyone at this company" view are the problem this record exists to solve.
- **Exactly one organisation per project.** Simpler, and most deals have one client. But agency-plus-brand and organiser-plus-venue deals are common in this business, and listing the second organisation only through its people hides who is who.
- **Roles from a fixed list** (client, agency, venue…). Easier to filter, but roles in this industry vary too much. Free text matches how people roles work, and a fixed list can be added later by mapping common words.
- **A contact in several organisations.** It happens (a manager working for two labels), but it complicates every screen. For now they're two contacts, or one contact without an organisation.

## Consequences

- Three schema changes (one table, one column on `contact`, one join table) and a data migration that rewrites links. It runs once, before launch if possible, while data is small.
- Partner insights and the finance grouping move from contacts to organisations. Their numbers change for any partner that had several contacts, and that's a correction, not a regression.
- Intake can later match a message by email domain to an organisation, not just by address to one person. That's not part of this decision.
- `project.counterparty` stays duplicated with the primary organisation's name until the places that read it move over. Watch for drift: the code that changes a project's primary organisation must update it in the same transaction.
