import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // NFR-1 boundary: vendor LLM SDKs may only be touched by their provider
  // adapter. Everything else goes through the context assembler + request
  // builder and speaks the provider-neutral canonical shape, so "what gets
  // sent" stays auditable in one place and no vendor's conventions leak.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "Only src/lib/ai/providers/anthropic.ts may import the Anthropic SDK — adapters are the sole LLM API boundary (NFR-1).",
            },
            {
              name: "openai",
              message:
                "Only src/lib/ai/providers/openai.ts may import the OpenAI SDK — adapters are the sole LLM API boundary (NFR-1).",
            },
            {
              name: "@google/genai",
              message:
                "Only src/lib/ai/providers/google.ts may import the Google GenAI SDK — adapters are the sole LLM API boundary (NFR-1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/ai/providers/*.ts"],
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
