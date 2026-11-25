// T017: the emergency phrase list and the exact emergency messages
// (FR-005, FR-006, FR-007; contracts/emergency-rules.md sections 1 and 2).
//
// Copied exactly from the contract. Every id needs its own fast test (FR-010):
// tests/fast/emergency/phrase-coverage.test.ts fails if any id here has none in
// tests/fast/emergency/phrases.test.ts. There is no skip list (contract section 3,
// rule 5): real words that fall inside the typo allowance still match.

/** Shown for a medical emergency phrase (contract section 1). */
export const MSG_911 = "Call 911 or see a doctor now.";

/** Shown for a self-harm phrase (contract section 1). */
export const MSG_988 =
  "You can call or text 988 to reach the 988 Suicide & Crisis Lifeline, any time. If you are in immediate danger, call 911.";

/** Shown for an informational medical question when the label has no matching sentence. */
export const MSG_NOT_COVERED = "The label doesn't cover this.";

export type EmergencyGroup = "medical" | "self_harm";

export interface EmergencyPhrase {
  id: string;
  group: EmergencyGroup;
  /** The main phrase. */
  phrase: string;
  /** Other wordings that count as the same phrase. */
  variants: readonly string[];
}

export const EMERGENCY_PHRASES = [
  // Medical (shows MSG_911)
  {
    id: "worst_headache",
    group: "medical",
    phrase: "worst headache of my life",
    variants: ["worst headache ever", "worst headache i've ever had"],
  },
  {
    id: "sudden_numbness",
    group: "medical",
    phrase: "sudden numbness",
    variants: ["suddenly numb"],
  },
  {
    id: "sudden_weakness",
    group: "medical",
    phrase: "sudden weakness",
    variants: ["suddenly weak"],
  },
  {
    id: "trouble_speaking",
    group: "medical",
    phrase: "trouble speaking",
    variants: ["can't speak", "slurred speech", "trouble talking"],
  },
  {
    id: "fainting",
    group: "medical",
    phrase: "fainting",
    variants: ["fainted", "faint", "passed out"],
  },
  {
    id: "chest_pain",
    group: "medical",
    phrase: "chest pain",
    variants: ["chest hurts", "chest tightness"],
  },
  {
    id: "trouble_breathing",
    group: "medical",
    phrase: "trouble breathing",
    variants: ["can't breathe", "short of breath", "hard to breathe"],
  },
  {
    id: "swollen_face",
    group: "medical",
    phrase: "swollen face",
    variants: ["face swelling", "face is swollen"],
  },
  { id: "swollen_lips", group: "medical", phrase: "swollen lips", variants: ["lips swelling"] },
  {
    id: "swollen_throat",
    group: "medical",
    phrase: "swollen throat",
    variants: ["throat swelling", "throat closing"],
  },
  // Added 2026-11-25 (owner's decision; contract section 2).
  {
    id: "seizure",
    group: "medical",
    phrase: "seizure",
    variants: ["seizures", "having a seizure"],
  },
  {
    id: "anaphylaxis",
    group: "medical",
    phrase: "anaphylaxis",
    variants: ["anaphylactic", "anaphylactic shock", "severe allergic reaction"],
  },
  {
    id: "swollen_tongue",
    group: "medical",
    phrase: "swollen tongue",
    variants: ["tongue swelling", "tongue is swollen"],
  },
  {
    id: "accidental_overdose",
    group: "medical",
    phrase: "took too much",
    variants: ["took too many", "taken too much", "taken too many", "overdosed on"],
  },
  {
    id: "face_drooping",
    group: "medical",
    phrase: "face drooping",
    variants: ["drooping face", "facial droop"],
  },
  {
    id: "sudden_vision_loss",
    group: "medical",
    phrase: "sudden vision loss",
    variants: ["suddenly can't see", "lost my vision"],
  },
  {
    id: "sudden_confusion",
    group: "medical",
    phrase: "sudden confusion",
    variants: ["suddenly confused"],
  },
  { id: "having_a_stroke", group: "medical", phrase: "having a stroke", variants: [] },
  // Self-harm (shows MSG_988)
  {
    id: "kill_myself",
    group: "self_harm",
    phrase: "kill myself",
    variants: ["kill my self", "killing myself"],
  },
  { id: "want_to_die", group: "self_harm", phrase: "want to die", variants: ["wanna die"] },
  { id: "suicide", group: "self_harm", phrase: "suicide", variants: ["suicidal"] },
  {
    id: "hurt_myself",
    group: "self_harm",
    phrase: "hurt myself",
    variants: ["hurt my self", "hurting myself"],
  },
  { id: "end_my_life", group: "self_harm", phrase: "end my life", variants: ["ending my life"] },
  {
    id: "overdose_on_purpose",
    group: "self_harm",
    phrase: "overdose on purpose",
    variants: ["overdose intentionally"],
  },
  // Added 2026-11-25 (owner's decision; contract section 2).
  { id: "end_it_all", group: "self_harm", phrase: "end it all", variants: ["ending it all"] },
  { id: "better_off_dead", group: "self_harm", phrase: "better off dead", variants: [] },
  {
    id: "dont_want_to_be_alive",
    group: "self_harm",
    phrase: "don't want to be alive",
    variants: ["do not want to be alive", "don't want to live"],
  },
  { id: "self_harm", group: "self_harm", phrase: "self harm", variants: ["self harming"] },
  { id: "cut_myself", group: "self_harm", phrase: "cut myself", variants: ["cutting myself"] },
  { id: "no_reason_to_live", group: "self_harm", phrase: "no reason to live", variants: [] },
] as const satisfies readonly EmergencyPhrase[];

export type EmergencyPhraseId = (typeof EMERGENCY_PHRASES)[number]["id"];
