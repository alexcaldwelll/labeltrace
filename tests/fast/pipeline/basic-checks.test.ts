// T013: the basic checks (blank, too long, not English), the disclaimer, the
// short-question rule, and POST /api/ask.
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ask/route";
import * as pipeline from "@/lib/pipeline/ask";
import {
  ask,
  DISCLAIMER,
  ENGLISH_ONLY_TEXT,
  MAX_QUESTION_LENGTH,
  PROMPT_FOR_QUESTION_TEXT,
} from "@/lib/pipeline/ask";
import englishWords from "@/lib/pipeline/english-words.json";
import { isEnglish } from "@/lib/pipeline/language";

// ask() still runs for real; the mock only records what it was called with.
vi.mock("@/lib/pipeline/ask", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/pipeline/ask")>();
  return { ...real, ask: vi.fn(real.ask) };
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const ENGLISH_QUESTION = "Does Emgality cause injection site pain?";
const SPANISH_QUESTION = "¿Reyvow causa náuseas y mareos después de tomarlo?";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("blank questions", () => {
  it.each(["", "   ", "\n\t "])("%j → prompt_for_question", async (question) => {
    expect(await ask(question)).toEqual({
      kind: "prompt_for_question",
      text: PROMPT_FOR_QUESTION_TEXT,
      disclaimer: DISCLAIMER,
    });
  });
});

describe("long questions", () => {
  it("a 1,001-character question is cut and marked truncated", () => {
    const question = ENGLISH_QUESTION + " " + "a".repeat(1001 - ENGLISH_QUESTION.length - 1);
    expect(question).toHaveLength(1001);
    const result = pipeline.basicChecks(question);
    expect(result).toEqual({
      done: false,
      text: question.slice(0, MAX_QUESTION_LENGTH),
      truncated: true,
    });
  });

  it("the reply to a cut question says truncated: true", async () => {
    const question = ENGLISH_QUESTION.padEnd(1001, " pain");
    expect((await ask(question)).truncated).toBe(true);
  });

  it("a 1,000-character question is not cut", async () => {
    const question = ENGLISH_QUESTION.padEnd(1000, " pain");
    expect(pipeline.basicChecks(question)).toMatchObject({ done: false, truncated: false });
    expect(await ask(question)).not.toHaveProperty("truncated");
  });
});

describe("non-English questions", () => {
  it.each([
    SPANISH_QUESTION,
    "Est-ce que Emgality provoque des douleurs au site d'injection?",
    "Verursacht Reyvow Schwindel oder Müdigkeit bei Patienten?",
  ])("%s → english_only", async (question) => {
    expect(await ask(question)).toEqual({
      kind: "english_only",
      text: ENGLISH_ONLY_TEXT,
      disclaimer: DISCLAIMER,
    });
  });
});

describe("short questions (under 30 characters, FR-055)", () => {
  it('"chest pain?" counts as English', () => {
    expect(isEnglish("chest pain?")).toBe(true);
  });

  it('"¿Reyvow causa náuseas?" → english_only', async () => {
    expect(isEnglish("¿Reyvow causa náuseas?")).toBe(false);
    expect((await ask("¿Reyvow causa náuseas?")).kind).toBe("english_only");
  });

  it.each(["headache", "nausea", "injection", "dizzy", "dose", "migraine", "side effects"])(
    '"%s" counts as English',
    (question) => {
      expect(isEnglish(question)).toBe(true);
    },
  );

  it("our drug names and numbers count as words", () => {
    expect(isEnglish("Emgality 120 mg?")).toBe(true);
    expect(isEnglish("Reyvow's side effects?")).toBe(true);
    expect(isEnglish("lasmiditan 50 or 100?")).toBe(true);
    expect(isEnglish("galcanezumab dose")).toBe(true);
  });

  it("one unknown word makes a short question not English", () => {
    expect(isEnglish("Reyvow causa dolor?")).toBe(false);
  });

  it("a question with no words is not English", () => {
    expect(isEnglish("???")).toBe(false);
  });
});

describe("longer English questions", () => {
  it.each([
    ENGLISH_QUESTION,
    // franc-min alone reads these two as Dutch and French.
    "Can I drive after taking Reyvow tablets?",
    "Is it safe to take Reyvow while pregnant?",
    "What should I do if I miss a dose of Emgality?",
  ])("%s counts as English", (question) => {
    expect(isEnglish(question)).toBe(true);
  });
});

describe("the disclaimer is on every reply kind", () => {
  it.each([
    ["prompt_for_question", ""],
    ["english_only", SPANISH_QUESTION],
    ["try_again", ENGLISH_QUESTION],
  ])("%s", async (kind, question) => {
    const response = await post({ question });
    expect(response.status).toBe(200);
    const reply = await response.json();
    expect(reply.kind).toBe(kind);
    expect(reply.disclaimer).toBe("LabelTrace is an AI, not a doctor.");
  });
});

describe("POST /api/ask", () => {
  it("passes the FULL question to the pipeline; the cut happens later", async () => {
    const spy = vi.mocked(pipeline.ask);
    spy.mockClear();
    const question = ENGLISH_QUESTION.padEnd(1500, " pain");
    await post({ question });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(question);
    expect(spy.mock.calls[0]?.[0]).toHaveLength(1500);
  });

  it.each([
    ["not JSON", "this is not json"],
    ["no question", {}],
    ["question is not text", { question: 42 }],
  ])("a request with %s gets prompt_for_question", async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "prompt_for_question",
      text: PROMPT_FOR_QUESTION_TEXT,
      disclaimer: DISCLAIMER,
    });
  });

  it("never echoes the question or writes it to the console", async () => {
    const question = "Does Reyvow help? My name is Jane Testperson, 555-0100.";
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    );
    const text = await (await post({ question })).text();
    expect(text).not.toContain("Jane Testperson");
    expect(text).not.toContain("555-0100");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("english-words.json", () => {
  it("records its source URL, download date, checksum, license, and count", () => {
    expect(englishWords.source_url).toMatch(/^https:\/\/app\.aspell\.net\/create\?/);
    expect(englishWords.source_url).toContain("max_size=60");
    expect(englishWords.source_url).toContain("spelling=US");
    expect(englishWords.downloaded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(englishWords.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(englishWords.license).toMatch(/copyright notice/);
    expect(englishWords.notice).toMatch(/Copyright \d{4}-\d{4} by Kevin Atkinson/);
    expect(englishWords.count).toBe(englishWords.words.length);
    expect(englishWords.count).toBeGreaterThan(50_000);
  });
});
