// T009: which AI models the app uses.
//
// These names are written here on purpose and never read from a setting, so a
// model can only change through a reviewed pull request.

/** The model that writes answers for users. */
export const ANSWER_MODEL = {
  id: "claude-haiku-5-5",
  company: "anthropic",
} as const;

/** The reasoning effort settings the grader may use. A typo here fails the type check. */
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * The model that grades answers in the AI tests. It comes from a different
 * company than the answer model. Picked by grader calibration (T063, research R4).
 */
export const GRADER_MODEL = {
  id: "gpt-6-luna",
  company: "openai",
  reasoningEffort: "low",
} as const satisfies { id: string; company: string; reasoningEffort: ReasoningEffort };
