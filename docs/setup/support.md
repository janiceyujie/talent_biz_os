# Support page

`/support` is where staff look up an account when someone asks for help: its workspaces, its Gmail and Google Calendar connections, and a timeline of what happened lately, as ids, statuses, codes, and times, never mail ([decision 0026](../decisions/0026-logging-and-error-reporting.md)). Anyone who isn't staff gets a 404. Opening an account records it in that account's history as `support.viewed`, once per staff member per 30 minutes, so reloading isn't another look. The account's card shows support's earlier looks: the latest, by whom, and how many in 30 days.

## Granting and revoking

Staff are granted only by SQL, never from the app. In Supabase's SQL editor for the environment (staging and production each have their own):

```sql
-- Grant: the person must have signed up first.
insert into staff (person_id, role, note)
select id, 'admin', 'builder; answers beta support and runs the beta list'  -- why, for the record
from person where email = 'you@example.com';

-- Who has access now.
select p.email, s.role, s.granted_at, s.note from staff s join person p on p.id = s.person_id where s.revoked_at is null;

-- Revoke: takes effect on their next click. The row stays, so who had access when stays on record.
update staff set revoked_at = now() where person_id = (select id from person where email = 'someone@example.com') and revoked_at is null;
```

Two roles. `support` reads: accounts, error codes, and the beta list. `admin` also changes what's hard to take back: adding people to the beta list, sending their invitations, and withdrawing places (decision 0028). Give `admin` only to whoever runs the beta; anyone answering questions needs `support`. To change a role: `update staff set role = 'support' where person_id = … and revoked_at is null;`. When someone other than the builder becomes staff, add two-step sign-in first (decision 0026, "Moving the Support page later").

## Answering a question

- **"My email didn't come in."** Find the account, then the timeline's email decisions around the time they mean: skipped by a rule (which one), not work by the model (its score), waiting for the model, or failed to bring in (its code). The Gmail card shows whether the mailbox is connected, its last sync, and whether earlier mail is still coming in.
- **"I got an error, code 4204811731."** Their error screen has a Copy code button for sending it. Paste the code, or the whole line from their screen, into "Look up an error code". A server error's code is its digest: in Render's logs it's on a `request.failed` line, with the `request_id` that finds the rest of that request, and the `person_id` that says whose it was. The same bug gives the same code each time, so match on the person and the time. A code of 8 letters and digits came from the browser and is in Sentry only.
- **Anything else.** "Find this person" links to Render's logs and Sentry with their id to paste or search.

Render keeps logs for its plan's retention (7 days on Hobby); older errors are in Sentry only.

## Reading the timeline

Five kinds of entry, newest first, up to 50 of each. Every id shows its first 8 characters, named for what it identifies ("Message id", "Event id"); hovering shows the whole id. They're our database's ids, not Google's: an event id is a row in `calendar_event`, not a Google Calendar event. Values show in words; hovering one shows its stored code, and failures show the code beside the words, since logs and Sentry are searched by it. The words for every value are in `messages/support/*.json` under `values`; a value with no words yet shows as its code.

| Kind | From | What it says |
|---|---|---|
| Change | `audit_log` | What someone did ("Created a project"), on what (by its id, named: "Project id"), and who, when it wasn't the account itself. Never `details`. Support's own looks aren't here: they're summed up on the account's card. |
| AI call | `ai_call` | The task ("Reading a message"), whether it succeeded, why not, the model, how long it took, and any instructions-to-the-AI it spotted in what was sent (decision 0023). |
| Email decision | `mail_decision` | What became of one email from their mailbox: the outcome, who or what decided, what it looks like, the model's score, and a failure to bring it in. |
| Message | `message` | A message brought in: received or sent, message or payment notice, how it came (Gmail, pasted, …), its status, and why its analysis failed. |
| Job gave up | Graphile Worker | A background job that failed every attempt: which job, how many tries, and the ids it was for. Its error text isn't shown; Render's logs have the job's `job.failed` line, by `job_id`. |

**Email decisions**, the usual answer to "my email didn't come in":

| Outcome | Means |
|---|---|
| Work: brought in | It's in the app; the Message entry has its id. |
| Skipped | Left in Gmail, never brought in. Who decided says why: a rule (Gmail's spam or trash, a draft, their own sent mail, bulk mail, Gmail's Promotions or Updates tab, or their own "never this sender"), the model's score below its threshold, deleted in Gmail before the model saw it, or too large to bring in. |
| Waiting for the model | The rules couldn't decide and the model hasn't yet. If it stays, look for a "Decide if an email is work" job that gave up, or AI paused. |
| Not sure it's work | The model's score fell between its two thresholds: it was brought in and waits in Intake under "Not sure this is work" for them to choose. |
| Not work | Brought in, then the analysis or they themselves said it isn't work; its body and files were deleted (decision 0013). |

A score is the model's, from 0 (not work) to 1 (work). "Couldn't bring in" with `gmail_429` or another code means Gmail refused it after every retry; Sync now tries again.

**Where each list is defined**, if a value isn't in the words: rules in `lib/mail/relevance/rules.ts`; outcomes and deciders as `mailDecisionOutcomes` and `mailDecisionDeciders` in `lib/db/schema.ts`; what an email looks like as `mailKinds` in `lib/mail/relevance/prompt.ts`; AI failure codes in `lib/ai/errors.ts`; job names in `lib/queue/jobs.ts`; changes as each `action:` written to `audit_log`.

## Setting it up

- On each web service in Render: `RENDER_WORKER_SERVICE_ID`, the id (`srv-…`) of the same environment's worker, from the worker's page in the dashboard. The web service's own id comes from Render. `SENTRY_ORG` is already set for Sentry ([sentry.md](sentry.md)).
- Grant yourself staff in each environment (above).

## Checking it works

After the first deploy with these settings, on staging:

- Someone who isn't staff opening `/support` gets a 404.
- The web and worker log links open each service's logs. `lib/support/links.ts` assumes the dashboard's addresses are `/web/<id>/logs` and `/pserv/<id>/logs`; if Render's differ, fix them there.
- Search Render's logs for some text and see whether the address bar then holds it. If it does, the links can carry the code too: change `renderLogs` in `lib/support/links.ts`.
- The Sentry link opens Issues with the search already filled in (`digest:…` or `error_code:…`). If the search box is empty, Sentry's address format differs: fix `sentryIssues` there.
