# UI/UX principles

**Status:** Living document, started 2026-10-07 from the review rounds on Projects and Artists & partners (PRs #1–#3 and `user/janlin/contacts-page-polish`). Add to it, or change it, as new features teach us something.

**How to use it:** Before building or reviewing a screen, check it against these. Each principle says what to do, why, and where the app already does it, so there's a pattern to copy.

**Where each one came from:**

- *(asked)* comes from review feedback: something that felt wrong in use, and the fix that was asked for.
- *(proposed)* was suggested while making those fixes and agreed.

The people this is for are independent artists and their managers. They open the app between other work, often on a phone, and want to know what needs them without reading much.

---

## 1. Lead with what needs doing

**1.1 The first thing on a screen answers "what do I do now?"** *(asked)*
Put the actions first and the reference material after. A screen that opens on facts makes people hunt for the task.
*Seen in:* a project's screen opens with To do (待辦事項), then three glance cards, then the tabs.

**1.2 Put each action next to what it acts on.** *(asked)*
A button at the far edge of a wide card, or one that has scrolled out of sight, feels unconnected to its item.
*Seen in:*
- a closing check's fix button sits right after its sentence;
- "Next" sits beside its to-do;
- the deal card (合作內容) has its own Edit, because the one at the top is out of sight by then;
- "+ Add a to-do" sits under the list.

**1.3 A problem comes with its fix.** *(proposed)*
Anything that says something is missing or wrong offers the one action that fixes it, opened at the right place.
*Seen in:*
- closing checks: Add, Request payment, Record payment, Add travel;
- "+" chips for missing deal terms and missing contact details.

**1.4 Let people act in any order.** *(asked)*
Every open item can be ticked, not just the one we marked as next. We suggest the order; people decide it.
*Seen in:* every to-do has its own checkbox. The soonest is tagged Next, but any can be done first.

**1.5 What the data can decide isn't a checkbox.** *(proposed)*
Closing checks are met when the records say so: quote set, payment received. Ticking one by hand would let the list disagree with the data. Met checks fold away under "N done".

## 2. Fewer words, clearer zones

**2.1 Say each thing once, in as few words as it takes.** *(asked)*
Crowded text was the first complaint. Cut repeated facts (the stage used to be stated three times) and labels that restate the obvious.

**2.2 Set different kinds of content apart.** *(asked)*
Use space, bands, tints and separate boxes, not just headings, so the eye can tell where one part ends.
*Seen in:*
- a project's title on white;
- the stage on a tinted strip;
- To do and the glance cards in one box, the tabs in a separate box;
- a tab bar that's clearly a tab bar, over a tinted area where each section is a white card.

**2.3 Give equal things equal weight.** *(asked)*
Side-by-side cards of the same kind share a width and a style; uneven sizes suggest a ranking that isn't there.
*Seen in:* the three glance cards (money, coming up, notes).

**2.4 Leave room between sections.** *(asked)*
Sections that touch read as one. At least 24px between major blocks on a screen.

**2.5 Things that differ should look different, and things that are the same should look the same.** *(asked)*
*Seen in:*
- folded company groups have a tinted header row with an icon, set apart from the person rows;
- contact types each have their own tag colour (artist violet, partner blue, manager amber).

**2.6 One continuous visual for one idea.** *(asked)*
The six stages are one line of steps under the three phase names. Three separate bars made one flow look like three.

## 3. Controls look like what they do

**3.1 A filter looks like a filter; a toggle looks like a toggle.** *(asked)*
*Seen in:*
- filters carry a funnel and are tinted while active;
- Archived is a toggle button with the archive icon. On Projects it's a separate tab with a banner, because it's a different place, not a narrower list.

**3.2 Controls in one row share shape and height.** *(asked)*
A checkbox next to bordered fields looks like it belongs to something else.

**3.3 Group controls by purpose.** *(asked, then proposed)*
Search and filters shape the list, so they sit together. Creating something is a different kind of action, so New sits beside the page title, as on Projects and Artists & partners.

**3.4 What looks clickable is clickable, and the whole of it.** *(asked)*
*Seen in:*
- a stage moves when you click its dot or its label;
- glance cards open where their content is dealt with.

**3.5 No symbols that need explaining.** *(asked)*
An arrow in a button label ("Mark as signed → Execution") read as a second action. Say it in words.

**3.6 One way to do a thing, unless it has scrolled out of reach.** *(asked)*
Duplicate controls side by side are noise (a second Edit link beside the header's was removed). A repeat is right when the first is out of sight where the task happens (the deal card's Edit). When a control repeats, it should open the place that's relevant, not the top of the form.

**3.7 Rare and risky actions live in a ⋯ menu.** *(proposed)*
Archive, remove and make main sit in a menu rather than as underlined links beside the main action.

## 4. Keep people in place

**4.1 Keep what you scroll past but still need in view.** *(asked)*
*Seen in:* the top bar, the Artists & partners controls row, and a project's tabs stick under the top bar.

**4.2 Scrolling one pane doesn't move another.** *(asked)*
The projects list scrolls on its own: reaching its end doesn't scroll the page, and the open project stays put.

**4.3 Switching views keeps the new content in view.** *(asked)*
Tabs of different heights shouldn't leave you halfway down the new one. After a switch, the tab's top sits under the top bar if it was scrolled past or doesn't fit.

**4.4 Coming back finds things as they were.** *(asked)*
Filters, sort, search and the open item live in the address. Back and reload restore the list and its scroll position.

**4.5 Open forms where the task is.** *(asked)*
An Edit or "+" opens the form at the right field, with its section unfolded and the cursor in it.

**4.6 Dialogs are centred, with buttons in proportion.** *(asked)*
A dialog stuck at the bottom of the screen, or stretched buttons, looks broken even when it works.

**4.7 No flicker while data refreshes.** *(asked)*
Keep showing what's on screen until the new data arrives; don't drop to a loading state and back.

## 5. Hold up at scale

**5.1 Design for hundreds, not the demo's ten.** *(asked)*
Lists that can grow page from the server (decision 0011). Ask "what happens when this gets long?" for every list, row of names and label.

**5.2 Long lists: show a few, then a way to the rest.** *(asked, then proposed)*
*Seen in:*
- a contact's card shows 3 projects, "N more" expands up to 10, and beyond that "See all" opens Projects filtered to them;
- folded company groups show two names, then "+N";
- To do folds to one line that still names the next step.

**5.3 Long text is cut short, not wrapped into a mess.** *(asked)*
Truncate with "…", show the whole on hover, and never let a tag wrap away from its label.

**5.4 Order by what matters now, not how it's stored.** *(proposed)*
Ongoing first, by what comes next. History by when it happened, not when it was last edited (editing an old record shouldn't bring it to the top). Finished items show their year rather than "Closed" on every line.

**5.5 Numbers match the list they open.** *(asked)*
A tab's count is computed under the same search and filters as its list.

**5.6 Don't hide results behind a scope people didn't choose.** *(asked)*
Search covers every stage, because people search without knowing a project's stage. Typing switches to All, and clearing returns to the tab you were on.

**5.7 Scale work waits for real need.** *(proposed)*
When the data is small, prefer the simple design and note what would change it (contacts aren't paged until a workspace nears ~500).

**5.8 Test every list with a lot in it, not just the usual few.** *(asked)*
When building anything that shows a list (rows, cards, tags, names), fill it with an amount that's large but realistic before calling the layout done. A long-standing partner with 10–20 projects, a company with a dozen people, a project with several companies. Check the usual case, the long case, one item, and none, so the layout holds for all of them. Add the test data to the test account when it isn't there.
*Seen in:* a contact linked to 10 projects showed that the card needed a cap and an order. A long name showed that the type tag wrapped away from it.

## 6. Safe, honest feedback

**6.1 Ask before destroying; offer Undo for quick, reversible steps.** *(asked, then proposed)*
Removing a person or company asks first (ConfirmDialog). Ticking a to-do happens at once, with Undo in the toast.

**6.2 Say what will happen before it does.** *(asked)*
The contact picker says "adds X as a new contact at Y" and warns when a name matches an existing contact. The old "Keep… save only" option and its warning confused people.

**6.3 Missing information is an invitation, not an error.** *(asked)*
"+ Email" is a button that adds it. "No email yet" is a dead line.

**6.4 Empty states tell the truth about where you are.** *(proposed)*
An empty Archived view says nothing is archived; it doesn't show the "add your first contact" panel.

**6.5 Picking an item from a list shows only valid choices.** *(asked)*
Adding someone at a company lists that company's people and contacts without one, never people who work elsewhere.

## 7. Words

**7.1 Read every sentence as the user would.** *(asked)*
Hints say what a state means and what to do next, in plain words, without system jargon. The negotiating stage's note went from "Replying and settling terms; no execution to-dos yet." to "Settling the terms. Once it's signed, you can plan to-dos, travel, and payments."

**7.2 Natural terms in each language.** *(asked)*
Use the word people actually use:
- 公司, not 組織;
- 待辦事項, not 要做的事;
- the right measure words (這家公司).

Chinese wording is reviewed as Chinese, not translated word for word.

## 8. Consistent across pages

**8.1 Solve a pattern once, then reuse it.** *(asked: "as we did for projects page")*
When a page needs something another page already has, use the same piece:

| Need | Pattern | Where |
|---|---|---|
| Narrow a list by a type | Funnel select, tinted when active (`.type-filter`) | Projects, Artists & partners |
| A narrowed list from a link | Removable chip (`.filter-chip`) | Projects `?contact=` |
| Show archived | Archive icon: a tab with a banner (Projects) or a toggle (`.archive-toggle`) | Projects, Artists & partners |
| Create | Primary button beside the page title | Projects, Artists & partners |
| Something missing | Dashed "+" chip that opens the form at it (`.add-chip`) | Deal card, contact cards |
| Rare or risky actions | ⋯ menu (`MoreMenu`) | Cards, rows, page headers |
| Destructive step | `ConfirmDialog` | Removing people and companies |
| Quick reversible step | Toast with Undo | Ticking a to-do |
| Section of a screen | `DealCard`: white card with a title row and one action | Project tabs, company page |
| Explanation | ⓘ `InfoHint` (opens upward when below would cover the content) | Stage strip, phase tabs |
| Where you are | Quiet breadcrumb above the page's own title (`.breadcrumb`) | Company page |
| Status of a thing | Small rounded tag (`.person-role`, coloured by kind) | People, contacts, to-dos |

## 9. Phones are a first-class screen

**9.1 Every change is checked at phone width.** *(proposed)*
No sideways scrolling. Controls wrap into tidy rows. Only what's essential keeps its label (on a phone the stepper names only the current stage). The list and the detail take turns.

**9.2 Sticky things earn their space.** *(proposed)*
On a phone, every sticky row takes reading room. Keep sticky rows to one or two lines, and move actions elsewhere (like New beside the title) so the row stays short.

## 10. How we work on UI

**10.1 Look at it before calling it done.** *(asked)*
Check every UI change in a real browser on the test account, at desktop and phone width, with screenshots, and try the interaction rather than just render it. Use realistic data: long names, many items (5.8), empty states.

**10.2 Review as a user, not as a builder.** *(asked)*
Walk through the screen as a persona, such as a solo artist checking a gig between rehearsals, and critique what they'd see first, what they'd miss, and what they'd have to read twice.

**10.3 Recommend one option.** *(proposed)*
When there's a choice, give a recommendation and the reason, not a survey of every option. Note what would change the answer.

**10.4 Fix the cause, not the symptom.** *(proposed)*
For example, the list scrolled the page because it reached past the window. Making it fit the window fixed both that and the hidden rows.
