import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { VirahaApp, type MobileServices } from '../src/app/VirahaApp';
import type { CompanionProfile } from '@viraha/companion-core';
import { ModelRequestError } from '../src/model/openai-compatible';
import type { StoredMessage } from '../src/storage/repository';

const companion: CompanionProfile = {
  id: 'c1',
  templateId: 'fitness-coach',
  category: 'fitness',
  name: 'Arete',
  userDisplayName: '神龙',
  userAgeBand: 'adult',
  description: 'A practical training companion.',
  createdAt: '2026-07-12T00:00:00.000Z',
};

function services(overrides: Partial<MobileServices> = {}): MobileServices {
  return {
    boot: async () => ({
      companion: null,
      connection: null,
      apiKey: null,
      messages: [],
    }),
    saveCompanion: async () => undefined,
    saveConnection: async () => undefined,
    addMessage: async () => undefined,
    complete: async () => 'ok',
    ...overrides,
  };
}

describe('VirahaApp flow', () => {
  it('shows onboarding when boot has no companion', async () => {
    await render(<VirahaApp services={services()} />);

    await waitFor(() => {
      expect(screen.getByText('请选择年龄范围')).toBeOnTheScreen();
    });
  });

  it('recovers from a boot failure through retry', async () => {
    const boot = jest
      .fn<ReturnType<MobileServices['boot']>, []>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({
        companion: null,
        connection: null,
        apiKey: null,
        messages: [],
      });

    await render(<VirahaApp services={services({ boot })} />);

    await waitFor(() => {
      expect(screen.getByText('database unavailable')).toBeOnTheScreen();
    });
    await fireEvent.press(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => {
      expect(screen.getByText('请选择年龄范围')).toBeOnTheScreen();
    });
    expect(boot).toHaveBeenCalledTimes(2);
  });

  it('keeps stored history after reconnecting a missing credential', async () => {
    const storedMessage = {
      id: 'm1',
      sessionId: 'primary',
      role: 'assistant' as const,
      content: '上次聊到轻量训练。',
      createdAt: '2026-07-12T00:01:00.000Z',
    };
    const saveConnection = jest.fn(async () => undefined);

    await render(
      <VirahaApp
        services={services({
          boot: async () => ({
            companion,
            connection: null,
            apiKey: null,
            messages: [storedMessage],
          }),
          saveConnection,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('连接模型')).toBeOnTheScreen();
    });
    await fireEvent.changeText(screen.getByPlaceholderText('API Key'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: '保存并继续' }));

    await waitFor(() => {
      expect(screen.getByText('上次聊到轻量训练。')).toBeOnTheScreen();
    });
    expect(saveConnection).toHaveBeenCalledTimes(1);
  });

  it('updates a revoked key and resumes the persisted user turn', async () => {
    const addMessage = jest.fn(async (_message: StoredMessage) => undefined);
    const complete = jest
      .fn<Promise<string>, [string, Parameters<MobileServices['complete']>[1]]>()
      .mockRejectedValueOnce(new ModelRequestError(401, 'Invalid API key'))
      .mockResolvedValueOnce('今天从轻量训练开始。');
    const saveConnection = jest.fn(async () => undefined);

    await render(
      <VirahaApp
        services={services({
          boot: async () => ({
            companion,
            connection: {
              kind: 'byok',
              baseUrl: 'https://api.deepseek.com',
              model: 'deepseek-chat',
              credentialId: 'primary',
            },
            apiKey: 'revoked',
            messages: [],
          }),
          addMessage,
          complete,
          saveConnection,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('和 Arete 说点什么…')).toBeOnTheScreen();
    });
    await fireEvent.changeText(
      screen.getByPlaceholderText('和 Arete 说点什么…'),
      '今天练什么？',
    );
    await fireEvent.press(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(
        screen.getByText('API Key 无效或已失效，请更新后重试。'),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('button', { name: '更新 API Key' }),
      ).toBeOnTheScreen();
    });
    await fireEvent.press(
      screen.getByRole('button', { name: '更新 API Key' }),
    );
    await waitFor(() => {
      expect(screen.getByText('连接模型')).toBeOnTheScreen();
    });
    await fireEvent.changeText(screen.getByPlaceholderText('API Key'), 'new-key');
    await fireEvent.press(screen.getByRole('button', { name: '保存并继续' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('今天练什么？')).toBeOnTheScreen();
    });
    await fireEvent.press(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByText('今天从轻量训练开始。')).toBeOnTheScreen();
    });
    expect(saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'new-key' }),
    );
    expect(complete).toHaveBeenCalledTimes(2);
    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(addMessage.mock.calls.map(([message]) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });
});
