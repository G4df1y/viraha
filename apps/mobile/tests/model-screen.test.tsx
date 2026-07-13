import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { ModelConnectionScreen } from '../src/model/ModelConnectionScreen';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe('ModelConnectionScreen', () => {
  it('saves a DeepSeek BYOK connection', async () => {
    const onSave = jest.fn(async () => undefined);

    await render(<ModelConnectionScreen onSave={onSave} />);
    await fireEvent.changeText(screen.getByPlaceholderText('API Key'), 'secret');
    await fireEvent.press(
      screen.getByRole('button', { name: '保存并继续' }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        connection: {
          kind: 'byok',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-chat',
          credentialId: 'primary',
        },
        apiKey: 'secret',
      });
    });
  });

  it('locks saving immediately while the callback is pending', async () => {
    const saving = deferred<void>();
    const onSave = jest.fn(() => saving.promise);

    await render(<ModelConnectionScreen onSave={onSave} />);
    await fireEvent.changeText(screen.getByPlaceholderText('API Key'), 'secret');

    const saveButton = screen.getByRole('button', { name: '保存并继续' });
    await fireEvent.press(saveButton);
    await fireEvent.press(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { disabled: true, name: '保存并继续' }),
    ).toBeDisabled();

    await act(async () => {
      saving.resolve();
      await saving.promise;
    });
  });

  it('reports a readable error, retains the key, and unlocks after failure', async () => {
    const saving = deferred<void>();
    const onSave = jest.fn(() => saving.promise);

    await render(<ModelConnectionScreen onSave={onSave} />);
    const apiKeyInput = screen.getByPlaceholderText('API Key');
    await fireEvent.changeText(apiKeyInput, 'secret');
    await fireEvent.press(
      screen.getByRole('button', { name: '保存并继续' }),
    );

    await act(async () => {
      saving.reject(new Error('storage unavailable'));
      await expect(saving.promise).rejects.toThrow('storage unavailable');
    });

    await waitFor(() => {
      expect(screen.getByText('保存失败，请重试')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('secret')).toBeOnTheScreen();
      expect(
        screen.getByRole('button', {
          disabled: false,
          name: '保存并继续',
        }),
      ).toBeEnabled();
    });
  });
});
