// T059: an empty stand-in for the "server-only" package in the "ai" Vitest project
// (vitest.config.ts). The real package stops browser code from loading the grader
// client; the AI-tier runner is plain test code, not browser code, so it may load it.
export {};
