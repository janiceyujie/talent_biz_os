# Port: prototype UI updates, October 2026

**Source:** `talent-business-os-prototype`, commits after `d07580b` (our previous port) up to `8878466`. **Status:** ported 2026-10-05.

The prototype is a UI study on demo data; this app has real data and the intake flow. Where they differ, the prototype's layout and wording were adopted and this app's behavior kept. Decisions that weren't obvious were asked (marked ★).

| Prototype change | Here |
|---|---|
| Palette, focus rings, sidebar (`9ec842f`) | Adopted: `app/experience.css` is the prototype's file, with our two edits re-applied (links in the sidebar; four phase tabs). |
| Projects as a case folder (`bbdd689`) | Adopted: card list about 1/3, dossier 2/3, 編輯 at the top, narrow screens jump to the detail. Our message-filled details, contract versions, and timeline sit above the money panel. |
| Finance summary (`bbdd689`) | Adopted: one summary led by net cash; cash trend and aging before the contract totals. |
| Form groups and wording (`b4941c8`) | Adopted: project form in 基本資料 / 報價 / collapsed details; payment form asks what, which way, how much, then when, with 收款 or 付款 words by direction. Kept our note on settled amounts below the expected one (withholding). |
| Contact selection (`b4941c8`) | Adopted the two fixes that applied: Enter no longer picks the first match unless an arrow key chose it; a 保留「name」 option keeps typed text. Our picker already kept the selected name on focus. |
| Inbox reading (`14fdd3d`) ★ | Kept our intake review flow; adopted the list hierarchy (count, two-line summary, date, 已歸入合作案) and narrow-screen behavior (list height-limited, jump to the message, back returns focus). Reader metadata shows source, time with zone, and project. |
| Drafts workspace (`3ddd354`, `8c22ed3`, `6a994a8`) ★ | Adopted for what exists: template column and composer in 邀約資料 / 擬稿設定 / 回覆內容, template cards with a selection mark and collapsible text, archived templates can't be applied, and unsaved-text protection (clearing, switching project, replacing the reply, leaving by an in-app link or closing the tab). Waiting for real drafting: saving and loading drafts (the protection's baseline is the last reset until then), AI generation, and Gmail drafts. |
| Day/week calendar (`8878466`) ★ | On real data, saving (see architecture, "Day and week calendar"). Dropped the demo scenario, the data-source switch, and the simulated AI suggestions. A drop on a fixed item goes straight to the confirmation. Added an end time for ordinary events. |
| Today overview (`8878466`) ★ | On real data: today's schedule, needs attention (overdue payments, messages to review, projects in talks, clashes, signed work), our reminders, the next seven days, travel, deliverables, money. Dropped the assistant demo card, the metric cards, and the revenue and pipeline charts (finance and projects show those). |
