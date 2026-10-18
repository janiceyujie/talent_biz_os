# Grant announcement card layout

Local only, 2026-10-12.

Source region and agency share one header row beside the official availability badge. The opportunity title leads the white body, followed by the official cutoff with a calendar icon. Saved cards group application progress and the planned submission into a divided footer. Selection uses an inset accent and a tinted footer, while the title stays on white. The entire card remains one keyboard-operable button with no nested controls. Data selection, persistence and reminder logic are unchanged.

Verification: TypeScript, lint, i18n parity, production build and diff checks passed. Reviewed a local isolated workspace with a long title, unset submission, scheduled date/time and completed date without a time, plus unsaved discovery cards. Enter opens details. Traditional Chinese cards passed 320/768/1024/1440 px checks, and English cards passed the 320 px check; neither documents nor cards overflowed horizontally. Desktop and phone screenshots were visually inspected. No console errors were captured. Viewport overrides were reset. The disposable account was signed out and removed after verification, preserving existing user records. No commit, push or deployment.
