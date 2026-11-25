// T063: grader calibration (research R4). AI tier: this calls the real grader.
//
// Grades every signed-off calibration entry with the grader model in
// src/config/models.ts. The model passes only if it catches all 5 bad answers
// (grade "fail") and passes at least 4 of the 5 good ones (grade "pass").
// Each entry's grade and reason are printed so runs can be compared.
import { describe, expect, it, vi } from "vitest";
import type { ScrubbedText } from "@/lib/scrub/types";
import { loadCalibrationSet } from "./load";

// This runs as plain test code, not Next.js server code, so let the server-only
// grader client load.
vi.mock("server-only", () => ({}));

describe("grader calibration", () => {
  it("catches all 5 bad answers and passes at least 4 of 5 good ones", async () => {
    const entries = loadCalibrationSet();
    const { createGraderClient } = await import("@/lib/ai/grader");
    const { GRADER_MODEL } = await import("@/config/models");
    const grader = createGraderClient();

    const results = [];
    for (const entry of entries) {
      const reply = await grader.grade({
        // Hand-made questions with no personal details, so nothing needs scrubbing.
        question: entry.question as ScrubbedText,
        sections: entry.sections,
        answer: entry.answer,
      });
      results.push({
        id: entry.id,
        expected: entry.expected_grade,
        got: reply.grade,
        reason: reply.reason,
      });
    }

    console.log(`Grader model: ${GRADER_MODEL.id}`);
    console.table(results);

    const bad = results.filter((r) => r.expected === "fail");
    const good = results.filter((r) => r.expected === "pass");
    const badCaught = bad.filter((r) => r.got === "fail").length;
    const goodPassed = good.filter((r) => r.got === "pass").length;
    console.log(`Bad answers caught: ${badCaught} of ${bad.length}`);
    console.log(`Good answers passed: ${goodPassed} of ${good.length}`);

    expect(bad).toHaveLength(5);
    expect(good).toHaveLength(5);
    expect(badCaught).toBe(5);
    expect(goodPassed).toBeGreaterThanOrEqual(4);
  }, 300_000);
});
