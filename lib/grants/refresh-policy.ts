export const GRANT_REFRESH_CRON = "0 0 * * *";
/** Manual requests skip the cooldown, but share a result completed after that request began. */
export function reuseGrantRefresh(attemptedAt:Date|null, requestedAt:Date, manual:boolean) {
  if(!attemptedAt) return false;
  return attemptedAt.getTime() >= requestedAt.getTime() || (!manual && requestedAt.getTime()-attemptedAt.getTime()<15*60*1000);
}
