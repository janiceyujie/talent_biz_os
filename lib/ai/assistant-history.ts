import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertLocalExperiment } from "./local-budget";
import type { AssistantArchive, AssistantRecord, EvaluationRun } from "./assistant-records";

// This directory is local-only and ignored by Git. Identity comes from server auth.
function directory(personId: string, talentId: string) {
  const owner = createHash("sha256").update(JSON.stringify([personId, talentId])).digest("hex");
  return path.resolve(".ai-local", "conversations", owner);
}
export async function saveAssistantRecord(personId: string, talentId: string, record: AssistantRecord) {
  assertLocalExperiment();
  const dir = directory(personId, talentId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${record.id}.json`);
  if (!/^[a-f0-9-]{36}$/.test(record.id)) throw Error("Invalid record ID");
  const tmp = file + `.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
  await rename(tmp, file);
}
async function optionalJSON(file: string) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function readAssistantArchive(personId: string, talentId: string): Promise<AssistantArchive> {
  assertLocalExperiment();
  const dir = directory(personId, talentId);
  let files: string[] = [];
  try { files = await readdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const records = (await Promise.all(files.filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).map(f => optionalJSON(path.join(dir, f)))))
    .filter(Boolean).sort((a: AssistantRecord, b: AssistantRecord) => a.at.localeCompare(b.at)) as AssistantRecord[];
  // Only fixed synthetic evaluation files are exposed; never arbitrary paths or recordings.
  const runs: EvaluationRun[] = [];
  for (const id of ["luna-100", "luna-100-v2", "luna-daily-100-v3", "luna-followup-100-v3"]) {
    const run = await optionalJSON(path.resolve("evals/results/assistant", `${id}.json`));
    if (run) runs.push({ id, model: run.model, updatedAt: run.updatedAt, rows: run.rows });
  }
  const ledger = await optionalJSON(path.resolve(".ai-local/budget.json")) ?? [];
  return { records: records.slice(-500), truncated: records.length > 500, runs,
    budgetUsedUSD: ledger.reduce((n: number, entry: { chargedUSD: number }) => n + entry.chargedUSD, 0) };
}
