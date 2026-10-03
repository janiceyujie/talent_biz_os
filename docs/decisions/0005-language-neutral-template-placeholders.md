# 0005 — Reply-template placeholders are stored language-neutral

**Status:** Accepted (recorded 2026-10-03; decided during internationalization)

## Context

Reply templates contain fields filled from a project — partner, quote, deliverables. The app is bilingual (繁體中文 and English), and the language a person *uses the app in* isn't the language they *write replies in*: a Taipei artist on the Chinese UI replies to a Tokyo promoter in English. If placeholders were stored in the UI language (`{{合作方}}`), switching the UI language would break every saved template, and an English template edited from the Chinese UI would end up with Chinese placeholders.

## Decision

- **Stored form:** placeholders are language-neutral keys — `{{counterparty}}`, `{{artist}}`, `{{project}}`, `{{offer}}`, `{{quote}}`, `{{deliverables}}`, `{{rights}}`, `{{next_due}}`.
- **Edited form:** shown under the reader's localized names (`{{合作方}}`, `{{報價}}`…) and accepted in either spelling when typed; converted back to keys on save (`lib/templates/placeholders.ts`).
- **Each template records its own `language`.** The rendered reply — quote wording, "to confirm" markers (`【待確認：欄位】`) — reads in the template's language, whatever the UI language.
- Missing values render as a to-confirm marker, never guessed; an unset quote is to-confirm, not 0.
- Starter templates are stored with neutral keys too.

## Alternatives considered

- **Store placeholders in the language they were typed in.** Templates break when the UI language changes, and the server has to understand every spelling forever.
- **One copy of each template per UI language.** Doubles the content to maintain, and still conflates UI language with reply language.
- **Render in the UI language.** Wrong for the core case — replies go out in the counterparty's language.

## Consequences

- Adding a placeholder means a key plus a name in every UI language.
- Adding a UI language means localized names for every placeholder; stored templates don't change.
- AI drafts (later) follow the incoming message's language, consistent with this split.
