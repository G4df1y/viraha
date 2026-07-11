import { render, screen } from '@testing-library/react-native';

import { App } from '../App';

describe('App', () => {
  it('welcomes the user to Viraha', async () => {
    await render(<App />);

    expect(screen.getByText('Viraha')).toBeOnTheScreen();
    expect(screen.getByText('你的 Companion，从这里开始。')).toBeOnTheScreen();
  });
});
