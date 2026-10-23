# Sentry

Errors from the web server, the browser, and the worker go to Sentry ([decision 0026](../decisions/0026-logging-and-error-reporting.md)), so a failure reaches the builder before a customer reports it. One Sentry project holds both environments; each event says `staging` or `production` (`DEPLOY_ENV`) and the commit it came from.

What an event keeps is decided in `lib/errors`: the error's type, code, and HTTP status, its stack trace, and ids. Its message, the request, the user, breadcrumbs, and extra data never leave; `lib/errors/errors.test.ts` checks it with the real SDK. Without `NEXT_PUBLIC_SENTRY_DSN` nothing is sent, so laptops and CI report nothing.

## Setting it up (once)

1. **Account and data region.** Create a Sentry organization. Sentry asks for the data region (US or EU) here, and it can't be changed later. Note it for the privacy policy, which names Sentry and its region as a processor (launch checklist).
2. **Project.** Create one project, platform Next.js, e.g. `taloox`. Its slug and the organization's are `SENTRY_PROJECT` and `SENTRY_ORG`.
3. **Second line of scrubbing.** In the project's **Settings → Security & Privacy**, keep **Data Scrubber** and **Use Default Scrubbers** on, and turn on **Prevent Storing of IP Addresses**. `lib/errors` already removes these; this catches anything that slips past it.
4. **DSN.** **Settings → Client Keys (DSN)**. It's public by design: the browser's copy is in the page's code.
5. **Token for source maps.** **Settings → Developer Settings → Organization Tokens**, a new token. Its scope lets it create releases and upload source maps and nothing else. Copy it once; Sentry doesn't show it again.
6. **Render.** On each of the four services, as Render asks for the `sync: false` values ([render.md](render.md), "Creating the services"):

   | Setting | Web (staging and production) | Worker (staging and production) |
   |---|---|---|
   | `NEXT_PUBLIC_SENTRY_DSN` | the DSN | the same DSN |
   | `SENTRY_ORG`, `SENTRY_PROJECT` | the two slugs | not needed |
   | Secret file `sentry_auth_token` | the token | not needed |

   The secret file goes under each web service's **Environment → Secret Files**, named exactly `sentry_auth_token`, with the token as its only content. A Blueprint can't hold secret files, so this is the one setting `render.yaml` doesn't list. The build mounts it for one step only, so no layer of the image keeps it (`Dockerfile`).
7. **Alerts.** In **Alerts → Create Alert → Issues**, three rules, each sending email and a Slack message:
   - A new issue is created.
   - An issue changes state from resolved to unresolved (it came back).
   - An issue is seen more than 50 times in one hour (a spike; adjust once you know the usual volume).

   For Slack, add Sentry's Slack integration (**Settings → Integrations → Slack**) and send to a channel whose notifications you turn on in Slack's phone app; that's the phone push. Filter the Slack rules to `environment:production` if staging gets noisy, and keep staging on email.

## Checking it works

After the next deploy to staging:

- The web service's build log shows Sentry uploading source maps for the release (the commit), and then deleting them.
- Send a test event from the staging web service's **Shell** in Render:

  ```sh
  node -e 'const S=require("@sentry/node");S.init({dsn:process.env.NEXT_PUBLIC_SENTRY_DSN,environment:process.env.DEPLOY_ENV});S.captureMessage("sentry.setup_check");S.flush(5000)'
  ```

  It shows up in Sentry under `staging` within a minute, and the alerts above fire for it as a new issue.
- When a real error arrives, its stack trace shows file names like `lib/mail/…` and lines of our code. If it shows only `page-<hash>.js` and single letters, the source maps didn't upload: check the token and the build log.

## When something changes

- **A new token** (it leaked, or someone who had it left): create one, replace the secret file on both web services, delete the old token in Sentry. Nothing else changes.
- **A new DSN**: set it on all four services and redeploy; the browser's copy is built in.
- **The free plan's event quota**: Sentry drops events beyond it. If a bug floods it, resolve or ignore the issue, or lower the spike threshold so you hear sooner.
