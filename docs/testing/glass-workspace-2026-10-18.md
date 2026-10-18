# Glass workspace and reminder review — 2026-10-18

Local-only changes on top of the existing manager-capacity work. No commit, push, deployment, real mail, paid model call or new dependency.

## Changes

- Shared frosted surfaces, controls, navigation and overlays in `app/glass.css`; existing icons and green brand direction retained. Dense content remains near opaque. No animated blur or backdrop filters on scrolling content ancestors. High contrast, reduced transparency and unsupported-backdrop fallbacks included.
- Today's briefing is always reopenable, including an empty selected-artist view. Its identity follows selected artist IDs rather than temporary polling results. Day/scope changes close the previous dialog and allow the correct new briefing. Manual opening consumes the current welcome/snooze display token, preventing immediate duplicate opening.
- Intake keeps Import offer and New project as primary entry points. Paste and Upload are nested in Import offer. Gmail is an explicitly labeled source with connection/sync controls. The settings link targets the Gmail section. Preview dialogs explain read-only behavior and remain unable to submit.
- Shared menus support arrows, Home/End and Escape with focus return. The Intake import control remains visible on narrow screens.
- Shared entity decoding supports decimal/hex Unicode, common named punctuation and bounded nested encoding. Public grant titles are normalized before identity generation. Refresh preserves an existing unique matching MOC record ID. A guarded local repair script backs up changed rows and preserves IDs, application links and source timestamps.

## Verification

- 325 unit tests passed, including numeric/hex/nested encoding and Sunday/midnight timezone coverage.
- Daily briefing workflow: 65 local checks passed.
- Inbox mail workflow: 40 local checks passed; zero paid calls and zero real Gmail calls.
- ESLint, TypeScript, locale catalogs and isolated webpack production build passed.
- Browser: manager selection cleared -> briefing opens with zero items; one selected artist -> six matching reminders; View details -> Finance -> briefing opens again. Sunday October 18 displayed correctly for the fixture timezone.
- Browser: desktop Intake import menu, Paste/Upload preview dialogs, and 390 px mobile import menu checked. Mobile import visibility was fixed after inspection; no document-level horizontal overflow observed.
- Local grant repair updated two source records, zero linked tasks; a repeat dry run found zero remaining changes. Backup retained under `/private/tmp/taloox-grant-text-backup-1792299326020.json`.

## References and boundaries

- Apple Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Fluent Materials: https://fluent2.microsoft.design/material
- Fluent UI open source: https://github.com/microsoft/fluentui

This is a web CSS interpretation, not native iOS Liquid Glass. New brand assets remain pending. Browser verification used synthetic local accounts. It does not verify production permissions, real Gmail delivery, mobile push notifications or an iPhone app.
