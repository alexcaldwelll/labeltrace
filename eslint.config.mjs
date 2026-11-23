// ESLint settings (T003). ESLint finds mistakes in code before it runs.
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Folders and files ESLint should skip: built output, downloads, and generated files.
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"],
  },

  // The usual TypeScript checks.
  ...tseslint.configs.recommended,

  // No console.* anywhere in src/. A stray console.log could put a user's raw
  // question into the logs (research R18).
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-console": "error",
    },
  },

  // The one exception: the server logger, which only accepts scrubbed text (R18).
  {
    files: ["src/lib/log/server-log.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
