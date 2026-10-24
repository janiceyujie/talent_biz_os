# Tech debt and known gaps

Shortcuts taken on purpose, and gaps we know about: what happens today, why it's acceptable for now, and what would fix it. Items needed before launch are in [setup/launch-checklist.md](setup/launch-checklist.md) instead; this list is for the rest. Remove an item in the change that fixes it.

## Calendar and Google

### Edits made in Google to pushed events are overwritten

**Today.** Events pushed to the 「Taloox」 calendar in Google are one-way. If someone moves, edits, or deletes one in Google, nothing comes back here, and the next push (any save here, or 立即同步) restores our version. The calendar's description in Google says to edit in Taloox.

**Why for now.** Decision 0009, phase 1: this app is the source of truth for project events, and two-way editing (conflicts, deletions that may be mistakes) is most of the complexity for a use we haven't seen.

**Fix.** Phase 3 of [decision 0009](decisions/0009-google-calendar-sync.md): read changes to pushed events back (by the `etag` already stored per event in `calendar_event_sync`), apply time and place changes here, and ask before applying a deletion. Start only if people actually edit project events in Google.

### Google events can't be attached to a project

**Today.** The person's own Google events are shown read-only; there's no way to make one part of a project.

**Fix.** "Adopting" as decision 0009 describes: create a project event here from the Google one and push it, leaving the original alone.

## Interface

### A toast can't be closed early while a dialog is open

**Today.** Toasts sit in the browser's top layer so they show above an open dialog, but a modal dialog makes everything outside it unclickable, the toast's × included. It still closes by itself after a few seconds.

**Fix.** If it matters: show the message inside the dialog when one is open.

## Opportunities

### The Opportunities page needs a review: what it shows, and how to say more for less

**Today.** A first review and its free changes are done (steps 1 and 2 below; the mockups are in the PR that made them):
- the profile shown above the list;
- tabs for You can apply, Doesn't fit, and Following;
- sections by closing date, with days left;
- one card per program, its rounds and forms inside;
- titles without the source's filing words;
- the rules a card matched, shown on it;
- following in one press.

What's left:

- **Fits is nearly empty.** Sources state few rules, so screening rarely reaches Fits; it's folded into You can apply until it means something.
- **The facts a person decides on are only partly there.** Tracked pages now give the amount, what it covers, and who can apply, quoted from the announcement, and Grants.gov gives its award range. The Ministry of Culture's calls have none (its open data has only names and dates), and what to submit, or eligibility written only in a PDF, isn't read.
- **The official link is uneven.** A tracked page's call opens its announcement, and a Grants.gov call its own page. A Ministry of Culture call opens the grants site's home page, since the open data has no link per call; finding the call there is left to the person.
- **Nobody has used the page with a talent yet.** The review was a designer's, against the screens, not a session with someone looking for a call.

**Why for now.** The first goal was coverage and correct dates: every source checked against its page, nothing invented. What to show on top of that, and what it's worth spending, needs a look at the page in use.

**Fix.** A review, then changes in order of cost:

1. **UI/UX review** of the page and the dialog, with a talent if possible:
   - what they look for first;
   - what makes them open or follow a call;
   - what the Check chip should say instead;
   - whether calls should be grouped by program, deadline, or fit.
2. **Free, in code:**
   - one card per program, its forms or tracks inside it;
   - cleaner titles;
   - discipline and applicant type shown on the card;
   - standing programs apart from dated calls;
   - a better Ministry of Culture link, if the grants site has a stable address per program (not checked).
3. **Almost free, in the model call already made:** amount, purpose, and who can apply, as short quoted fields in the tracked pages' extraction. Done: re-reading every announcement once cost about $0.5.
4. **Paid, once per document:** read a program's PDF guidelines when its hash changes, for eligibility and what to submit. Most of the National Culture and Arts Foundation's rules are there. The cost is one larger call per new PDF, not per day.
5. **Measure before spending more:** which calls are opened and followed, and from which source, so new sources and fields go where people use them.

1 to 3 are done, apart from a talent session and the Ministry of Culture link. Weigh 4 against the cost the measurement in 5 shows.

### Disciplines are seven broad buckets, matched by keywords

**Today.** A call's disciplines and the profile's come from one fixed list of seven, in `lib/opportunities/types.ts`: music, performing arts, visual arts, film, writing, content, and other. Each source maps to it differently:
- **Ministry of Culture:** by the funding unit only. Pop music is music; film, radio, and TV are film; every other unit is unknown.
- **Tracked pages:** the model picks from the list, and a pick is kept only when its passage contains one of that discipline's keywords (`disciplineWords` in `lib/opportunities/sources/pages.ts`).
- **Grants.gov:** none, so it's always unknown.

So common fields have no bucket of their own:
- design;
- comics and picture books;
- crafts (folded into visual arts);
- traditional opera (folded into performing arts);
- cultural heritage.

A comics prize comes out unknown rather than writing. The keyword check also keeps a pick when its passage only lists the discipline among many.

**Why for now.** Seven buckets were enough to tell a music profile from a visual arts call, which was the first use. Finer ones change the profile people fill in and every source's mapping at once.

**Fix.** Revisit with the page review above:
- **Which buckets talents use to describe themselves.** Likely splits: design, comics and picture books, crafts, traditional arts.
- **How each source maps to them:**
  - the Ministry of Culture's programs by name, not only by unit;
  - the tracked pages' keywords per bucket;
  - a migration of saved profiles when a bucket splits.
- **Whether a card shows the bucket or the call's own wording.** For example 傳統音樂類 rather than "music".

## Intake

### HEIC photos can't be sent in

**Today.** Upload refuses HEIC/HEIF files with a hint to save them as JPEG first, and an email's HEIC attachments are listed by name rather than fetched (`lib/uploads.ts`). The iPhone camera saves photos as HEIC by default, so a photo of a paper contract taken on an iPhone and sent from a Mac is the likely case. iPhone screenshots are PNG and aren't affected.

**Why for now.** Anthropic and OpenAI list JPEG, PNG, GIF, and WebP as image inputs, not HEIC (not yet tried against either API); Gemini, which read it, was removed in decision 0022. Converting needs a new dependency: the prebuilt `sharp` usually can't decode HEVC-encoded HEIC, and a browser-side converter such as `heic2any` is large.

**Fix.** Convert to JPEG before the model sees it: in the browser on upload, or on the server for uploads and email attachments alike. Check first whether iPhone Safari already converts when the file picker doesn't list HEIC; if it does, only files sent from a Mac need it. Start if people ask for it or refused HEIC uploads show up.

## Assistant

### The assistant can't look anything up

**Today.** A question in the person's own words is answered from one fixed snapshot: the workspace overview or one project (decision 0023). A question about something outside it (money received last quarter, an archived project, the wording of an email) gets "that isn't in your data here".

**Why for now.** A model with tools that fetch data is the more flexible design, but decision 0007 says the model never gets tools, and an injected instruction could steer what it reads. A snapshot is bounded, testable, and cheap.

**Fix.** Read-only tools the model can call (projects, payments, a date range), scoped to the person's access, each call logged. It needs its own decision record amending 0007. Start when the questions people actually ask show the snapshot falling short.

### Someone with no workspace left can't reach their old conversations

**Today.** A person who loses access to a talent can read their conversations about it, read-only, from the Assistant page of another talent they work on (decision 0023). A person with no talent left is sent to onboarding and has no way to reach them, though they're still kept.

**Why for now.** Today a person works on one talent, so losing it means losing the app; a page outside any workspace would mean changing where sign-in sends people, for a case that barely happens yet.

**Fix.** A way to export one's own conversations from the account, outside any workspace, which data-protection rules also expect. Start with the manager's multi-talent view, or when someone asks.

