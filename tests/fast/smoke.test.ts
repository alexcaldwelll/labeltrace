import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { NO_AI_MESSAGE } from "./stubs/no-ai-client";

describe("fast test setup", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });

  it("gives fast tests a stand-in instead of the real AI clients", () => {
    expect(() => new Anthropic()).toThrow(NO_AI_MESSAGE);
    expect(() => new OpenAI()).toThrow(NO_AI_MESSAGE);
  });
});
