import { handleNotices } from "@/lib/mail/jobs/reconcile";
import { pushConfigured } from "@/lib/mail/pubsub";
import { log } from "@/lib/log";

// Gmail's push notices, pulled from Pub/Sub for as long as the worker runs
// (decision 0013). Each pull waits briefly when there's nothing; after a
// failure it waits longer each time, up to a minute. The 15-minute poll
// covers anything missed while this is down.

export function startPush() {
  if (!pushConfigured()) return null;
  let running = true;
  void (async () => {
    let wait = 1000;
    while (running) {
      try {
        await handleNotices();
        wait = 1000;
      } catch (e) {
        log.error("mail.push.pull_failed", { error: e });
        await new Promise((r) => setTimeout(r, wait));
        wait = Math.min(wait * 2, 60_000);
      }
    }
  })();
  return { stop: () => (running = false) };
}
