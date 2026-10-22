export const GRANT_REFRESH_CRON = "0 0 * * *";
// Recover the most recent missed daily run after a local worker restart.
export const GRANT_REFRESH_OPTIONS = {maxAttempts:3,backfillPeriod:24*60*60*1000};
/** Manual requests skip the cooldown, but share a result completed after that request began. */
export function reuseGrantRefresh(attemptedAt:Date|null, requestedAt:Date, manual:boolean) {
  if(!attemptedAt) return false;
  return attemptedAt.getTime() >= requestedAt.getTime() || (!manual && requestedAt.getTime()-attemptedAt.getTime()<15*60*1000);
}
