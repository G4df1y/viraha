import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { OnboardingFlow } from '../src/onboarding/OnboardingFlow';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function reachCompanionNameStep(onComplete: jest.Mock) {
  await render(<OnboardingFlow onComplete={onComplete} />);

  await fireEvent.press(screen.getByRole('button', { name: '18 岁及以上' }));
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: '健身伙伴' }),
    ).toBeOnTheScreen();
  });
  await fireEvent.press(screen.getByRole('button', { name: '健身伙伴' }));
  await waitFor(() => {
    expect(screen.getByPlaceholderText('例如：神龙')).toBeOnTheScreen();
  });
  await fireEvent.changeText(
    screen.getByPlaceholderText('例如：神龙'),
    '神龙',
  );
  await waitFor(() => {
    expect(screen.getByDisplayValue('神龙')).toBeOnTheScreen();
  });
  await fireEvent.press(screen.getByRole('button', { name: '继续' }));
  await waitFor(() => {
    expect(screen.getByDisplayValue('Arete')).toBeOnTheScreen();
  });
}

describe('OnboardingFlow', () => {
  it('completes the adult onboarding path', async () => {
    const onComplete = jest.fn();

    await render(<OnboardingFlow onComplete={onComplete} />);

    await fireEvent.press(
      screen.getByRole('button', { name: '18 岁及以上' }),
    );
    await waitFor(() => {
      expect(screen.getByText('健身伙伴')).toBeOnTheScreen();
    });

    await fireEvent.press(screen.getByRole('button', { name: '健身伙伴' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('例如：神龙')).toBeOnTheScreen();
    });

    await fireEvent.changeText(
      screen.getByPlaceholderText('例如：神龙'),
      '神龙',
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue('神龙')).toBeOnTheScreen();
    });

    await fireEvent.press(screen.getByText('继续'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Arete')).toBeOnTheScreen();
    });

    await fireEvent.press(screen.getByText('开始聊天'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'fitness',
          name: 'Arete',
          userDisplayName: '神龙',
          userAgeBand: 'adult',
        }),
      );
    });
  });

  it('hides adult-only romance companionship from teens', async () => {
    await render(<OnboardingFlow onComplete={jest.fn()} />);

    await fireEvent.press(screen.getByText('14–17 岁'));

    await waitFor(() => {
      expect(screen.queryByText('恋爱陪伴')).toBeNull();
      expect(screen.getByText('健身伙伴')).toBeOnTheScreen();
    });
  });

  it('requires a guardian path for users under 14', async () => {
    const onComplete = jest.fn();

    await render(<OnboardingFlow onComplete={onComplete} />);
    await fireEvent.press(screen.getByText('未满 14 岁'));

    await waitFor(() => {
      expect(screen.getByText('请由监护人完成设置')).toBeOnTheScreen();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  it('locks completion immediately while the callback is pending', async () => {
    const completion = deferred<void>();
    const onComplete = jest.fn(() => completion.promise);
    await reachCompanionNameStep(onComplete);

    const submitButton = screen.getByRole('button', { name: '开始聊天' });
    await fireEvent.press(submitButton);
    await fireEvent.press(submitButton);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { disabled: true, name: '开始聊天' }),
    ).toBeDisabled();

    await act(async () => {
      completion.resolve();
      await completion.promise;
    });
  });

  it('unlocks completion and reports an error when the callback fails', async () => {
    const completion = deferred<void>();
    const onComplete = jest.fn(() => completion.promise);
    await reachCompanionNameStep(onComplete);

    await fireEvent.press(
      screen.getByRole('button', { name: '开始聊天' }),
    );
    await act(async () => {
      completion.reject(new Error('storage unavailable'));
      await expect(completion.promise).rejects.toThrow('storage unavailable');
    });

    await waitFor(() => {
      expect(screen.getByText('创建失败，请重试')).toBeOnTheScreen();
      expect(
        screen.getByRole('button', { disabled: false, name: '开始聊天' }),
      ).toBeEnabled();
    });
  });
});
