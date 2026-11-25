// T018: find emergency phrases in a question (FR-004, FR-009;
// contracts/emergency-rules.md section 3). Plain code, no AI. It runs on the raw
// question in memory, before scrubbing or anything else.
import { phraseMatches } from "@/lib/text/match";
import { EMERGENCY_PHRASES, type EmergencyGroup, type EmergencyPhraseId } from "./phrases";

export interface EmergencyMatch {
  /** Every phrase id that matched, in phrase-list order. */
  ids: EmergencyPhraseId[];
  /** The groups those ids belong to: medical first, then self_harm. Empty if none. */
  groups: EmergencyGroup[];
}

export function detectEmergency(rawText: string): EmergencyMatch {
  const ids: EmergencyPhraseId[] = [];
  const found = new Set<EmergencyGroup>();
  for (const entry of EMERGENCY_PHRASES) {
    const wordings = [entry.phrase, ...entry.variants];
    if (wordings.some((wording) => phraseMatches(rawText, wording))) {
      ids.push(entry.id);
      found.add(entry.group);
    }
  }
  const groups = (["medical", "self_harm"] as const).filter((group) => found.has(group));
  return { ids, groups };
}
