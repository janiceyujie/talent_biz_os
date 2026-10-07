<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Talent Biz OS

A business operating layer for independent talent — musicians, influencers, models, and the people who manage them. Ingests the messages a talent's business runs on (gig offers, brand deals, contracts, payments), tracks each ongoing deal as one thing across multiple messages and contract versions, and surfaces what needs a decision.

This file is the shared instructions for every coding agent on this repo (Claude Code reads it through `CLAUDE.md`, Codex reads it directly). Put shared rules here, not in a tool-specific file.

`docs/architecture.md` describes the pipeline, the entity model and schema, and the stack, as written during development so far. Use it as a reference, not a spec: the code may have moved on. The why behind load-bearing choices is in `docs/decisions/`, one numbered record each.

## Sensitive areas

Changes here can lose data, leak data, or lock people out, so make them only when the task needs them. When a PR touches any of these, list them at the top of its description so the reviewer knows where to look closely.

- **Database** (`lib/db/schema.ts`, `drizzle/`): change the schema in `schema.ts`, then generate a new migration with `npm run db:generate`. Never edit or delete an existing migration file (the one exception is the one-time squash into a baseline before the first production deploy, in `docs/setup/launch-checklist.md`, done only when asked). Never drop or rename a column with data in it without asking.
- **Auth and access** (`lib/auth/`, `proxy.ts`): who can sign in and who can see what. Every query for a talent's data must be scoped to that account.
- **AI and untrusted messages** (`lib/ai/`): message content is untrusted input — follow the rules in `docs/decisions/0007-untrusted-message-content.md`. The model never gets tools or acts on its own; a person confirms everything it extracts.
- **Secrets**: never commit `.env*` files (only `.env.example`), API keys, or real customer messages.

## Conventions

- **Every user-facing string** goes in `messages/en.json` and `messages/zh-TW.json` with the same keys; `npm run i18n:check` enforces it.
- **Follow the code around you** — its naming, structure, and comment style — over introducing new patterns or libraries. Ask before adding a dependency.
- **Comments are in English only.** Refer to a screen or label by its English UI name (from `messages/en.json`), and describe Chinese input in words rather than quoting it. Chinese belongs only in `messages/zh-TW.json` and in code that has to match Chinese text (regexes, test fixtures, placeholder names).
- **Git**: before any branch, commit, rebase, push, or pull request, read and follow `docs/git-workflow.md` — branch naming, commit message format, merging, and the rules for coding agents.

## Related

- **Product strategy**: sibling repo `talent-business-os-internal`.
