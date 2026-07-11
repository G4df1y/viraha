import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OnboardingFlow } from '../src/onboarding/OnboardingFlow';

describe('OnboardingFlow', () => {
  it('completes the adult onboarding path', async () => {
    const onComplete = jest.fn();

    await render(<OnboardingFlow onComplete={onComplete} />);

    fireEvent.press(screen.getByText('18 岁及以上'));
    await waitFor(() => {
      expect(screen.getByText('健身伙伴')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('健身伙伴'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('例如：神龙')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByPlaceholderText('例如：神龙'), '神龙');
    await waitFor(() => {
      expect(screen.getByDisplayValue('神龙')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('继续'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Arete')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('开始聊天'));

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

    fireEvent.press(screen.getByText('14–17 岁'));

    await waitFor(() => {
      expect(screen.queryByText('恋爱陪伴')).toBeNull();
      expect(screen.getByText('健身伙伴')).toBeOnTheScreen();
    });
  });

  it('requires a guardian path for users under 14', async () => {
    const onComplete = jest.fn();

    await render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.press(screen.getByText('未满 14 岁'));

    await waitFor(() => {
      expect(screen.getByText('请由监护人完成设置')).toBeOnTheScreen();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
