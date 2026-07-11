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

  it("normalizes an HTTPS endpoint with a path", () => {
    expect(
      normalizeModelConnection({
        kind: "byok",
        baseUrl: "https://gateway.example.com/v1///",
        model: "deepseek-chat",
        credentialId: "deepseek-primary",
      }).baseUrl,
    ).toBe("https://gateway.example.com/v1");
  });

  it.each([
    "https://user:secret@api.deepseek.com/v1",
    "https://api.deepseek.com/v1?region=cn",
    "https://api.deepseek.com/v1#models",
    "https://",
  ])("rejects an invalid endpoint: %s", (baseUrl) => {
    expect(() =>
      normalizeModelConnection({
        kind: "byok",
        baseUrl,
        model: "deepseek-chat",
        credentialId: "deepseek-primary",
      }),
    ).toThrow("Model endpoint is invalid");
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

  it("rejects a credential id that Secure Store cannot use", () => {
    expect(() =>
      normalizeModelConnection({
        kind: "byok",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        credentialId: "deepseek:primary",
      }),
    ).toThrow("Credential id contains invalid characters");
  });
});
