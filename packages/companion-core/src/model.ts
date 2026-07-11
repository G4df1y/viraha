export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ByokModelConnection {
  kind: "byok";
  baseUrl: string;
  model: string;
  credentialId: string;
}

export type ModelConnection = ByokModelConnection;

export function normalizeModelConnection(
  input: ByokModelConnection,
): ByokModelConnection {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const model = input.model.trim();
  const credentialId = input.credentialId.trim();

  if (!/^https:\/\//.test(baseUrl)) {
    throw new Error("Model endpoint must use HTTPS");
  }
  if (!model) {
    throw new Error("Model name is required");
  }
  if (!credentialId) {
    throw new Error("Credential id is required");
  }

  return { kind: "byok", baseUrl, model, credentialId };
}
