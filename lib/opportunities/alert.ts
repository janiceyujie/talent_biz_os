import "server-only";
import type { RefreshOutcome } from "./refresh";
import { log } from "@/lib/log";

// What went wrong in a day's read of the opportunity sources (decision 0024),
// for the team, never the people using the app: they see only when each
// source was last read, and a call not read lately comes out as Check. In the
// log, and in one email to OPS_ALERT_EMAIL when it's set.

export async function alertOps(outcomes: RefreshOutcome[]) {
  const lines = outcomes.flatMap((o) => [
    ...(o.ok ? [] : [`${o.source} failed: ${o.failure}; last read ${o.lastRead?.toISOString() ?? "never"}, and its calls are kept as they were`]),
    ...o.problems.map((p) => `${o.source}: ${p}`),
  ]);
  if (!lines.length) return;
  // The details are in the email; the log has which source and how many.
  for (const o of outcomes) {
    if (!o.ok) log.error("opportunities.source.failed", { source: o.source, reason: o.failure });
    if (o.problems.length) log.warn("opportunities.source.problems", { source: o.source, count: o.problems.length });
  }
  const to = process.env.OPS_ALERT_EMAIL;
  if (!to) return;
  try {
    const { sendEmail } = await import("@/lib/email");
    await sendEmail({
      to,
      subject: `Opportunities: ${lines.length} problem${lines.length === 1 ? "" : "s"} reading the sources`,
      text: `${lines.map((l) => `- ${l}`).join("\n")}\n\nA source that changed its format needs its parser or its entry in lib/opportunities/tracked.ts updated. The worker's log has the details. People using the app see none of this: a call not read for three days shows as Check.`,
    });
  } catch (e) {
    log.error("opportunities.alert.failed", { error: e });
  }
}
