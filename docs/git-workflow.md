# Git workflow

How we branch, commit, and merge on this repo. It applies to people and to coding agents alike; an agent works under the handle of the person who started it and follows every rule here.

The short version:

1. Never commit to `main`. Branch as `user/<handle>/<topic>`.
2. Commit messages are `<type>: <verb> <what>`, lowercase, imperative, no period.
3. Keep `main` green: every PR passes CI and is squash-merged with a title in the same format.

## Branches

`main` is the only long-lived branch. It is protected: no direct pushes, no force pushes, merges only through a pull request with passing checks. Everything on `main` should be releasable.

### Naming

```
user/<handle>/<topic>
```

- **`<handle>`** is your personal handle, the same everywhere (e.g. `janlin`). Lowercase letters and digits only.
- **`<topic>`** is what the branch does, in kebab-case, two to five words: `ingest-email`, `calendar-month-view`, `fix-payment-rounding`.

```
user/janlin/ingest-email          ✅
user/janlin/project-ui-improvement ✅
janlin/ingest-email               ❌ missing user/
user/janlin/IngestEmail           ❌ not kebab-case
user/janlin/wip                   ❌ says nothing
user/janlin/stuff-and-fixes       ❌ two topics, split them
```

The `user/` prefix keeps personal branches grouped and leaves room for shared prefixes later (`release/…`, `hotfix/…`) without collisions.

### Lifetime

- One branch, one topic. If you find an unrelated bug along the way, fix it on its own branch.
- Short-lived: aim to merge within a few days. A branch older than a week is a sign it should be split.
- Delete the branch after it merges (GitHub can do this automatically).
- Two people working on one feature each use their own branch and merge into `main` in turn, or one branches off the other's and rebases when the first lands.

## Commits

### Message format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[(<scope>)][!]: <description>

[body]

[trailers]
```

**Subject line rules**

- Starts with a **type** from the table below, then a colon and one space.
- The description starts with a **lowercase verb in the imperative**: `add`, `fix`, `remove`, `rename`, `move`, `show`, `allow`. Write it as the end of "If applied, this commit will …".
- No period at the end. At most 72 characters in total.
- English. Name a screen or label by its English UI name from `messages/en.json`, as in code comments (`AGENTS.md`). In the body or a PR description, you may add the Chinese label in parentheses after the English name when the wording itself is the point or reviewers know the screen by it: "rename the Today title (今日總覽) to …". Code comments stay English only.
- Say what changes for the product or the code, not what you did ("fix overdue payments missing from Today", not "fixed bug").

**Types**

| Type       | Use for                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `feat`     | A new capability a user or another part of the code can use             |
| `fix`      | A bug fix                                                               |
| `refactor` | A code change that neither adds a feature nor fixes a bug               |
| `perf`     | A change that makes something faster or lighter                         |
| `test`     | Adding or correcting tests only                                         |
| `docs`     | Documentation only (`docs/`, `README`, decision records, `AGENTS.md`)   |
| `style`    | Formatting, whitespace, lint fixes — no behaviour change               |
| `build`    | Build setup or dependencies (`package.json`, Next config)               |
| `ci`       | CI configuration (`.github/workflows/`)                                 |
| `chore`    | Upkeep that fits nothing above (tooling config, renames of files, cleanup) |
| `revert`   | Reverting an earlier commit                                             |

If a change is both a `feat` and a `fix`, it is probably two commits.

**Scope** (optional) narrows where the change is, in one lowercase word: `calendar`, `intake`, `inbox`, `overview`, `projects`, `settings`, `payments`, `db`, `auth`, `ai`, `i18n`. Use one when it helps someone scanning the log; leave it out when the change is broad.

**Breaking changes** get a `!` after the type or scope and a `BREAKING CHANGE:` trailer explaining what to do: a renamed environment variable, a changed API route, anything that needs action from someone pulling the change.

**Examples**

```
feat(calendar): show Google events in the month view
fix(payments): keep failed pushes pending instead of dropping them
refactor(overview): move widget data into pure functions
docs: record the decision on per-person preferences
build: add drizzle-kit for migrations
chore: remove the unused prototype styles
feat(db)!: rename message_type to intent
```

```
Fixed the calendar bug.            ❌ no type, past tense, period
feat: Added Google events          ❌ capitalised, past tense
feat: calendar stuff               ❌ no verb, says nothing
fix: various fixes                 ❌ split it, say what each one fixes
```

### Body

Add a body whenever the subject can't carry the reason. Leave a blank line after the subject and wrap at 72 characters.

- Explain **why**, and anything a reviewer couldn't tell from the diff: the alternative you rejected, the edge case you found, the follow-up you left for later.
- Don't narrate the diff line by line.
- If the commit touches a sensitive area (`AGENTS.md`, "Sensitive areas"), say so in its own line: `Database: adds table preference (drizzle/0020_preference.sql).`
- Reference issues as `Refs #123` or `Fixes #123` on their own line.

### Trailers

- Commits written with an agent end with its attribution trailer, e.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pair work: `Co-Authored-By: Name <email>`.

### What a commit should contain

- **One logical change.** It can be reverted on its own without breaking something unrelated.
- **Passes the checks.** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run i18n:check`. A broken commit in the middle of a branch makes `git bisect` useless.
- **Complete.** A schema change and its generated migration go in the same commit. A new UI string goes in with both `messages/en.json` and `messages/zh-TW.json`.
- **Nothing that shouldn't be in Git.** No `.env*` (except `.env.example`), keys, tokens, real customer messages, build output, or local editor settings. If one slips into a pushed commit, rotate the secret first; removing it from history doesn't make it secret again.
- **Staged on purpose.** Stage by path (`git add lib/overview/ components/overview/`) or by hunk (`git add -p`), and read `git diff --staged` before committing. Avoid `git add -A` / `git add .` in a tree with unrelated edits.

## Keeping a branch up to date

Rebase your branch on `main` rather than merging `main` into it, so history stays linear:

```sh
git fetch origin
git rebase origin/main
# resolve conflicts, re-run the checks
git push --force-with-lease
```

- Force-push **only your own branch**, and always with `--force-with-lease`, which refuses if someone else pushed in the meantime. Never force-push `main`.
- If someone else has built on your branch, tell them before you rewrite it.
- Migration conflicts: never edit an existing migration to resolve one. Drop your generated migration, rebase, and run `npm run db:generate` again so it comes after the ones now on `main`.

Tidying your own unpushed commits (`git commit --amend`, `git rebase` with `fixup!` commits and `--autosquash`) is encouraged. Rewriting commits others already have is not.

## Pull requests

### Opening

- Open a PR as soon as the direction is clear; use a **draft** while it's in progress.
- **Title** in commit-message format (`feat(calendar): show Google events in the month view`). It becomes the commit on `main`.

### Description

```markdown
**Sensitive areas:** Database (adds table `preference`, migration 0020)
<!-- or "None". List any of: Database, Auth and access, AI and untrusted messages, Secrets, Dependencies -->

## What and why
One or two paragraphs. Link the issue or decision record.

## How it was tested
Automated tests added or changed; what you checked by hand, and how.

## Screenshots (optional)
Add one when it helps a reviewer see a UI change faster; leave the section out otherwise.

## Follow-ups
Anything deliberately left out.
```

### Review and merge

- **CI must pass**: lint, type check, tests, translations, build.
- **Code owners** (`.github/CODEOWNERS`) review changes to the database, auth, AI, architecture docs, agent rules, CI, and dependencies.
- Reply to every comment, by changing the code or explaining why not. The reviewer resolves the thread.
- Push review fixes as new commits so the reviewer can see what changed; they're squashed at merge.
- **Rebase on the latest `main` before merging** (see "Keeping a branch up to date") and let CI run again, so what merges is what was tested. Branch protection on `main` should have "Require branches to be up to date before merging" turned on to enforce this.
- Merge with **squash and merge**. Edit the squashed message so it reads as one good commit: the PR title as subject, a short body with the why, the sensitive-areas line, and the trailers. Delete the default list of "fix typo" lines.
- The author merges once approved, then deletes the branch.

## Never

- Commit or push directly to `main`, or force-push it.
- Skip hooks or checks (`--no-verify`) to get a commit through.
- Edit or delete a migration that has been merged (`AGENTS.md`).
- Commit secrets, `.env*` files, or real customer data.
- Rewrite history someone else has pulled.
- Mix unrelated changes in one commit or PR.

## Rules for coding agents

Agents follow everything above, plus:

- **Don't commit, push, or open a PR unless asked.** When asked, do exactly that and stop.
- **Check the branch first.** If you're on `main`, create `user/<handle>/<topic>` before committing, using the handle of the person you're working for.
- **Commit only your own changes.** The working tree may hold the person's unrelated edits. Stage by explicit path, check `git status` and `git diff --staged`, and leave anything you didn't write unstaged.
- **Run the checks before committing** and report failures as they are; don't commit around them.
- **No destructive commands without asking**: `reset --hard`, `clean -f`, `checkout -- <file>`, `branch -D`, `push --force`, `rebase` of a pushed branch, `stash drop`. Look at what would be lost first.
- **No interactive git** (`rebase -i`, `add -i`); it can't be driven from an agent. Use `--fixup` with `--autosquash`, or ask the person.
- **Conflicts**: the goal is to keep what both sides meant to do, not to pick a side.
  1. Before touching a conflict, find out what each side was for: read its commits (`git log -p <side> -- <file>`), the PR or issue behind it, and the code around the conflict.
  2. Merge the intent, not the lines. If one side added a feature and the other refactored the same code, apply the feature to the refactored code. If both changed the same behaviour, the result should do both.
  3. Never resolve by taking one side wholesale (`--ours`, `--theirs`, deleting the other side's block) unless you've confirmed the other side's change is already in, or no longer needed.
  4. After resolving, re-run the checks, and look for things a clean merge can still break: a renamed function still called by its old name, a new string missing from one locale file, a test that covers only one side.
  5. If you can't tell what a side was for, or the two intents contradict each other, stop and ask. Describe both sides and how you'd merge them; don't guess.
  6. Never resolve a migration conflict by editing the migration (see "Keeping a branch up to date").
- **Write the message for a human reader**, with the sensitive-areas line and the attribution trailer.
- The `next dev` block at the top of `AGENTS.md` is regenerated by the dev server. If it shows up as a change, commit it with your work rather than reverting it.

## Quick recovery

| I want to…                                   | Run                                                   |
| -------------------------------------------- | ----------------------------------------------------- |
| Fix the message of my last, unpushed commit  | `git commit --amend`                                  |
| Add a forgotten file to my last, unpushed commit | `git add <file> && git commit --amend --no-edit`  |
| Undo my last commit but keep the changes     | `git reset --soft HEAD~1`                             |
| Undo a commit that's already pushed or merged | `git revert <sha>`                                   |
| Move commits I made on `main` to a branch    | `git switch -c user/<handle>/<topic>` then `git switch main && git reset --hard origin/main` (only if nothing else is on local `main`) |
| Find a commit I lost after a rebase or reset | `git reflog`                                          |
| Stop a rebase that went wrong                | `git rebase --abort`                                  |

## Adopting this

Commits on `main` before this guide used a plain-sentence style; leave them as they are. From now on, new commits and PR titles follow the format above. To enforce it, we could later add a commit-message check (commitlint) in CI and a PR template in `.github/`; both are a separate change, and the first needs a new dependency.
