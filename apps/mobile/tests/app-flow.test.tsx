import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { VirahaApp, type MobileServices } from '../src/app/VirahaApp';
import type { CompanionProfile } from '@viraha/companion-core';

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
});
