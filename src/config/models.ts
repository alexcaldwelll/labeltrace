// T009: which AI models the app uses.
//
// These names are written here on purpose and never read from a setting, so a
// model can only change through a reviewed pull request.

/** The model that writes answers for users. */
export const ANSWER_MODEL = {
  id: "claude-haiku-5-5",
  company: "anthropic",
} as const;

/**
 * The model that grades answers in the AI tests. It comes from a different
 * company than the answer model. Its ID stays empty until T063 picks it.
 */
export const GRADER_MODEL = {
  id: "",
  company: "openai",
} as const;
