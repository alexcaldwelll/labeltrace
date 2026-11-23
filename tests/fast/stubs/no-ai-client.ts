// Stand-in for the real AI clients (@anthropic-ai/sdk and openai), used only
// in the fast tests (see vitest.config.ts). Fast tests must make no AI calls,
// so creating a client here stops the test with a clear message.

export const NO_AI_MESSAGE =
  "Fast tests can't call AI. Use vi.mock() to give this test a fake AI client.";

class NoAiClient {
  constructor() {
    throw new Error(NO_AI_MESSAGE);
  }
}

export { NoAiClient as Anthropic, NoAiClient as OpenAI };
export default NoAiClient;
