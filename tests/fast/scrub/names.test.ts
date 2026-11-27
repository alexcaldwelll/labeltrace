// T032: the name masker (src/lib/scrub/names.ts; research R10, R22; spec PC-9), with
// the owner's decisions 1A, 2A, 3A (2026-11-27).
import { describe, expect, it } from "vitest";

import { matchDrugWord, OTHER_DRUG_NAMES, OUR_DRUG_NAMES } from "@/lib/refusals/drug-names";
import firstNamesFile from "@/lib/scrub/common-first-names.json";
import { COMMON_FIRST_NAMES, maskNames } from "@/lib/scrub/names";

describe("layer 1: intro phrases", () => {
  it.each([
    [
      "Hi, I'm Jane Doe, [EMAIL]. Does Emgality cause pain?",
      "Hi, I'm [NAME], [EMAIL]. Does Emgality cause pain?",
    ],
    ["my name is Sam Lee and I take Reyvow", "my name is [NAME] and I take Reyvow"],
    ["thanks, Pat", "thanks, [NAME]"],
  ])("%j", (text, expected) => {
    expect(maskNames(text)).toBe(expected);
  });

  it("doesn't mask a lowercase word after I'm (decision 3A)", () => {
    expect(maskNames("Can I take Reyvow while pregnant? I'm pregnant.")).toBe(
      "Can I take Reyvow while pregnant? I'm pregnant.",
    );
  });
});

describe("layer 2: the name finder (decision 1A)", () => {
  it.each([
    ["Bob Johnson said Reyvow made him dizzy.", "[NAME] said Reyvow made him dizzy."],
    ["Dr. Smith told me to ask about Emgality.", "Dr. [NAME] told me to ask about Emgality."],
    ["Can my wife Maria take Emgality?", "Can my wife [NAME] take Emgality?"],
  ])("%j", (text, expected) => {
    expect(maskNames(text)).toBe(expected);
  });

  it("leaves one English word alone at the start of a sentence", () => {
    expect(maskNames("Will Emgality make me tired?")).toBe("Will Emgality make me tired?");
  });
});

describe("layer 3: capitalized words mid-sentence", () => {
  it("masks an unknown capitalized word", () => {
    expect(maskNames("Ask Xochitl about Reyvow")).toBe("Ask [NAME] about Reyvow");
  });

  it("masks a common first name even if it's an English word (decision 2A)", () => {
    expect(maskNames("Can I buy Reyvow in May?")).toBe("Can I buy Reyvow in [NAME]?");
  });
});

describe("known words that are never masked", () => {
  it.each([
    "What are the side effects of Emgality and Reyvow?",
    "What does Warnings and Precautions say about Reyvow?",
    "Is Reyvow better than Imitrex?",
    "What are the side effects of Ubrelvy?",
    "Can I take Reyvow with Sumatriptan?",
  ])("%j", (text) => {
    expect(maskNames(text)).toBe(text);
  });

  it("leaves near-miss drug typos visible mid-sentence (PC-9)", () => {
    expect(maskNames("Is Imitrx like Reyvo for me?")).toBe("Is Imitrx like Reyvo for me?");
  });
});

/** Every word one change (a letter added, removed, or swapped) from `word`. */
function oneChangeFrom(word: string): Set<string> {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const out = new Set<string>();
  for (let i = 0; i <= word.length; i++) {
    if (i < word.length) out.add(word.slice(0, i) + word.slice(i + 1));
    for (const letter of letters) {
      out.add(word.slice(0, i) + letter + word.slice(i));
      if (i < word.length) out.add(word.slice(0, i) + letter + word.slice(i + 1));
    }
  }
  out.delete(word);
  return out;
}

/** Common first names one change from a drug name, that would count as its typo. */
function namesNearDrugs(names: ReadonlySet<string>): string[] {
  const drugNames = [...Object.keys(OUR_DRUG_NAMES), ...OTHER_DRUG_NAMES];
  const near = new Set<string>();
  for (const drugName of drugNames) {
    for (const variant of oneChangeFrom(drugName)) {
      if (names.has(variant)) near.add(variant);
    }
  }
  return [...near].filter((name) => matchDrugWord(name)?.typedAs !== undefined).sort();
}

describe("the first-name safeguard (PC-9)", () => {
  const capitalized = (name: string) => name[0]!.toUpperCase() + name.slice(1);

  it("masks every common first name one letter off a drug name", () => {
    const pairs = namesNearDrugs(COMMON_FIRST_NAMES);
    if (pairs.length > 0) {
      for (const name of pairs) {
        expect(maskNames(`Ask ${capitalized(name)} about it`), name).toBe("Ask [NAME] about it");
      }
    } else {
      // The real lists have no such pair: check a made-up one instead.
      expect(maskNames("Ask Reyvo about it", new Set(["reyvo"]))).toBe("Ask [NAME] about it");
    }
  });

  it("records its source and download date", () => {
    expect(firstNamesFile.source_url).toBe("https://www.ssa.gov/oact/babynames/names.zip");
    expect(firstNamesFile.downloaded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
