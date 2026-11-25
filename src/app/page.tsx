"use client";

// The question page (T014). A text box and an Ask button that send the question
// to POST /api/ask (contracts/api.md), then show the reply's text.
//
// The "AI, not a doctor" banner is NOT here: it is in the shared layout
// (src/app/layout.tsx), so it shows on every page.
//
// Emergency replies are shown by EmergencyReply (T023): their messages come first in
// the reply area, 911 above 988. T041 adds answers, refusals, and the other kinds.
//
// Privacy: the question is only sent to /api/ask. It is never logged or saved here.
import { useState } from "react";

import EmergencyReply from "@/components/EmergencyReply";
// Type-only import: no pipeline code is sent to the browser.
import type { AskReply } from "@/lib/pipeline/ask";

const ERROR_TEXT = "Sorry, something went wrong. Please try again.";

export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [replyText, setReplyText] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<Extract<AskReply, { kind: "emergency" }> | null>(null);
  const [asking, setAsking] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAsking(true);
    setReplyText(null);
    setEmergency(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) {
        setReplyText(ERROR_TEXT);
        return;
      }
      const reply = (await response.json()) as AskReply;
      if (reply.kind === "emergency") {
        setEmergency(reply);
        return;
      }
      setReplyText("text" in reply && typeof reply.text === "string" ? reply.text : ERROR_TEXT);
    } catch {
      setReplyText(ERROR_TEXT);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main>
      <h1>Ask about Emgality or Reyvow</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="question">Your question</label>
        <textarea
          id="question"
          name="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
        />
        <button type="submit" disabled={asking}>
          {asking ? "Asking..." : "Ask"}
        </button>
      </form>
      <section aria-live="polite">
        {emergency !== null && <EmergencyReply reply={emergency} />}
        {replyText !== null && <p>{replyText}</p>}
      </section>
    </main>
  );
}
