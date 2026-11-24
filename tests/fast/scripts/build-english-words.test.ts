// T013: the word-list script's save step, tested with made-up downloads (no internet).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildWordFile, parseWordList, SOURCE_URL } from "../../../scripts/build-english-words";

const SAMPLE = [
  "Custom wordlist generated from https://app.aspell.net/create using",
  "  Size: 60 (default)",
  "",
  "Copyright 2000-2026 by Kevin Atkinson",
  "",
  "Permission to use, copy, modify, distribute, and sell ...",
  "---",
  "A",
  "a",
  "Headache",
  "can't",
  "",
  "dizzy",
  "",
].join("\n");

const bytes = new TextEncoder().encode(SAMPLE);

describe("parseWordList", () => {
  it("splits the header from the words, lowercases, removes repeats, and sorts", () => {
    const { notice, words } = parseWordList(SAMPLE);
    expect(notice).toMatch(/^Custom wordlist generated/);
    expect(notice).toMatch(/Permission to use/);
    expect(notice).not.toContain("---");
    expect(words).toEqual(["a", "can't", "dizzy", "headache"]);
  });

  it("handles Windows line endings", () => {
    expect(parseWordList(SAMPLE.replace(/\n/g, "\r\n")).words).toEqual([
      "a",
      "can't",
      "dizzy",
      "headache",
    ]);
  });

  it('refuses a download with no "---" line', () => {
    expect(() => parseWordList("Copyright 2000\nword\n")).toThrow(/---/);
  });

  it("refuses a download with no copyright notice", () => {
    expect(() => parseWordList("Some header\n---\nword\n")).toThrow(/copyright/);
  });

  it("refuses a download with no words", () => {
    expect(() => parseWordList("Copyright 2000\n---\n\n")).toThrow(/no words/);
  });
});

describe("buildWordFile", () => {
  it("records the source URL, date, checksum, license, notice, and count", () => {
    const file = buildWordFile(bytes, "2026-11-23");
    expect(file.source_url).toBe(SOURCE_URL);
    expect(file.source).toMatch(/SCOWL/);
    expect(file.downloaded_on).toBe("2026-11-23");
    expect(file.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(file.license).toMatch(/copyright notice/);
    expect(file.notice).toMatch(/Copyright 2000-2026 by Kevin Atkinson/);
    expect(file.count).toBe(4);
    expect(file.words).toHaveLength(4);
  });

  it("refuses a badly written date", () => {
    expect(() => buildWordFile(bytes, "11/23/2026")).toThrow(/download date/);
  });
});
