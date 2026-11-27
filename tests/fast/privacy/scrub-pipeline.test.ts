// T033: scrubbing is step 3 (src/lib/scrub/index.ts, src/lib/pipeline/ask.ts; FR-020,
// FR-021; research R10, R18). Owner's decision 1A (2026-11-27): no step sends the
// question to an AI yet (the dosing AI gets a fixed app sentence, and the answer AI
// comes in T040), so this checks what step 4 receives and that the fake AI never sees
// a raw detail. T040 extends it to the answer AI's input.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetLabel } from "@/lib/emergency/respond";
import type { AskDeps } from "@/lib/pipeline/ask";
import type { CurrentLabel } from "@/lib/labels/store";
import { FakeAnswerClient } from "../../helpers/fake-ai";

// Spies that still run the real code, so the test sees what each step was given.
const spies = vi.hoisted(() => ({ refusal: vi.fn(), scrub: vi.fn() }));
vi.mock("@/lib/refusals/respond", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/refusals/respond")>();
  spies.refusal.mockImplementation(real.buildRefusalReply);
  return { ...real, buildRefusalReply: spies.refusal };
});
vi.mock("@/lib/scrub", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/scrub")>();
  spies.scrub.mockImplementation(real.scrub);
  return { ...real, scrub: spies.scrub };
});

const { ask, TRY_AGAIN_TEXT } = await import("@/lib/pipeline/ask");
const { serverLog } = await import("@/lib/log/server-log");
const { scrub } = await import("@/lib/scrub");

const SCENARIO_1 =
  "Hi, I'm Jane Doe, jane@example.com, 555-123-4567. Does Emgality cause injection site pain?";
const DETAILS = ["Jane", "Doe", "jane@example.com", "555-123-4567"];

/** True if `detail` appears as a whole word (so "Doe" doesn't match "Does"). */
function hasDetail(text: string, detail: string): boolean {
  const escaped = detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

const label = (drug: "emgality" | "reyvow"): CurrentLabel => ({
  drug,
  labelId: `${drug}-id`,
  setId: `${drug}-set`,
  labelDate: "2026-06-05",
  sections: [
    {
      field_key: "dosage_and_administration",
      display_name: "Dosage and Administration",
      text: "The recommended dose is 120 mg injected subcutaneously once monthly.",
    },
  ],
});
const getLabel: GetLabel = async (drug) => ({ found: true, label: label(drug) });

/** Everything the console and the server logger were given, as one string. */
function everythingLogged(): string {
  const calls = [
    ...vi.mocked(console.log).mock.calls,
    ...vi.mocked(console.info).mock.calls,
    ...vi.mocked(console.warn).mock.calls,
    ...vi.mocked(console.error).mock.calls,
    ...vi.mocked(console.debug).mock.calls,
    ...vi.mocked(serverLog.info).mock.calls,
    ...vi.mocked(serverLog.noQuestion).mock.calls,
    ...vi
      .mocked(serverLog.error)
      .mock.calls.map(([event, error]) => [
        event,
        error instanceof Error ? error.message : String(error),
      ]),
  ];
  return calls.map((args) => args.map((arg) => JSON.stringify(arg)).join(" ")).join("\n");
}

/** The logger's own output (what reaches Netlify's logs). */
function consoleOutput(): string {
  return [...vi.mocked(console.info).mock.calls, ...vi.mocked(console.error).mock.calls]
    .map((args) => args.join(" "))
    .join("\n");
}

beforeEach(() => {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  vi.spyOn(serverLog, "info");
  vi.spyOn(serverLog, "noQuestion");
  vi.spyOn(serverLog, "error");
  spies.refusal.mockClear();
  spies.scrub.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("US5 scenario 1", () => {
  it("step 4 gets the masked question, and the AI never sees a raw detail", async () => {
    const ai = new FakeAnswerClient();
    await ask(SCENARIO_1, { getLabel, answerAI: ai });
    expect(spies.refusal).toHaveBeenCalledTimes(1);
    expect(spies.refusal.mock.calls[0]![0]).toBe(
      "Hi, I'm [NAME], [EMAIL], [PHONE]. Does Emgality cause injection site pain?",
    );
    const sentToAI = JSON.stringify(ai.calls);
    for (const detail of DETAILS) expect(hasDetail(sentToAI, detail), detail).toBe(false);
    expect(everythingLogged()).not.toContain(SCENARIO_1);
  });
});

describe("the raw text never reaches the console or the server logger", () => {
  it("when the dosing AI throws", async () => {
    const question = "I'm Maria Lopez, maria@example.com. How much Reyvow should I take?";
    const ai = new FakeAnswerClient(() => {
      throw new Error("AI down");
    });
    await ask(question, { getLabel, answerAI: ai });
    expect(ai.calls).toHaveLength(1);
    expect(JSON.stringify(ai.calls)).not.toContain("Maria");
    const logged = everythingLogged();
    for (const detail of [question, "Maria", "Lopez", "maria@example.com"]) {
      expect(hasDetail(logged, detail), detail).toBe(false);
    }
  });
});

// Owner-approved (2026-11-27): the catch-all in ask.ts.
describe("an unexpected error in a step", () => {
  it("gets try again later, and the log holds [QUESTION] and no raw detail", async () => {
    // A test-only way to make a step throw: reading getLabel fails, with the raw
    // question in the error message.
    const deps = {} as AskDeps;
    Object.defineProperty(deps, "getLabel", {
      get() {
        throw new Error(`Step failed for: ${SCENARIO_1}`);
      },
    });
    const reply = await ask(SCENARIO_1, deps);
    expect(reply).toMatchObject({ kind: "try_again", text: TRY_AGAIN_TEXT });
    expect(serverLog.error).toHaveBeenCalledTimes(1);
    const output = consoleOutput();
    expect(output).toContain("Step failed for: [QUESTION]");
    for (const detail of [SCENARIO_1, ...DETAILS]) {
      expect(hasDetail(output, detail), detail).toBe(false);
    }
  });
});

// Owner-approved (2026-11-27, item 7).
describe("scrub()", () => {
  it("masks emails before names", () => {
    expect(scrub("jane@example.com")).toBe("[EMAIL]");
  });

  it("leaves a question with no personal details unchanged", () => {
    const question = "Does Emgality cause injection site pain?";
    expect(scrub(question)).toBe(question);
  });

  it("blank and non-English questions never reach the scrubber", async () => {
    await ask("   ", { getLabel });
    await ask("¿Cuáles son los efectos secundarios de este medicamento para la migraña?", {
      getLabel,
    });
    expect(spies.scrub).not.toHaveBeenCalled();
  });
});
