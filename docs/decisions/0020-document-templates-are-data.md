# 0020 — Contract and quote templates are data, published on deploy and generated on the server

**Status:** Accepted (2026-10-21)

## Context

Talent negotiate the same few kinds of deal again and again (a live show, a license, a brand campaign, a podcast guest spot), and many start from a blank page or an old email. A library of fill-in-the-blank contracts and quotes, in English and Traditional Chinese, saves that work: 18 scenarios, each with a contract and a quote, 72 documents. Each can be previewed, copied as text, or downloaded as a Word file.

Two things are planned on top of it, though neither is built yet:

- **The Taloox team edits the library online:** changing a clause or adding a scenario without a release.
- **A person makes their own contract from a template:** a copy for one deal, edited, kept with its project.

The `user/timothy0324/workspace-foundation` branch built the library with the text in the UI message catalogs, a Python script that turned it into Word files committed to the repository, and an import into a `document_template` table and Storage. That import ran only against a local database. So the library would have been empty in production, and the same text lived in three copies (catalog, Word file, table) with nothing to catch them drifting apart.

These are legal documents. They aren't reviewed by a lawyer for now. Template services such as Rocket Lawyer and LAW.co say on the template, and in their terms, that they're self-help documents and not legal advice. Use counts as acceptance; there's no checkbox on each download.

## Decision

**The library is data.** A template is a row in `document_template`: scenario, the role it's written for (musician, model…), kind (contract or quote), language, version, structured content (title, introduction, sections), and the key of its Word file in Storage. One version per scenario, kind, and language is published. It's one shared catalog, not any workspace's data, and it holds no names, signatures, or amounts.

**Its source, for now, is the repository:** one content file per template under `assets/document-templates/content/`, not the UI message catalogs. They're documents, not interface text, and once the library is edited online they'll be its first version, not its home.

**Publishing runs on deploy,** as part of `npm run db:migrate`, after the migrations. For each content file it computes a hash of the content and the generator's version. If the published version matches, nothing happens. If not, it generates the Word file, uploads it to Storage under a key that includes the hash, and adds a new published version, keeping the old row and file. It's the same in development and production, and running it twice changes nothing.

**Word files are generated on the server**, with the `docx` package, from the structured content. The same generator will make the file for a template edited online, and for a person's own contract. Nothing generated is committed to the repository.

**An online edit is never overwritten by a deploy (later).** Once the team can edit templates, an edited template has a newer version than the repository's. Publishing adds a version only when the repository's own content changes, and doesn't publish it over a newer edit made online: it records it, unpublished, for the team to look at.

**A person's own contract (later)** is a copy: it belongs to their workspace, is stored like their other files (`file`, and a `contract` version on the project), and its first version records the template version it came from, by that version's row id (a version's row never changes, so the id names the template and the version). Its own later versions are the contract's (`version_number`, `supersedes_id`), as for any contract. Editing it never changes the template.

**Not legal advice, said three times:**

- **On the library**, a line under its heading: these are templates for reference only, not legal advice; check them and use them at your own responsibility, ideally with a lawyer. With a link to the terms.
- **In every Word file**, a short note at the top saying the same, which the person deletes when they're done.
- **In the terms of service**, a clause: Taloox isn't a law firm, its templates are self-help documents and not legal advice, using them creates no lawyer–client relationship, and the person is responsible for what they sign. (The terms are written separately; this records what they must say.)

## Alternatives considered

- **Static files served from the repository, with no table.** Simplest today, but the online editing that's planned would need a table anyway, and moving to one later means migrating what people have already downloaded and copied.
- **Keep the Python generator and commit the Word files.** It works today, but the server can't run it, so a template edited online couldn't get a Word file; the binary files would sit in Git; and the text and the files could drift apart unnoticed.
- **No Word download, only preview and copy.** Least work, but people then lay the document out themselves.
- **A checkbox before each download.** Stronger evidence of acceptance, but it's friction on every download, and the services people know don't do it.

## Consequences

- A new dependency, `docx`, used only on the server.
- `npm run db:migrate` now also writes to Storage, so it needs Storage configured wherever it runs.
- Changing a template's text is a content-file change and a deploy; the next `db:migrate` publishes it. Changing the generator's layout republishes every template.
- A disclaimer limits, but doesn't remove, responsibility: some of it may not hold in every jurisdiction. The disclaimer text, and the templates, should get a lawyer's review before launch.
- The table, the versions, and the published flag are built now for an editor that doesn't exist yet. That's deliberate: they're what the editor will write.
