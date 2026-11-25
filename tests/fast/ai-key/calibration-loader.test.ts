// T063 (X1): tests for the grader calibration loader (tests/ai/grader/load.ts).
// Uses made-up entries, plus a raw read of the real file. No AI calls.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CALIBRATION_FILE, parseCalibrationEntries } from "../../ai/grader/load";

function goodEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "good-reyvow-storage",
    drug: "reyvow",
    question: "How should I store Reyvow?",
    section_keys: ["storage_and_handling"],
    answer: "Store Reyvow at 68°F to 77°F (20°C to 25°C). (Storage and Handling)",
    expected_grade: "pass",
    checked_by: "owner",
    checked_on: "2026-11-24",
    ...overrides,
  };
}

describe("parseCalibrationEntries", () => {
  it("loads a good entry with its label section text from the saved label", () => {
    const [entry] = parseCalibrationEntries([goodEntry()]);
    expect(entry?.id).toBe("good-reyvow-storage");
    expect(entry?.sections).toHaveLength(1);
    expect(entry?.sections[0]?.display_name).toBe("Storage and Handling");
    expect(entry?.sections[0]?.text).toContain("Store at 20°C to 25°C (68°F to 77°F)");
  });

  it.each([
    ["a blank checked_by", { checked_by: "" }],
    ["a blank checked_on", { checked_on: "" }],
  ])("refuses an unsigned entry (%s)", (_label, overrides) => {
    expect(() => parseCalibrationEntries([goodEntry(overrides)])).toThrow(/checked_/);
  });

  it.each(["2026-02-30", "11/24/2026"])("refuses a fake checked_on date %j", (checkedOn) => {
    expect(() => parseCalibrationEntries([goodEntry({ checked_on: checkedOn })])).toThrow(
      /checked_on/,
    );
  });

  it("refuses a repeated id (Y1)", () => {
    expect(() => parseCalibrationEntries([goodEntry(), goodEntry()])).toThrow(
      /entry 2 \(id "good-reyvow-storage"\) refused: id is already used/,
    );
  });

  it("requires mistake on bad entries and forbids it on good ones (Y2)", () => {
    expect(() => parseCalibrationEntries([goodEntry({ expected_grade: "fail" })])).toThrow(
      /mistake is required/,
    );
    expect(() => parseCalibrationEntries([goodEntry({ mistake: "added_fact" })])).toThrow(
      /mistake is not allowed/,
    );
  });
});

describe("the real calibration file", () => {
  it("has exactly 5 good and 5 bad entries", () => {
    const raw = JSON.parse(readFileSync(CALIBRATION_FILE, "utf8")) as {
      expected_grade: string;
    }[];
    expect(raw.filter((e) => e.expected_grade === "pass")).toHaveLength(5);
    expect(raw.filter((e) => e.expected_grade === "fail")).toHaveLength(5);
  });
});
