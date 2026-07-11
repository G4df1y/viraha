/**
 * Log / trace secret redaction.
 *
 * Privacy requirement (backlog P0.3): logs and Trace must never print a
 * Provider API Key, Cookie, or channel signature. Because Viraha is
 * self-hosted and the EventStore is the single source of trace truth, the
 * redactor runs at the persist boundary so secrets are stripped before they
 * ever reach SQLite — and before any console.error can echo them.
 *
 * The redactor is deliberately pattern-based and visible (no black-box
 * filter), matching the same transparency principle as the boundary scanner.
 */

const SECRET_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // API keys: DeepSeek sk-..., Anthropic sk-ant-..., OpenAI sk-...
  { re: /sk-(?:ant-)?[A-Za-z0-9_-]{8,}/g, replace: "sk-[redacted]" },
  // Authorization / Bearer tokens
  { re: /Bearer\s+[A-Za-z0-9._\-+/=]{8,}/gi, replace: "Bearer [redacted]" },
  { re: /Authorization\s*:\s*[^\s,;]+/gi, replace: "Authorization: [redacted]" },
  // The web identity cookie
  { re: /viraha_web_id\s*=\s*[A-Za-z0-9\-]+/gi, replace: "viraha_web_id=[redacted]" },
  // Channel webhook signatures (Lark / QQ / generic)
  { re: /x-lark-signature\s*[:=]\s*[A-Za-z0-9_\-+/=]+/gi, replace: "x-lark-signature=[redacted]" },
  { re: /x-qq-signature\s*[:=]\s*[A-Za-z0-9_\-+/=]+/gi, replace: "x-qq-signature=[redacted]" },
  { re: /x-hub-signature-256\s*[:=]\s*[A-Za-z0-9_\-+/=]+/gi, replace: "x-hub-signature-256=[redacted]" },
]

/**
 * Redact known secret patterns from a string. Returns a new string; the input
 * is never mutated. Ordinary user text passes through unchanged.
 */
export function redactSecrets(input: string): string {
  if (!input) return input
  let out = input
  for (const { re, replace } of SECRET_PATTERNS) {
    out = out.replace(re, replace)
  }
  return out
}

/**
 * Redact secrets inside an arbitrary JSON-serializable payload. Returns the
 * redacted payload as a new object (the original is not mutated). Used by the
 * EventStore before persist so stored traces never contain secrets.
 */
export function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  try {
    const text = JSON.stringify(payload)
    const redacted = redactSecrets(text)
    return JSON.parse(redacted) as Record<string, unknown>
  } catch {
    // If the payload cannot be round-tripped through JSON, return it as-is
    // rather than dropping it entirely.
    return payload
  }
}
