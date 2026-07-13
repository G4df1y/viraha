import type { ChatMessage } from '@viraha/companion-core';

export type Fetcher = typeof fetch;

export class ModelRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ModelRequestError';
    this.status = status;
  }
}

export function isAuthenticationError(
  error: unknown,
): error is ModelRequestError {
  return (
    error instanceof ModelRequestError &&
    (error.status === 401 || error.status === 403)
  );
}

interface CompletionPayload {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function parsePayload(body: string): CompletionPayload | undefined {
  if (!body.trim()) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(body);
    return payload && typeof payload === 'object'
      ? (payload as CompletionPayload)
      : undefined;
  } catch {
    return undefined;
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  const endpoint = new URL(baseUrl);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/chat/completions`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

export class OpenAICompatibleGateway {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async complete(input: {
    baseUrl: string;
    model: string;
    apiKey: string;
    messages: ChatMessage[];
  }): Promise<string> {
    const response = await this.fetcher(chatCompletionsUrl(input.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: false,
      }),
    });
    const payload = parsePayload(await response.text());

    if (!response.ok) {
      const rawErrorMessage = payload?.error?.message;
      const errorMessage =
        typeof rawErrorMessage === 'string' ? rawErrorMessage.trim() : '';
      throw new ModelRequestError(
        response.status,
        errorMessage || `Model request failed (${response.status})`,
      );
    }

    if (!payload) {
      throw new Error('Model returned an invalid response');
    }

    const rawContent = payload.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    if (!content) {
      throw new Error('Model returned an empty response');
    }

    return content;
  }
}
