import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
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
export async function readAssistantArchive(personId: string, talentId: string, cursor?: string): Promise<AssistantArchive> {
  assertLocalExperiment();
  if (cursor && !/^[a-f0-9-]{36}\.json$/.test(cursor)) throw Error("Invalid history cursor");
  const dir = directory(personId, talentId);
  let files: string[] = [];
  try { files = await readdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Inspect metadata, not every transcript. Read at most one page of contents.
  const entries = await Promise.all(files.filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).map(async file => ({ file, modified: (await stat(path.join(dir, file))).mtimeMs })));
  entries.sort((a, b) => b.modified - a.modified || b.file.localeCompare(a.file));
  const position = cursor ? entries.findIndex(e => e.file === cursor) : -1;
  if (cursor && position === -1) throw Error("History cursor unavailable");
  const page = entries.slice(position + 1, position + 51);
  const records = (await Promise.all(page.map(e => optionalJSON(path.join(dir, e.file)))))
    .filter(Boolean).sort((a: AssistantRecord, b: AssistantRecord) => a.at.localeCompare(b.at)) as AssistantRecord[];
  const truncated = position + 1 + page.length < entries.length;
  return { records, truncated, nextCursor: truncated ? page.at(-1)!.file : null };
}

// Internal reports have a separate server entrypoint and explicit local opt-in.
export function assertInternalAssistantReports() {
  assertLocalExperiment();
  if (process.env.AI_INTERNAL_REPORTS !== "1") throw Error("Internal reports are disabled");
}
export async function readAssistantEvaluations(): Promise<EvaluationRun[]> {
  assertInternalAssistantReports();
  const runs: EvaluationRun[] = [];
  for (const id of ["luna-100", "luna-100-v2", "luna-daily-100-v3", "luna-followup-100-v3", "luna-100-context-v3", "luna-daily-100-context-v3", "luna-followup-100-context-v3"]) {
    const run = await optionalJSON(path.resolve("evals/results/assistant", `${id}.json`));
    if (run) runs.push({ id, model: run.model, updatedAt: run.updatedAt, rows: run.rows });
  }
  return runs;
}
