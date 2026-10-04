// Why an analysis didn't happen. Stored on the message (message.failure) and
// explained to the person in their language (inbox.failure.*); every code needs
// a label, which `npm run i18n:check` verifies. No server-only imports: the
// inbox reads these too.
export const failureCodes = [
  "busy", // the provider is overloaded
  "rate_limited", // per-minute or daily quota reached
  "recitation", // the provider refused to reproduce what looks like published text
  "blocked", // the provider's safety filters blocked the input or answer
  "too_long", // the answer ran out of room
  "unreachable", // the provider couldn't be reached
  "invalid_output", // the answer didn't fit the schema
  "not_configured", // no key or provider set
  "unsupported_file", // this model can't read this kind of file
  "replay_missing", // tests run on recordings only (AI_REPLAY=only) and this request has none
  "usage_limit", // the account reached its AI usage limit
  "unexpected", // anything else (details in the server log)
] as const;
export type FailureCode = (typeof failureCodes)[number];
/** The codes a model call itself can fail with. */
export type ModelErrorCode = Exclude<FailureCode, "unexpected">;

export const isFailureCode = (value: unknown): value is FailureCode => failureCodes.includes(value as FailureCode);
