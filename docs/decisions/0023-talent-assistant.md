# 0023 — The assistant: personal conversations over a fixed, read-only snapshot

**Status:** Accepted (2026-10-22).

## Context

The Assistant screen has been a placeholder since the start ("Later" in `docs/architecture.md`): a person asks questions about their own business — what's on tomorrow, how much is still unpaid, what's agreed on a project — and gets an answer in their language.

A prototype exists on `user/timothy0324/workspace-foundation`. Its conversation flow works well (the question shows at once, a failed send keeps the draft and can be retried, the panel stays open across pages), and it answers the most common questions in code without calling a model. But it was built as a local experiment: conversations and a spending ledger in files on disk, a direct call to one OpenAI model outside `lib/ai/model.ts`, an in-memory rate limit, the whole workspace loaded per question, and the original email text sent to the model. It can't run on more than one machine or in production.

Porting it raises questions the prototype didn't have to answer:

- **Whose is a conversation?** A manager works on an artist's data; the artist has their own account. Each can ask the assistant about the same projects.
- **What happens when access ends?** A manager's membership can be revoked while their old conversations quote the artist's amounts and dates.
- **Who pays for the questions?** Plans are per person (individual, and manager with up to three artists), and inbox analysis already has a per-talent daily limit.
- **What does the model see?** Enough to answer, without making the assistant a new path for prompt injection (decision 0007) or a way to read beyond the person's access.

## Decision

### Conversations belong to the person who had them

- **Only the author reads a conversation.** No other member of the talent — owner, manager, or agency admin — and no support access. Debugging uses `ai_call`, which never holds content.
- **A conversation has a scope.** In this version, one talent: the one the person is working on. The schema also has room for a portfolio scope ("all my artists", for a manager) — `scope` and a nullable `talent_id` — so adding it later needs no migration. The portfolio scope ships with a manager's multi-talent view, which doesn't exist yet.
- **Queries are scoped by both** `person_id` and the current `talent_id`, and the person's membership on that talent must be active to continue a conversation.
- **Context is rebuilt every turn** from current data and current access, never from a saved snapshot.

### When access ends

- **Old conversations stay fully readable** by their author. They were seen with access at the time, like an email the person received; revoking access stops new reads, it doesn't take back old ones.
- **A conversation on a talent the person no longer has access to is read-only**: the composer is off, with a line saying why. Restoring access makes it continuable again.
- **No partial hiding.** Replies are free text that mixes facts, and later turns repeat earlier ones; hiding some messages would leak anyway and make the conversation hard to read.
- **Deleting a talent deletes the conversations scoped to it**, every member's. Deleting a person deletes theirs.

### Usage is counted per person, limited by plan

- **A monthly allowance per person**, across every talent they work on, separate from inbox analysis (which stays per talent, since mail belongs to the talent). An artist's questions never use a manager's allowance, or the reverse. It's the number a person sees ("120 questions left this month") and what plans will differ by; it resets on the 1st where the talent is, and will follow the billing period once there is one.
- **A daily cap on top**, so a burst (a script, a loop) can't use up the month in a day.
- **The limits come from the person's plan.** Until billing exists, environment settings (`AI_MONTHLY_ASSISTANT`, default 600; `AI_DAILY_ASSISTANT`, default 100), with everyone on the same limits.
- **Calls are counted, not tokens or money**, from `ai_call` (`task = 'assistant'`), like analysis. Each call's cost is bounded instead: a cap on the snapshot's size, on conversation history sent, and on the answer's length, so calls × the per-call maximum bounds a person's monthly cost. A money budget would need the same caps to mean anything, and people can't read their allowance in dollars.
- **Not counted:** questions answered in code (no model call) and failures before anything was sent (`neverSent` in `lib/ai/usage.ts`).
- **One request at a time per person**, held with a Postgres advisory lock so it works across machines.
- **An app-wide pause and a total spending cap** (decision 0008, before real users) cover the assistant: when paused, questions answered in code still work and the rest say AI is paused.

### What the model sees: a fixed snapshot, built in code

- **Code builds one bounded snapshot per turn** from the scope; the model has no tools and no way to ask for more. A question the snapshot can't answer gets "that isn't in your data here".
- **Workspace scope:** today's date and time zone; money still to come in and still to pay, with what's overdue, **per currency, never summed across currencies**, counted as Today's money widget counts it (signed work only, decision 0018); the next 14 days of events; active projects (title, stage, counterparty, next step and its date), capped with a count of what was left out.
- **Project scope:** the project's confirmed details (deliverables, rights, travel, open questions), its payments and events, the names and roles of its people and companies, contract status, and its notes.
- **Never sent:** original message text (a project's offer text, timeline summaries), contact email addresses and phone numbers, bank accounts and payment links, anything from another talent.
- **Queries fetch only this** (decision 0011), not the whole workspace.
- **Common questions are answered in code.** The quick prompts (Today, Tomorrow, Receivables, Payables) send an intent, not text to be parsed back, and the answer is computed from the same data without a model call.

### Untrusted text: the layers of decision 0007

- **Data and instructions stay apart.** Fixed instructions; the snapshot inside a `<workspace_data>` block marked as data; the person's question as its own message.
- **Every string in the snapshot is cleaned** with `stripInvisible`; text fields are also checked with `findInstructions`, and a hit is recorded in `ai_call.flags` by kind and field (`instructions_to_ai:project.notes`), never the text, for follow-up, not shown as a warning (the text is the person's own or confirmed by them, so a warning would mostly be noise).
- **Answers are shown as plain text.** No HTML, no images, no links made clickable. If formatting is added later, only emphasis and lists: an image or link in an answer can carry data out of the page.
- **History comes from the database**, never from the browser, so earlier turns can't be forged.
- **Drafts stay drafts.** The assistant can suggest wording; it can't send, save, or change anything.
- **The assistant eval includes attacks** hidden in notes, counterparty names, and confirmed details, and checks that answers stay correct and contain no external links.

### Through the one seam

- The call goes through `lib/ai/model.ts`, which gains a free-text call next to `generateObject` and an `assistant` role (the small model by default: Haiku, or Luna on OpenAI; the assistant eval, `npm run eval:assistant`, decides whether it should change). It gets the primary and backup, recorded responses, and `ai_call` logging like every other call; development uses the paid providers (decision 0022).

## Alternatives considered

- **Conversations shared by everyone on the talent.** Simpler to scope, but a person's questions are their own working notes, and a manager's chat would be visible to the artist and the reverse.
- **One conversation list per talent with no scope column.** Enough for now, but a manager's most common question is across artists ("what's unpaid across everyone"), and adding the scope later would mean a migration of live data.
- **Hide or delete old conversations when access ends.** Hiding message by message leaks and confuses (above); deleting can't be undone after a mistaken revoke. Hiding whole conversations stays possible as a retention rule later if it's needed.
- **Count usage per talent.** A manager's questions would use up the artist's allowance, and a portfolio question has no single talent to count against.
- **Count per person per talent.** A manager with three artists would get three times the allowance, and the cost ceiling would scale with artists.
- **Pick the data by question type** (the prototype's approach, by matching phrases). Saves tokens, but a wrong guess drops the data the answer needed; a full snapshot of one talent is small enough.
- **Let the model fetch data with read-only tools.** The most flexible, and common in assistants; it contradicts decision 0007's "the model never gets tools", and an injected instruction could steer what it reads. Kept for later (below).
- **Send the original email text.** It would answer more questions about a deal, but it's the main carrier of injection, and replying to a message is the drafting feature, with its own rules in decision 0007.

## Consequences

- **Open: who pays for an artist's account under a manager** — their own individual plan, the manager's plan, or either. The limit lookup takes a person and returns their limit, so any answer fits without changing where usage is counted.
- **Later: read-only tools** for questions the snapshot can't answer. Start when real questions show the need; it needs its own decision record (tools are a change to decision 0007), and goes in `docs/tech-debt.md` when the assistant ships.
- **Later: the portfolio scope**, with the manager's multi-talent view.
- An ex-manager keeps what the assistant told them while they had access. A talent who wants that gone deletes their account; a retention rule can come later.
- Answers are only as complete as the snapshot: a question about something left out (an old archived project, the wording of an email) gets "not in your data here" rather than a guess.
- **Porting from the prototype:** keep the conversation flow, the floating panel, the scope rules of its context builder and their tests, the in-code answers, and its eval questions (as made-up fixtures). Rebuild storage, the model call, limits, and the snapshot on the seams above. Leave out its cost and pricing pages, per-message token costs, the sample-data switch (samples belong to the preview mode), and its unrelated changes to sign-in and access.

## Implementation notes (2026-10-22)

- **Slice 1** (quick prompts answered in code): `POST /api/assistant/messages` with `{ intent }`, `lib/assistant/answers.ts`, the corner panel and the Assistant page.
- **Slice 2** (questions in the person's own words, one at a time): the same endpoint with `{ text, projectId? }`. `lib/assistant/snapshot.ts` builds and cleans the snapshot; `lib/assistant/data.ts` fetches its rows; `lib/assistant/prompt.ts` holds the instructions, fingerprinted as `ASSISTANT_PROMPT_VERSION`; `generateText` in `lib/ai/model.ts` asks for a single `answer` string through the structured path, so the backup, recordings, and logging are the same as every call. One question per person at a time is a transaction-scoped advisory lock, as calendar sync uses. Received and paid money aren't in the overview yet; the snapshot says so (`notIncluded`).
- **First eval** (20 made-up cases, prompt 1544eee4d6b3, `claude-haiku-5-5`): 20/20 cases, 88/88 checks, about $0.01 a run, about 1,850 input tokens a question. It covers currency handling, scheduling, saying what isn't in the data, an injected instruction in a project's notes, a prompt-leak request, a link-exfiltration request, a request to act, naming no data fields, and the answer's language. Two lessons from getting there: the screens an answer points to are named from the message catalogs, so a Chinese answer names the Finance screen as the Chinese interface does, not in English; and the snapshot states tax in words, since a model shown `taxIncluded: false` quoted the flag back.
