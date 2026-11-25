// T063: the grader calibration set loader.
//
// Reads tests/ai/grader/calibration.json (a list of hand-made graded examples) and
// checks each entry's shape. `checked_by` and `checked_on` are required (FR-044,
// constitution VIII): the owner fills them in after checking the entry against the
// real label (T066). `checked_on` must be a real date written as YYYY-MM-DD. One bad
// entry stops the whole load, with a message naming the entry.
//
// Each entry names label sections by their openFDA field (`section_keys`). The loader
// takes their text word for word from the saved openFDA labels
// (tests/fixtures/openfda/), so the label text is the real label's.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { labelSections, type LabelSection } from "@/lib/labels/sections";
import { isRealDate } from "../questions/load";

/** The real calibration set. */
export const CALIBRATION_FILE = fileURLToPath(new URL("./calibration.json", import.meta.url));

const nonBlank = z.string().trim().min(1, "must not be blank");

export const calibrationEntrySchema = z.strictObject({
  id: nonBlank,
  drug: z.enum(["emgality", "reyvow"]),
  question: nonBlank,
  section_keys: z.array(nonBlank),
  answer: nonBlank,
  expected_grade: z.enum(["pass", "fail"]),
  mistake: z.enum(["added_fact", "wrong_section", "changed_number", "other_drug_fact"]).optional(),
  checked_by: nonBlank,
  checked_on: z.string().refine(isRealDate, {
    message: "must be a real date written as YYYY-MM-DD",
  }),
});

export type CalibrationEntry = z.infer<typeof calibrationEntrySchema> & {
  /** The named label sections, with their text from the saved openFDA label. */
  sections: LabelSection[];
};

function savedLabelSections(drug: "emgality" | "reyvow"): LabelSection[] {
  const url = new URL(`../../fixtures/openfda/${drug}.json`, import.meta.url);
  const reply = JSON.parse(readFileSync(url, "utf8")) as { results: Record<string, unknown>[] };
  const record = reply.results[0];
  if (!record) throw new Error(`No label in the saved ${drug} openFDA file`);
  return labelSections(record);
}

/**
 * Checks a list of raw calibration entries and adds each one's label sections.
 * Throws on the first bad entry.
 */
export function parseCalibrationEntries(raw: unknown): CalibrationEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("The calibration file must hold a list (JSON array) of entries");
  }
  const labels = new Map<string, LabelSection[]>();
  const seenIds = new Set<string>();
  return raw.map((item: unknown, index) => {
    const result = calibrationEntrySchema.safeParse(item);
    const id =
      typeof item === "object" && item !== null && "id" in item ? ` (id "${String(item.id)}")` : "";
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "entry"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Calibration entry ${index + 1}${id} refused: ${issues}`);
    }
    const entry = result.data;
    // Y1: every id is used once.
    if (seenIds.has(entry.id)) {
      throw new Error(`Calibration entry ${index + 1}${id} refused: id is already used`);
    }
    seenIds.add(entry.id);
    // Y2: a bad answer must say what its mistake is; a good one must not have one.
    if (entry.expected_grade === "fail" && entry.mistake === undefined) {
      throw new Error(
        `Calibration entry ${index + 1}${id} refused: mistake is required when expected_grade is "fail"`,
      );
    }
    if (entry.expected_grade === "pass" && entry.mistake !== undefined) {
      throw new Error(
        `Calibration entry ${index + 1}${id} refused: mistake is not allowed when expected_grade is "pass"`,
      );
    }
    if (!labels.has(entry.drug)) labels.set(entry.drug, savedLabelSections(entry.drug));
    const all = labels.get(entry.drug) ?? [];
    const sections = entry.section_keys.map((key) => {
      const section = all.find((s) => s.field_key === key);
      if (!section) {
        throw new Error(
          `Calibration entry ${index + 1}${id} refused: the saved ${entry.drug} label has no section "${key}"`,
        );
      }
      return section;
    });
    return { ...entry, sections };
  });
}

/** Loads and checks the calibration set. Throws if any entry is refused. */
export function loadCalibrationSet(file: string = CALIBRATION_FILE): CalibrationEntry[] {
  return parseCalibrationEntries(JSON.parse(readFileSync(file, "utf8")));
}
