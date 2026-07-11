import { describe, expect, it } from "vitest";

import { normalizeModelConnection } from "../src/index.js";

describe("normalizeModelConnection", () => {
  it("normalizes an OpenAI-compatible BYOK connection", () => {
    expect(
      normalizeModelConnection({
        kind: "byok",
        baseUrl: "https://api.deepseek.com/ ",
        model: " deepseek-chat ",
        credentialId: "deepseek-primary",
      }),
    ).toEqual({
      kind: "byok",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      credentialId: "deepseek-primary",
    });
  });

  it("requires an HTTPS endpoint", () => {
    expect(() =>
      normalizeModelConnection({
        kind: "byok",
        baseUrl: "http://api.deepseek.com",
        model: "deepseek-chat",
        credentialId: "deepseek-primary",
      }),
    ).toThrow("Model endpoint must use HTTPS");
  });

  it("requires a model name", () => {
    expect(() =>
      normalizeModelConnection({
        kind: "byok",
        baseUrl: "https://api.deepseek.com",
        model: "   ",
        credentialId: "deepseek-primary",
      }),
    ).toThrow("Model name is required");
  });

  it("requires a credential id", () => {
    expect(() =>
      normalizeModelConnection({
        kind: "byok",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        credentialId: "   ",
      }),
    ).toThrow("Credential id is required");
  });
});
