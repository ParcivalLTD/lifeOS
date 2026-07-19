import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // NFR-1 boundary: the Anthropic SDK may only be touched by the sole LLM
  // transport module. Everything else goes through the context assembler +
  // request builder, so "what gets sent" stays auditable in one place.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "Only src/lib/ai/client.ts may import the Anthropic SDK — it is the sole LLM API boundary (NFR-1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/ai/client.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Spec + design mockup (incl. generated dc-runtime) — not app code.
    "docs/**",
  ]),
]);

export default eslintConfig;
