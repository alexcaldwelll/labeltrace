// T020: label sentences for an informational medical emergency question (FR-048;
// contracts/emergency-rules.md section 6). Plain code, no AI.
//
// - The drug comes from a drug name spelled exactly (any capitals). Generic names map
//   to their brand: galcanezumab → emgality, lasmiditan → reyvow. If both drugs are
//   named, both labels are checked.
// - Each section of the drug's current saved label is split into sentences. Every
//   sentence that matches ANY wording of a matched phrase (same matching rules as the
//   emergency check, T016) is kept, word for word, grouped by section, with the
//   section name and label date.
// - No matching sentence → the caller shows "The label doesn't cover this."
import { phraseMatches, words } from "@/lib/text/match";
// Type-only import: nothing from the server-only label store is loaded here.
import type { CurrentLabel, Drug } from "@/lib/labels/store";
import { EMERGENCY_PHRASES, type EmergencyPhraseId } from "./phrases";

/** One section's matching sentences (contracts/api.md, `label_excerpts`). */
export interface LabelExcerpt {
  drug: Drug;
  section: string;
  label_date: string;
  sentences: string[];
}

/** Exact drug names (brand and generic) → the brand whose label is used. */
export const DRUG_NAME_TO_BRAND: Readonly<Record<string, Drug>> = {
  emgality: "emgality",
  galcanezumab: "emgality",
  reyvow: "reyvow",
  lasmiditan: "reyvow",
};

/** The drugs named in the question with an exact spelling, in a fixed order. */
export function drugsNamed(rawText: string): Drug[] {
  const found = new Set<Drug>();
  for (const word of words(rawText)) {
    const brand = DRUG_NAME_TO_BRAND[word];
    if (brand) found.add(brand);
  }
  return (["emgality", "reyvow"] as const).filter((drug) => found.has(drug));
}

/** Splits label text into sentences at ".", "!", or "?" followed by a space. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/** Every sentence in the label that matches a wording of one of the matched phrases. */
export function findExcerpts(
  label: CurrentLabel,
  ids: readonly EmergencyPhraseId[],
): LabelExcerpt[] {
  const wordings = EMERGENCY_PHRASES.filter((entry) => ids.includes(entry.id)).flatMap((entry) => [
    entry.phrase,
    ...entry.variants,
  ]);
  const excerpts: LabelExcerpt[] = [];
  for (const section of label.sections) {
    const sentences = splitSentences(section.text).filter((sentence) =>
      wordings.some((wording) => phraseMatches(sentence, wording)),
    );
    if (sentences.length > 0) {
      excerpts.push({
        drug: label.drug,
        section: section.display_name,
        label_date: label.labelDate,
        sentences,
      });
    }
  }
  return excerpts;
}
