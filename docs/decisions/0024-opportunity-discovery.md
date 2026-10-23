# 0024 — Opportunities: public calls found on a schedule, screened against who you are, followed as to-dos

**Status:** Accepted (2026-10-22).

## Context

Talent apply for grants, competitions, and showcases: a Ministry of Culture subsidy, a county culture bureau's call, a US state arts council's fellowship, the Golden Melody Awards, SXSW. Each has a deadline that's easy to miss and terms that are easy to misread. The point of the feature is that the calls are **found for you, on a schedule**, and narrowed to the ones you could apply for; once you follow one, its deadline becomes a to-do like any other.

Timothy's branch (`user/timothy0324/opportunity-discovery`, his local decision "Local grant discovery") built most of this behind a local-only flag: a shared catalogue of public calls, a daily refresh from two sources, a screening profile (applicant type and country), and applications whose tasks are ordinary to-dos. Three things it leaves open:

- **Coverage.** Its two sources are the Ministry of Culture's news page (five items) and Grants.gov, whose arts grants are mostly for organizations. Most calls an individual in Taiwan or the US can apply for are on pages with no feed: the National Culture and Arts Foundation, county culture bureaus, about 56 state and territory arts councils, and the yearly competitions and showcases, which it enters by hand.
- **Screening.** Applicant type and country don't separate most calls: a county's subsidy is for its residents, a state council's for that state's, and the national programs are split by discipline.
- **Dates that change.** When a call's deadline moves after you've followed it, your to-do keeps the old date and nothing tells you.

## Decision

### Sources

- **Structured sources are read directly**, on a schedule, with no AI:
  - Taiwan: the Ministry of Culture's open-data list of open calls (`grants.moc.gov.tw/OpenData/getOpenData_ApplyList.jsp`: year, unit, program, form, start and end date), under the government open-data licence;
  - US: Grants.gov's public search and detail APIs (`search2`, `fetchOpportunity`), arts category.
- **Pages without a feed are tracked**: a list of official pages kept in the repository (`lib/opportunities/tracked.ts`; one entry per page: its URL, region, agency, kind, and which of its links are its announcements). Adding or removing a page is a code change, reviewed like any other. The fetcher reads only URLs on that list, links on a listed page that are its own announcements on its own host, and URLs returned by a structured source: never one a user typed.
- **Most tracked pages are lists of announcements**, so a list is read for its announcement links, and each announcement is read too: a funding body's list gives a title and sometimes a date, while who can apply, the discipline, and the closing time are on the announcement's own page. Only announcements titled as calls are followed (not lists of results), at most ten per page per day, newest first.
- **Each announcement is re-read daily and compared by a hash of its text.** When it hasn't changed (and the prompt hasn't), nothing else happens. When it has, the model reads it and returns the calls on it: title, opening and closing dates, who can apply, nationality, county or state, discipline, and **for each field the exact passage it came from**. A call the announcement no longer gives is removed from the catalogue, unless someone follows it.
- **What the model returns is checked before anyone sees it.** A field is kept only if its passage appears verbatim in the page and the value can be read back out of that passage (a date from the passage parses to the date returned; an applicant type, nationality, county, or discipline is named in it). A call whose title isn't on the page is dropped. A call whose closing date passes the check is published with its source and when it was checked. A field that fails is dropped and counts as unknown. A call with no checked closing date is shown as **Check the official page**, with the link and no date.
- **Page content is untrusted** (decision 0007), though it's public, not mail. Invisible characters are removed first, and an announcement with words aimed at an AI isn't sent to the model at all (it's recorded as failed, for a person to look at). The model has no tools, gets a fixed instruction and the page as data, and returns only the fixed shape above; anything else is discarded. It goes through `lib/ai/model.ts` like every other call (decision 0022), so it waits while AI is paused (decision 0008): an announcement not read is read on the next run.
- **The official page is always one click away**, and the card says the dates come from it as of the time checked.
- **Later, not now:** a review step before publishing (a staff queue), and finding calls on pages that aren't on the list (search, or a partner's feed such as NYFA's).

### Who you are, and what you want to see

- **Screening profile**, per person and per talent (a preference, decision 0010): applicant type (individual, business, nonprofit, other), country (Taiwan, US, other), **county or state**, and **disciplines** (several: music, performing arts, visual arts, film and video, writing, content creation, other).
- **Each call's rules** (from a structured source's official codes, or checked fields from a tracked page) are compared with the profile. The result is one of:
  - **Fits**: every stated rule matches;
  - **Check**: a rule is unknown, the profile is missing a field it needs, or the rules are out of date;
  - **Doesn't fit**: a stated rule excludes you.
- **Doesn't fit is hidden by default**, with a switch to show everything. **Check is always shown**: incomplete data never hides a call. Screening never stops you following one.
- **Filters on the page:** region, kind (grant, competition, showcase, residency), closing within a number of days, and following only.

### Following a call

- **Follow** creates an application for the talent, at **Preparing**, and (when the call has a closing date) a **Submit** to-do on that date, which you can change before saving. A call without a date can be followed without one.
- **Applications move through** Preparing → Submitted → Awarded, Not selected, or Closed. You can add more to-dos to one (proposal, budget, report, and so on), and link an awarded one to a project (decision 0018). Its to-dos are ordinary to-dos: they show on Today and the Calendar, with one date each.
- **When a followed call's dates change at the source**, the talent gets a notification saying what changed ("closing date moved from 3 March to 17 March"), with a button that moves the Submit to-do to the new date. **The to-do is never moved on its own**: it's yours, and you may have changed it. The same notification fires when a call that had no date gets one.
- Following never creates a project, a payment, or income.

### Storage

- **The catalogue is shared**, not per talent: `opportunity_source` (each source's last check and failure) and `opportunity` (public facts, the content hash, the checked fields and their passages, when it was checked and last changed). It holds no customer data, so it's the one place a read isn't scoped to a talent; everything that joins it to a talent's data is.
- **Per talent:** `opportunity_application` (stage, notes, project) and `opportunity_task` (an application's link to a to-do). Every read and write is scoped to the talent.

## Alternatives considered

- **Enter yearly events and pages without feeds by hand**, as Timothy does for SXSW and the Golden Melody Awards. Accurate when it's done, but someone has to remember to do it every year for every event, and a missed update is a missed deadline.
- **Publish what the model extracts without checking it.** The most dangerous mistake is an invented or misread deadline, and checking each field against its passage catches the invented ones cheaply. It can't catch a real date in the wrong field (an announcement date read as the closing date), which is why the official page stays one click away.
- **Review every extracted call before publishing.** The most accurate, but it needs a staff tool and someone on a schedule to work it. The checked fields are kept so a review step can be added in front of publishing later.
- **Screen on more** (age, career stage, past awards, amount). These are hard to extract reliably and would mostly come out as Check, which doesn't narrow anything. Add one when there's a call it actually decides.
- **Move a to-do when its call's date moves.** Quicker, but it overwrites a date the person may have set on purpose, without asking.
- **Build preparation to-dos backwards from the deadline** (proposal three weeks before, budget two). Programs differ too much for one schedule; left for when preparation is designed.

## Consequences

- Coverage is only as good as the tracked list. Its first version names the national bodies, the municipal and county culture bureaus, the state arts councils, and the yearly events in scope; keeping it current is ongoing work, and pages that fail to fetch or change shape show on the source's status.
- A changed page costs one model call; an unchanged one costs a fetch. With a few hundred pages, a handful change on a given day.
- The fetcher is a server reaching out to the internet: only listed hosts over HTTPS, a timeout, a size cap, no redirects to another host, and a cap on records per run.
- A deadline shown is what the source said when it was checked. The card says so, and dates are read in the source's region (Asia/Taipei for Taiwan).
- It's built in parts: the catalogue, structured sources, screening, and following first; tracked pages with extraction next; the date-change notification with them, since that's where dates move most.
