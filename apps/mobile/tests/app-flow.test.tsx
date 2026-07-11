import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { VirahaApp, type MobileServices } from '../src/app/VirahaApp';

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
});
