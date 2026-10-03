// Every intent, project type, extraction field, and analysis flag kind in the
// registries (lib/ai/extraction, lib/project-types, lib/ai/safety) needs a
// label in every catalog.
// Run as part of `npm run i18n:check`.
import { readdirSync, readFileSync } from "node:fs";
import { intents } from "../lib/ai/extraction/intents";
import { projectTypes } from "../lib/project-types";
import { flagKinds } from "../lib/ai/safety";

const dir = new URL("../messages/", import.meta.url);
const required = [
  ...intents.flatMap((i) => [`labels.intent.${i.key}`, ...i.fields.map((f) => `labels.intentField.${f.key}`)]),
  ...projectTypes.flatMap((t) => [`labels.projectType.${t.key}.label`, ...t.extraction.fields.map((f) => `labels.projectType.${t.key}.fields.${f.key}`)]),
  ...flagKinds.map((k) => `labels.flag.${k}`),
];
let missing = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const catalog = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  for (const key of required) {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalog);
    if (typeof value !== "string") {
      missing++;
      console.error(`${file}: no label for ${key}`);
    }
  }
}
if (missing) process.exit(1);
console.log(`registry labels: ${required.length} keys, all present`);
