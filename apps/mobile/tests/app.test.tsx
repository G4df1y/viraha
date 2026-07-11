import { render, screen } from '@testing-library/react-native';

import { App } from '../App';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

describe('App', () => {
  it('starts the Viraha onboarding flow', async () => {
    await render(<App />);

    expect(screen.getByText('请选择年龄范围')).toBeOnTheScreen();
    expect(screen.getByText('18 岁及以上')).toBeOnTheScreen();
  });
});
