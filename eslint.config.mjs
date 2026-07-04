import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated coverage report (gitignored) — never lint machine-emitted JS.
    "coverage/**",
  ]),
  {
    // PDF templates render with @react-pdf/renderer, whose <Image> is not an HTML
    // <img> — the jsx-a11y/alt-text rule does not apply (and `alt` is not a valid prop).
    files: ["components/pdf/**/*.tsx"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
]);

export default eslintConfig;
