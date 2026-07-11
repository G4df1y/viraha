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
  const model = input.model.trim();
  const credentialId = input.credentialId.trim();
  let endpoint: URL;

  try {
    endpoint = new URL(input.baseUrl.trim());
  } catch {
    throw new Error("Model endpoint is invalid");
  }

  if (endpoint.protocol !== "https:") {
    throw new Error("Model endpoint must use HTTPS");
  }
  if (
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error("Model endpoint is invalid");
  }
  if (!model) {
    throw new Error("Model name is required");
  }
  if (!credentialId) {
    throw new Error("Credential id is required");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(credentialId)) {
    throw new Error("Credential id contains invalid characters");
  }

  const baseUrl = endpoint.toString().replace(/\/+$/, "");
  return { kind: "byok", baseUrl, model, credentialId };
}
