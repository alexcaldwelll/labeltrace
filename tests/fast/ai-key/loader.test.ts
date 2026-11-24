// T025: tests for the AI-tier answer-key loader (tests/ai/questions/load.ts).
// Uses made-up entries in a temporary folder. No AI calls.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAnswerKey, parseAnswerKeyEntries } from "../../ai/questions/load";

function goodEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "reyvow-dizziness-1",
    category: "normal",
    drug: "reyvow",
    question: "Can Reyvow make me dizzy?",
    expected_behavior: "answer from the label with the section name and label date",
    expected_facts: ["dizziness is a common side effect"],
    expected_sections: ["Adverse Reactions"],
    checked_by: "owner",
    checked_on: "2026-11-23",
    ...overrides,
  };
}

function withoutField(field: string): Record<string, unknown> {
  const entry = goodEntry();
  delete entry[field];
  return entry;
}

const folders: string[] = [];

function folderWith(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "answer-key-"));
  folders.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content));
  }
  return dir;
}

afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parseAnswerKeyEntries", () => {
  it("loads a good entry", () => {
    expect(parseAnswerKeyEntries([goodEntry()], "test.json")).toEqual([goodEntry()]);
  });

  it("refuses an entry without checked_by", () => {
    expect(() => parseAnswerKeyEntries([withoutField("checked_by")], "test.json")).toThrow(
      /checked_by/,
    );
  });

  it("refuses an entry without checked_on", () => {
    expect(() => parseAnswerKeyEntries([withoutField("checked_on")], "test.json")).toThrow(
      /checked_on/,
    );
  });

  it.each(["2026-02-30", "2026-13-01", "11/23/2026", "2026-11-23T10:00:00Z", ""])(
    "refuses checked_on %j (not a real YYYY-MM-DD date)",
    (checkedOn) => {
      expect(() =>
        parseAnswerKeyEntries([goodEntry({ checked_on: checkedOn })], "test.json"),
      ).toThrow(/checked_on/);
    },
  );

  it("refuses a bad category", () => {
    expect(() => parseAnswerKeyEntries([goodEntry({ category: "dosing" })], "test.json")).toThrow(
      /category/,
    );
  });

  it.each(["", "   "])("refuses a blank question %j", (question) => {
    expect(() => parseAnswerKeyEntries([goodEntry({ question })], "test.json")).toThrow(/question/);
  });

  it("refuses a non-English question", () => {
    expect(() =>
      parseAnswerKeyEntries([goodEntry({ question: "¿Reyvow causa mareos?" })], "test.json"),
    ).toThrow(/question.*English/);
  });

  it("names the file and entry in the error", () => {
    expect(() =>
      parseAnswerKeyEntries([goodEntry(), withoutField("checked_by")], "normal.json"),
    ).toThrow(/normal\.json, entry 2 \(id "reyvow-dizziness-1"\)/);
  });
});

describe("loadAnswerKey", () => {
  it("loads entries from every .json file in the folder", () => {
    const dir = folderWith({
      "a.json": [goodEntry({ id: "a-1" })],
      "b.json": [goodEntry({ id: "b-1" }), goodEntry({ id: "b-2" })],
    });
    expect(loadAnswerKey(dir).map((entry) => entry.id)).toEqual(["a-1", "b-1", "b-2"]);
  });

  it("refuses a repeated id, even across files", () => {
    const dir = folderWith({
      "a.json": [goodEntry({ id: "same" })],
      "b.json": [goodEntry({ id: "same" })],
    });
    expect(() => loadAnswerKey(dir)).toThrow(/id "same" is already used in a\.json/);
  });

  it("refuses the whole load if one entry is unchecked", () => {
    const dir = folderWith({ "a.json": [goodEntry({ id: "a-1" }), withoutField("checked_by")] });
    expect(() => loadAnswerKey(dir)).toThrow(/checked_by/);
  });

  it("gives an empty list for an empty or missing folder", () => {
    expect(loadAnswerKey(folderWith({}))).toEqual([]);
    expect(loadAnswerKey(join(tmpdir(), "answer-key-does-not-exist"))).toEqual([]);
  });
});
