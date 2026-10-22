import "server-only";
import { appSpend } from "./spend";

// AI paused app-wide (docs/decisions/0008): no model call is sent, and what
// needs one waits instead of failing. Two causes:
//
//   AI_PAUSED=1                  the switch, by hand, for an emergency; a redeploy away.
//   AI_DAILY_SPEND_CAP_USD=20    the estimated cost of the last 24 hours (./spend.ts) reached
//                                the cap: paused on its own, and resumed on its own as old calls
//                                leave the window. 0 turns it off.
//
// The providers' own monthly limits are the hard cap (docs/setup/launch-checklist.md); this one
// is an estimate from list prices, there to stop a runaway loop within the day. A database flag
// with an admin toggle can join these later, here, without changing the callers.

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long one check of the spending holds: a cap reached is noticed within a minute. */
const CHECK_MS = 60 * 1000;

export type PauseReason = "switch" | "spend";

export const dailySpendCap = () => Number(process.env.AI_DAILY_SPEND_CAP_USD || 20);

let checked: { at: number; over: boolean } | null = null;
let alerted = false; // this process has told someone the cap was reached, until it resumes

/** Why AI is paused now, or null when it isn't. */
export async function aiPaused(): Promise<PauseReason | null> {
  if (["1", "true"].includes(process.env.AI_PAUSED ?? "")) return "switch";
  const cap = dailySpendCap();
  if (!(cap > 0)) return null;
  if (!checked || Date.now() - checked.at >= CHECK_MS) {
    const spent = await appSpend(new Date(Date.now() - DAY_MS));
    checked = { at: Date.now(), over: spent >= cap };
    if (checked.over && !alerted) {
      alerted = true;
      void alert(spent, cap);
    }
    if (!checked.over) alerted = false;
  }
  return checked.over ? "spend" : null;
}

/** The cap reached: in the log, and by email to AI_ALERT_EMAIL when it's set. Once per process each time. */
async function alert(spent: number, cap: number) {
  const line = `AI paused: about $${spent.toFixed(2)} spent in the last 24 hours, over the $${cap} daily cap (AI_DAILY_SPEND_CAP_USD)`;
  console.error(line);
  const to = process.env.AI_ALERT_EMAIL;
  if (!to) return;
  try {
    // Loaded only here: the evals go through the model seam with no mail server.
    const { sendEmail } = await import("@/lib/email");
    await sendEmail({
      to,
      subject: "AI paused: daily spending cap reached",
      text: `${line}.\n\nNo model calls are sent; messages wait and are analyzed once spending falls under the cap. Check ai_call for what ran, and the providers' consoles for the real bill.`,
    });
  } catch (e) {
    console.error("AI pause alert not sent", (e as Error)?.message);
  }
}
