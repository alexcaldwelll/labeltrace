// T021: build the `emergency` reply (FR-046, FR-049, FR-050, FR-051;
// contracts/emergency-rules.md section 5, contracts/api.md). Plain code, no AI.
//
// | Groups matched | Case          | Messages, in order | Label text?        |
// | Medical only   | Informational | MSG_911            | Yes (T020)         |
// | Medical only   | Happening now | MSG_911            | No                 |
// | Medical only   | Unclear       | MSG_911            | No                 |
// | Self-harm only | Any           | MSG_988            | No, never          |
// | Both           | Any           | MSG_911, MSG_988   | No, never          |
//
// If a label can't be read (none saved yet, or the database can't be reached), the
// informational reply shows "The label doesn't cover this." under MSG_911. The
// emergency message always shows; nothing is made up.
import type { CurrentLabelResult, Drug } from "@/lib/labels/store";
import { classifyMedical, type EmergencyCase } from "./classify";
import { detectEmergency } from "./detect";
import { drugsNamed, findExcerpts, type LabelExcerpt } from "./excerpts";
import { MSG_911, MSG_988 } from "./phrases";

export type GetLabel = (drug: Drug) => Promise<CurrentLabelResult>;

/** The emergency reply's own fields (ask.ts adds the disclaimer). */
export interface EmergencyReplyFields {
  kind: "emergency";
  /** The medical case; null when only self-harm phrases matched. */
  case: EmergencyCase | null;
  /** 911 first, then 988. */
  messages: string[];
  /** Only for medical-only informational questions; otherwise empty. */
  label_excerpts: LabelExcerpt[];
  /** True when an informational medical question found no label sentence. */
  not_covered: boolean;
}

/** Returns the emergency reply, or null when no emergency phrase matched. */
export async function buildEmergencyReply(
  rawText: string,
  getLabel: GetLabel,
): Promise<EmergencyReplyFields | null> {
  const match = detectEmergency(rawText);
  if (match.groups.length === 0) return null;

  const medical = match.groups.includes("medical");
  const selfHarm = match.groups.includes("self_harm");
  const messages = [...(medical ? [MSG_911] : []), ...(selfHarm ? [MSG_988] : [])];
  const emergencyCase = medical ? classifyMedical(rawText) : null;

  // Label text only for medical-only + informational. Never with any self-harm match.
  if (!medical || selfHarm || emergencyCase !== "informational") {
    return {
      kind: "emergency",
      case: emergencyCase,
      messages,
      label_excerpts: [],
      not_covered: false,
    };
  }

  const label_excerpts: LabelExcerpt[] = [];
  for (const drug of drugsNamed(rawText)) {
    let result: CurrentLabelResult;
    try {
      result = await getLabel(drug);
    } catch {
      continue; // Can't read the label: show "not covered" rather than fail.
    }
    if (result.found) label_excerpts.push(...findExcerpts(result.label, match.ids));
  }
  return {
    kind: "emergency",
    case: emergencyCase,
    messages,
    label_excerpts,
    not_covered: label_excerpts.length === 0,
  };
}
