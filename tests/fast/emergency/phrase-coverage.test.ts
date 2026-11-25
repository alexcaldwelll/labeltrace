// T017: the "every phrase has a test" check (FR-010). It reads every id in
// src/lib/emergency/phrases.ts and fails if any id has no test in
// tests/fast/emergency/phrases.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMERGENCY_PHRASES } from "@/lib/emergency/phrases";

const testFile = readFileSync(new URL("./phrases.test.ts", import.meta.url), "utf8");

describe("every emergency phrase id has a test", () => {
  for (const { id } of EMERGENCY_PHRASES) {
    it(`${id} has an entry in phrases.test.ts`, () => {
      expect(testFile).toContain(`id: "${id}"`);
    });
  }
});
