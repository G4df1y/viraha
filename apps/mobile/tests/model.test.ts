import { ProviderCredentialStore } from '../src/model/credential-store';
import { OpenAICompatibleGateway } from '../src/model/openai-compatible';

describe('mobile model adapters', () => {
  it('stores API keys in secure storage', async () => {
    const values = new Map<string, string>();
    const assertValidKey = (key: string) => {
      if (!/^[\w.-]+$/.test(key)) {
        throw new Error('Invalid SecureStore key');
      }
    };
    const store = new ProviderCredentialStore({
      getItemAsync: async (key) => {
        assertValidKey(key);
        return values.get(key) ?? null;
      },
      setItemAsync: async (key, value) => {
        assertValidKey(key);
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        assertValidKey(key);
        values.delete(key);
      },
    });

    await store.save('deepseek-primary', 'secret');

    expect(await store.read('deepseek-primary')).toBe('secret');
    expect(values.get('provider.deepseek-primary')).toBe('secret');

    await store.remove('deepseek-primary');

    expect(await store.read('deepseek-primary')).toBeNull();
  });

  it('rejects an invalid credential id before accessing storage', async () => {
    const storage = {
      getItemAsync: jest.fn(async () => null),
      setItemAsync: jest.fn(async () => undefined),
      deleteItemAsync: jest.fn(async () => undefined),
    };
    const store = new ProviderCredentialStore(storage);

    await expect(store.save('deepseek:primary', 'secret')).rejects.toThrow(
      'Credential id contains invalid characters',
    );
    expect(storage.setItemAsync).not.toHaveBeenCalled();
  });

  it('sends a BYOK chat request directly to the configured endpoint', async () => {
    const fetcher = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '你好，神龙。' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    const reply = await gateway.complete({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'secret',
      messages: [{ role: 'user', content: '你好' }],
    });

    expect(reply).toBe('你好，神龙。');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('appends chat completions to an endpoint path safely', async () => {
    const fetcher = jest.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      ),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    await gateway.complete({
      baseUrl: 'https://gateway.example.com/v1/?ignored=true#fragment',
      model: 'deepseek-chat',
      apiKey: 'secret',
      messages: [{ role: 'user', content: '你好' }],
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces an OpenAI-compatible error message', async () => {
    const fetcher = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    await expect(
      gateway.complete({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'secret',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('Invalid API key');
  });

  it.each(['<html>Unauthorized</html>', ''])(
    'uses a stable error for a non-JSON failure response',
    async (body) => {
      const fetcher = jest.fn(async () => new Response(body, { status: 401 }));
      const gateway = new OpenAICompatibleGateway(fetcher);

      await expect(
        gateway.complete({
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-chat',
          apiKey: 'secret',
          messages: [{ role: 'user', content: '你好' }],
        }),
      ).rejects.toThrow('Model request failed (401)');
    },
  );

  it('ignores a non-string provider error message', async () => {
    const fetcher = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: 401 } }), { status: 401 }),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    await expect(
      gateway.complete({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'secret',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('Model request failed (401)');
  });

  it('rejects an invalid successful response', async () => {
    const fetcher = jest.fn(async () =>
      new Response('<html>Not JSON</html>', { status: 200 }),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    await expect(
      gateway.complete({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'secret',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('Model returned an invalid response');
  });

  it('does not replace a network error', async () => {
    const networkError = new Error('Network request failed');
    const fetcher = jest.fn(async () => {
      throw networkError;
    });
    const gateway = new OpenAICompatibleGateway(fetcher);

    await expect(
      gateway.complete({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'secret',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toBe(networkError);
  });

  it('rejects an empty model response', async () => {
    const fetcher = jest.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    await expect(
      gateway.complete({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'secret',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('Model returned an empty response');
  });

  it('rejects a non-string model response', async () => {
    const fetcher = jest.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 42 } }] }), {
        status: 200,
      }),
    );
    const gateway = new OpenAICompatibleGateway(fetcher);

    await expect(
      gateway.complete({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'secret',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('Model returned an empty response');
  });
});
