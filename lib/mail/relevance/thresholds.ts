// From the model's score to what happens to an email (decision 0013): above
// the high threshold it's work; below the low one it's filtered out; between
// them it's "Not sure this is work", fetched and flagged. Set from the
// relevance eval (evals/relevance): on the models it was first run on, every
// work case scored 0.8 or more and almost everything else 0.3 or less. The Not
// work rate tunes them from here.

export type ScoredOutcome = "work" | "unsure" | "skipped";

export function thresholds(env: Record<string, string | undefined> = process.env) {
  const read = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return value && Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
  };
  const low = read(env.MAIL_RELEVANCE_LOW, 0.4);
  const high = Math.max(low, read(env.MAIL_RELEVANCE_HIGH, 0.6));
  return { low, high };
}

export function outcomeFor(score: number, t = thresholds()): ScoredOutcome {
  if (score >= t.high) return "work";
  if (score < t.low) return "skipped";
  return "unsure";
}
