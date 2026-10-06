import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// i18n: user-facing text belongs in messages/*.json (see docs/architecture.md,
// "Internationalization"). Flags text typed straight into JSX, hard-coded
// user-facing attributes, and any Chinese string literal in UI code.
const letters = "[A-Za-z\\u4e00-\\u9fff]";
const noHardCodedText = {
  files: ["app/**/*.tsx", "components/**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: `JSXText[value=/${letters}/]`,
        message: "Text shown to users goes in messages/*.json; use t() instead of typing it into JSX.",
      },
      {
        selector: `JSXAttribute[name.name=/^(aria-label|placeholder|title|alt|label)$/] > Literal[value=/${letters}/]`,
        message: "User-facing attributes come from messages/*.json via t().",
      },
      {
        selector: "Literal[value=/[\\u4e00-\\u9fff]/], TemplateElement[value.raw=/[\\u4e00-\\u9fff]/]",
        message: "Chinese text in code: move it to messages/zh-TW.json (and its English to messages/en.json).",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  noHardCodedText,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The second dev server's build folder (NEXT_DIST_DIR, docs/setup/google-calendar.md).
    ".next-test/**",
  ]),
]);

export default eslintConfig;
