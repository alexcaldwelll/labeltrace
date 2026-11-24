// T013: POST /api/ask (contracts/api.md).
//
// Checks the request's shape, then passes the FULL question to the question steps
// in src/lib/pipeline/ask.ts. The 1,000-character cut happens there, after the
// emergency check, so an emergency phrase late in a long question is still caught.
//
// Privacy: this route never logs, saves, or sends back the raw question (FR-021).
// A request in the wrong shape (not JSON, or no text `question`) is treated as a
// blank question, so it gets "Please type a question." The bad body is never shown
// in the reply or the logs.
import { z } from "zod";

import { ask } from "@/lib/pipeline/ask";

const AskRequest = z.object({ question: z.string() });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const parsed = AskRequest.safeParse(body);
  const question = parsed.success ? parsed.data.question : "";
  // Always HTTP 200 with one of the contract's reply shapes.
  return Response.json(await ask(question));
}
