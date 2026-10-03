// Keeps every message catalog in step with the reference catalog (en):
// same keys, and the same ICU arguments ({name}) in each message.
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../messages/", import.meta.url);
const reference = "en";
const flatten = (tree, prefix = "") =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
// Argument names at the top level of a message ({count}, {label}). Text inside
// plural/select branches is free wording, so only depth-0 braces count.
function args(msg) {
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] === "{") {
      if (depth === 0) names.add(/^\s*([A-Za-z_]\w*)/.exec(msg.slice(i + 1))?.[1]);
      depth++;
    } else if (msg[i] === "}") depth--;
  }
  return [...names].filter(Boolean).sort().join(",");
}

const load = (locale) => new Map(flatten(JSON.parse(readFileSync(new URL(`${locale}.json`, dir), "utf8"))));
const ref = load(reference);
let problems = 0;
const report = (message) => {
  problems++;
  console.error(message);
};
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const locale = file.replace(/\.json$/, "");
  if (locale === reference) continue;
  const cat = load(locale);
  for (const [key, msg] of ref) {
    if (!cat.has(key)) report(`${locale}: missing ${key}`);
    else if (args(cat.get(key)) !== args(msg)) report(`${locale}: ${key} has {${args(cat.get(key))}}, en has {${args(msg)}}`);
  }
  for (const key of cat.keys()) if (!ref.has(key)) report(`${locale}: ${key} isn't in en`);
}
if (problems) process.exit(1);
console.log(`i18n: ${ref.size} keys, all catalogs match ${reference}`);
