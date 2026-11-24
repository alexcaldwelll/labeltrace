// T056: the second-AI grader client (OpenAI).
//
// It grades one finished reply with the grader-v1 instructions and returns
// "pass" or "fail" plus a short reason (research R4). The question goes in only
// as ScrubbedText, so raw personal details can't reach the grader (FR-020).
//
// The model comes only from src/config/models.ts; nothing can pass in another one.
// The client refuses to start if the grader model ID is empty (it stays empty until
// T063 picks it) or if the grader comes from the same company as the answer model
// (FR-034).
//
// The "server-only" line makes the build fail if browser code imports this file,
// so the OpenAI key can never be sent to a user's browser.
import "server-only";

import OpenAI from "openai";
import { z } from "zod";
import { ANSWER_MODEL, GRADER_MODEL } from "@/config/models";
import type { GradeReply, GradeRequest, GraderClient } from "@/lib/ai/types";
import { GRADER_INSTRUCTIONS, buildGraderInput } from "@/lib/prompts/grader-v1";

const replySchema = z.strictObject({
  grade: z.enum(["pass", "fail"]),
  reason: z.string(),
});

/** The reply shape OpenAI is asked to follow (Structured Outputs). */
const REPLY_FORMAT = {
  type: "json_schema",
  name: "grade",
  strict: true,
  schema: {
    type: "object",
    properties: {
      grade: { type: "string", enum: ["pass", "fail"] },
      reason: { type: "string" },
    },
    required: ["grade", "reason"],
    additionalProperties: false,
  },
} as const;

/** Creates the grader client. Throws if the model settings or the API key are wrong. */
export function createGraderClient(): GraderClient {
  const model: string = GRADER_MODEL.id;
  const graderCompany: string = GRADER_MODEL.company;
  const answerCompany: string = ANSWER_MODEL.company;

  if (model.trim() === "") {
    throw new Error("The grader model is empty in src/config/models.ts. Task T063 picks it.");
  }
  if (graderCompany === answerCompany) {
    throw new Error(
      `The grader must come from a different company than the answer model (FR-034); both are "${graderCompany}".`,
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set, so the grader can't start.");
  }

  const openai = new OpenAI({ apiKey });

  return {
    async grade(request: GradeRequest): Promise<GradeReply> {
      const response = await openai.responses.create({
        model,
        instructions: GRADER_INSTRUCTIONS,
        input: buildGraderInput(request),
        text: { format: REPLY_FORMAT },
      });

      let raw: unknown;
      try {
        raw = JSON.parse(response.output_text);
      } catch {
        throw new Error("The grader's reply was not valid JSON.");
      }
      const result = replySchema.safeParse(raw);
      if (!result.success) {
        throw new Error(
          `The grader's reply had the wrong shape: ${result.error.issues
            .map((issue) => `${issue.path.join(".") || "reply"}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      return result.data;
    },
  };
}
