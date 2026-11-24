// T025: the AI-tier answer-key loader.
//
// Reads every `.json` file in tests/ai/questions/ and checks each entry against
// data-model.md "Test questions and answer key". Each file holds a list (JSON array)
// of entries. One bad entry stops the whole load, with a message naming the file and
// the entry, so a broken or unchecked entry can never be quietly skipped.
//
// Rules enforced here:
// - `checked_by` and `checked_on` are required (FR-044, constitution VIII). The owner
//   fills them in after checking the entry against the real label (T066).
//   `checked_on` must be a real calendar date written as YYYY-MM-DD.
// - `category` is one of the 8 allowed values.
// - Blank and non-English questions aren't allowed in the AI tier (research R15).
//   English is decided by the app's own language check, so the two can't disagree.
// - Every `id` is unique across all files.
//
// An empty or missing folder gives an empty list. Deciding that a run with nothing
// to check fails belongs to the AI-tier runner (T073), not to this loader.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isEnglish } from "@/lib/pipeline/language";

export const CATEGORIES = [
  "normal",
  "refusal_dosing",
  "refusal_compare",
  "refusal_other_drug",
  "not_covered",
  "three_ways",
  "privacy",
  "emergency",
] as const;

/** The folder the real answer key lives in. */
export const QUESTIONS_DIR = fileURLToPath(new URL(".", import.meta.url));

const nonBlank = z.string().trim().min(1, "must not be blank");

/** True only for a real calendar date written as YYYY-MM-DD (so 2026-02-30 is refused). */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const answerKeyEntrySchema = z.strictObject({
  id: nonBlank,
  category: z.enum(CATEGORIES),
  drug: z.enum(["emgality", "reyvow", "both"]).nullable().optional(),
  question: nonBlank.refine(isEnglish, {
    message: "must be in English (the AI tier never sends non-English questions, research R15)",
  }),
  expected_behavior: nonBlank,
  expected_facts: z.array(nonBlank),
  expected_sections: z.array(nonBlank),
  checked_by: nonBlank,
  checked_on: z.string().refine(isRealDate, {
    message: "must be a real date written as YYYY-MM-DD",
  }),
  three_ways_group: nonBlank.optional(),
});

export type AnswerKeyEntry = z.infer<typeof answerKeyEntrySchema>;

const fileSchema = z.array(z.unknown());

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "entry"}: ${issue.message}`)
    .join("; ");
}

/**
 * Checks a list of raw entries. `source` names where they came from, for error
 * messages. Throws on the first bad entry.
 */
export function parseAnswerKeyEntries(raw: unknown, source: string): AnswerKeyEntry[] {
  const list = fileSchema.safeParse(raw);
  if (!list.success) {
    throw new Error(`${source}: the file must hold a list (JSON array) of entries`);
  }
  return list.data.map((item, index) => {
    const result = answerKeyEntrySchema.safeParse(item);
    if (!result.success) {
      const id =
        typeof item === "object" && item !== null && "id" in item
          ? ` (id "${String(item.id)}")`
          : "";
      throw new Error(
        `${source}, entry ${index + 1}${id} refused: ${describeIssues(result.error)}`,
      );
    }
    return result.data;
  });
}

/** Loads and checks every `.json` file in `dir`. Throws if any entry is refused. */
export function loadAnswerKey(dir: string = QUESTIONS_DIR): AnswerKeyEntry[] {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const entries: AnswerKeyEntry[] = [];
  const seen = new Map<string, string>();
  for (const name of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch (error) {
      throw new Error(`${name}: not valid JSON (${(error as Error).message})`);
    }
    for (const entry of parseAnswerKeyEntries(raw, name)) {
      const firstFile = seen.get(entry.id);
      if (firstFile !== undefined) {
        throw new Error(`${name}: id "${entry.id}" is already used in ${firstFile}`);
      }
      seen.set(entry.id, name);
      entries.push(entry);
    }
  }
  return entries;
}
