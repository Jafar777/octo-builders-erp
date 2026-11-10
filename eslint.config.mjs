import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Exported data of the old program (large JSON).
    "scripts/legacy/data/**",
  ]),
  // Command-line scripts have no React: the hooks rule only costs time there (on the
  // legacy importer's long mapping function it never finishes).
  { files: ["scripts/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
]);

export default eslintConfig;
