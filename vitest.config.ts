import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const noAiClient = fileURLToPath(new URL("./tests/fast/stubs/no-ai-client.ts", import.meta.url));

export default defineConfig({
  resolve: {
    // Same "@/" shortcut as tsconfig.json: "@/lib/x" means "src/lib/x".
    alias: { "@": src },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "fast",
          include: ["tests/fast/**/*.test.{ts,tsx}"],
        },
        resolve: {
          // Fast tests must never load the real AI clients (constitution:
          // fast tests make no AI calls). Any import of them gets a stand-in
          // that throws if a client is created. Tests that set up their own
          // fake with vi.mock() still work.
          alias: {
            "@anthropic-ai/sdk": noAiClient,
            openai: noAiClient,
          },
        },
      },
      {
        extends: true,
        test: {
          name: "ai",
          include: ["tests/ai/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
