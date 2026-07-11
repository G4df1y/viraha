import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { CompanionProfile } from '@viraha/companion-core';

import { ChatScreen } from '../src/chat/ChatScreen';
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

describe('ChatScreen', () => {
  it('persists a user turn and the assistant reply', async () => {
    const addMessage = jest.fn(async (_message: StoredMessage) => undefined);
    const complete = jest.fn(
      async (_content: string, _history: StoredMessage[]) =>
        '今天从轻量训练开始。',
    );

    await render(
      <ChatScreen
        addMessage={addMessage}
        companion={companion}
        complete={complete}
        messages={[]}
      />,
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('和 Arete 说点什么…'),
      '今天练什么？',
    );
    await fireEvent.press(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByText('今天从轻量训练开始。')).toBeOnTheScreen();
      expect(addMessage).toHaveBeenCalledTimes(2);
    });
    expect(addMessage.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ role: 'user', content: '今天练什么？' }),
    );
    expect(addMessage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: '今天从轻量训练开始。',
      }),
    );
  });

  it('keeps the draft and retries only the failed assistant request', async () => {
    const addMessage = jest.fn(async (_message: StoredMessage) => undefined);
    const complete = jest
      .fn<Promise<string>, [string, StoredMessage[]]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('先做十分钟热身。');

    await render(
      <ChatScreen
        addMessage={addMessage}
        companion={companion}
        complete={complete}
        messages={[]}
      />,
    );
    const input = screen.getByPlaceholderText('和 Arete 说点什么…');
    await fireEvent.changeText(input, '今天练什么？');
    await fireEvent.press(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByText('发送失败，请重试')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('今天练什么？')).toBeOnTheScreen();
    });
    await fireEvent.press(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByText('先做十分钟热身。')).toBeOnTheScreen();
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(
      addMessage.mock.calls.filter(([message]) => message.role === 'user'),
    ).toHaveLength(1);
  });

  it('locks sending before React commits the pending state', async () => {
    let resolve!: (reply: string) => void;
    const completion = new Promise<string>((resolvePromise) => {
      resolve = resolvePromise;
    });
    const addMessage = jest.fn(async (_message: StoredMessage) => undefined);
    const complete = jest.fn(
      (_content: string, _history: StoredMessage[]) => completion,
    );

    await render(
      <ChatScreen
        addMessage={addMessage}
        companion={companion}
        complete={complete}
        messages={[]}
      />,
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('和 Arete 说点什么…'),
      '今天练什么？',
    );
    const send = screen.getByRole('button', { name: '发送' });
    await fireEvent.press(send);
    await fireEvent.press(send);

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolve('好。');
      await completion;
    });
  });
});
