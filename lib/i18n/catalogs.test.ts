// Every message in every catalog formats (npm run i18n:check only compares keys
// and arguments). A message that doesn't format shows as its key: "<" read as
// the start of a tag, an unclosed brace. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createTranslator } from "next-intl";
import appEn from "@/messages/en.json";
import appZh from "@/messages/zh-TW.json";
import supportEn from "@/messages/support/en.json";
import supportZh from "@/messages/support/zh-TW.json";

type Tree = { [key: string]: string | Tree };
const keys = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
const valueAt = (tree: Tree, key: string) => key.split(".").reduce<Tree | string>((t, k) => (t as Tree)[k], tree) as string;

/** A value for each argument: a number where one is formatted as one, a word otherwise. */
function argsFor(message: string) {
  const args: Record<string, string | number | ((chunks: unknown) => unknown)> = {};
  for (const m of message.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?:,\s*(\w+))?/g)) args[m[1]] = m[2] === "plural" || m[2] === "selectordinal" || m[2] === "number" ? 1 : "x";
  for (const m of message.matchAll(/<([A-Za-z]\w*)>/g)) args[m[1]] = (chunks) => chunks;
  return args;
}

const catalogs = [
  ["messages/en.json", "en", appEn],
  ["messages/zh-TW.json", "zh-TW", appZh],
  ["messages/support/en.json", "en", supportEn],
  ["messages/support/zh-TW.json", "zh-TW", supportZh],
] as const;

describe("every message formats", () => {
  for (const [name, locale, messages] of catalogs)
    test(name, () => {
      const failed: string[] = [];
      const t = createTranslator({ locale, messages: messages as unknown as Tree, onError: () => {}, getMessageFallback: ({ key, namespace }) => `\u0000${namespace ? `${namespace}.` : ""}${key}` }) as unknown as {
        rich: (key: string, args: object) => unknown;
      };
      for (const key of keys(messages as unknown as Tree)) {
        const out = t.rich(key, argsFor(valueAt(messages as unknown as Tree, key)));
        if (JSON.stringify(out).includes("\\u0000")) failed.push(key);
      }
      assert.deepEqual(failed, []);
    });
});
