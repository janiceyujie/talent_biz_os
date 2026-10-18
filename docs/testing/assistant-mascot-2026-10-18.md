# Assistant mascot interaction acceptance — 2026-10-18

Local-only browser verification using a disposable, verified credential account and the real Next.js application, authentication, server action, conversation provider and local history persistence. Synthetic sample workspace only; no GitHub push and no production data changes.

## Method and boundaries

An isolated dev server used the existing local database. A loopback-only proxy temporarily held server-action requests until manually released, allowing observation of the pending animation. It forwarded the actual response unchanged. OPENAI_API_KEY was empty in that server, so no paid model requests or external messages were sent. Success cases used deterministic local queries; failure cases exercised the genuine not_configured server error. External model generation quality, live provider/network failures and OS reduced-motion behavior were not exercised in this run.

## Verified

- Signed in using the normal email/password UI, without an auth bypass.
- Full assistant: a Today query displayed aria-busy=true, disabled sending and one animated folded helper. Two readbacks showed changing transform values under assistant-helper-think.
- Successful response: aria-busy=false, zero thinking mascots and an editable composer; the local result rendered with zero token usage.
- Full assistant error: a drafting request returned not_configured; animation stopped, error/retry appeared and the original composer text was preserved.
- Navigating to Today and opening the dock preserved the conversation, including the prior error.
- Dock success: an unpaid-items query animated while pending, then rendered the response and stopped.
- Minimizing during that pending request moved the animated indicator to the launcher. Reopening retained the pending conversation.
- Dock failure: a drafting request animated while pending and stopped on the error, with input restored.
- Retry reactivated the animation without adding another copy of the failed final user message. Expanding to the full page while pending preserved the same request and animation; the retry error stopped it.
- A subsequent Tomorrow query succeeded after the errors, demonstrating recovery. Three successful local replies and three controlled failures were exercised.

## Evidence and cleanup

Screenshots are in the sibling internal workspace under output/assistant-qa: full-pending.png, dock-pending.png, dock-completed.png. These show the authenticated application, unlike the earlier standalone component preview.

No product code changes were required. Both temporary fixture runs removed their exact synthetic users/workspaces, associated AI-call error records and identity-scoped conversation folders. Cleanup verified zero matching person rows. Temporary servers and browser tab were closed; the temporary harness and credentials file were removed. Only the custom test build includes were removed from tsconfig.json; unrelated local changes were preserved.
