# 0011 — Pages fetch what they show; the layout carries only what every page needs

**Status:** Accepted (2026-10-07)

## Context

The app layout (`app/(app)/layout.tsx`) calls `getAppData()` on every page, and every save calls `refresh()`, which runs it again. It loads the whole workspace — every project with its details and notes, every payment, to-do, event, contact, and contract version, the newest 200 messages — and the browser filters, sorts, and totals it. That was the quickest way to build the MVP, and it makes moving between screens instant.

The cost grows with the account, and every page pays it, including the ones that show none of it. A talent adds tens to a few hundred projects a year. A long-lived account, or a manager with several artists, reaches megabytes per page view and per save, and phones feel it first. Hidden caps added to hold the size down cause silent errors: a project lost its offer text and its timeline once its messages fell outside the newest 200. Sending everything also means anyone who can open the workspace receives every field of it, which gets harder to control once members have limited roles.

Projects show the problem most clearly. Fifteen files read `data.projects`, for three kinds of reason:

- **Showing a project's name next to something:** calendar items, files, a filed message, a contact's projects, pickers, and global search.
- **Totals and lists across projects:** Today's widgets, notifications, finance insights, partners, the planner.
- **Matching an incoming message to a project** (`suggestTargets`, in intake review): it scores every live project by the sender, its title, dates, and identifying fields.

None of them needs every project in the browser. Each one needs either the projects it shows or a result the database can compute.

## Decision

- **The layout carries only small data that every page uses:** the person, the workspace, settings and preferences, what the notification bell needs, and counts. Anything that grows with the account and appears on only some screens is fetched by the page that shows it.
- **A page fetches its data in its server component**, so the data arrives with the page. The browser fetches for itself only to load more as you scroll or when you open an item. A Route Handler serves those requests, because server functions are for mutations and run one at a time.
- **Lists are paged, 50 rows at a time, with keyset cursors** (the last row's sort value and id), so rows added or changed mid-scroll don't repeat or drop. The database does the filtering, sorting, searching, and counting. Scrolling near the end of the list loads the next page.
- **An item's detail loads when it's opened**, not with the list.
- **No silent caps.** A list that stops short says so and offers more; a page never quietly computes from a truncated set.
- **Every query is scoped to the signed-in workspace**, as before. A request for an item from another workspace gets a 404, never a 403, so it doesn't reveal that the item exists.

### First step: projects

- **`GET /api/projects`** returns the list. It takes `view` (a phase, `all` for every active project, or `archived`), `type`, `q` (title or partner), `sort` (`due`, `updated`, `amount`, or `title`), and `cursor`. It returns 50 rows, the next cursor, and the count for each view under the same type and search, so the phase tabs show totals without loading every project, and a tab's number always matches the list it opens.
- **`GET /api/projects/[id]`** returns everything only a project's own screen shows: its details, notes, offer text (the earliest message filed under it), and timeline.
- **For now, the layout keeps a summary of every project** for the other screens: no notes, and of the details only the parts intake matching scores (the type's identifying fields and the dates). The full project comes from the detail endpoint in the browser, or from its own query on the server, for intake's proposal and for applying a message.

### Next steps, one area at a time

1. Today's widgets and notifications compute their counts and lists on the server.
2. Finance insights and partners do the same.
3. Intake matching runs on the server and returns only the suggested projects.
4. Name lookups come joined to their items (an event arrives with its project's title), and pickers and global search query as you type.
5. Projects leave the layout. Then payments, to-dos, and events follow the same path.

Each step ships on its own, and the app works between steps.

## Alternatives considered

- **Keep loading everything, and trim fields.** This is the simplest option and keeps every screen instant. But the cost still grows with the account on every page and every save, and each cap added to hold it down risks another silent error.
- **Page the projects list in the browser, over the layout's summary.** This is quick to build, scrolling needs no requests, and it renders smoothly. But it saves no data, because the summary has to be in the browser for the list to work, and it would have to be rebuilt once projects leave the layout.
- **A local-first sync engine** (all data cached in the browser, syncing only changes, as Linear does). It's instant at any size, but it's a large infrastructure project with its own conflict and migration problems. That's not worth it for the data sizes here.
- **Offset pagination.** It's simpler to write, but rows shift when projects are added or change stage while someone scrolls, so a row can repeat or be skipped.

## Consequences

- Opening a page or a project, and every new page of a list, costs a request. Pages show a loading state for the part that's fetching. Prefetched links and server rendering keep most waits short.
- After a save, `refresh()` re-renders the page and its server data. A list loaded page by page in the browser reloads its first page, and an open detail is fetched again when the project's `updatedAt` changes.
- Each new screen needs its own query and loading, empty, and error states. Shared features, such as search and pickers, need their own endpoints.
- Sorting by due date and amount is computed in SQL: the next open to-do's due date, and the tax-inclusive quote. If accounts grow large enough to need indexes for these sorts, adding them is a schema change and goes through a migration.
- Until the next steps land, the layout still carries a summary of every project, plus every payment, to-do, and event. Most of the payload saving comes with those steps.
