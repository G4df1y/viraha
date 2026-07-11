import type { ChatMessage } from '@viraha/companion-core';

export type Fetcher = typeof fetch;

interface CompletionPayload {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class OpenAICompatibleGateway {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async complete(input: {
    baseUrl: string;
    model: string;
    apiKey: string;
    messages: ChatMessage[];
  }): Promise<string> {
    const response = await this.fetcher(`${input.baseUrl}/chat/completions`, {
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
    const payload = (await response.json()) as CompletionPayload;

    if (!response.ok) {
      throw new Error(
        payload.error?.message || `Model request failed (${response.status})`,
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Model returned an empty response');
    }

    return content;
  }
}
