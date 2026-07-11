import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompanionProfile } from '@viraha/companion-core';

import { isAuthenticationError } from '../model/openai-compatible';
import type { StoredMessage } from '../storage/repository';

interface ChatScreenProps {
  companion: CompanionProfile;
  messages: StoredMessage[];
  addMessage: (message: StoredMessage) => Promise<void>;
  complete: (content: string, history: StoredMessage[]) => Promise<string>;
  onChangeConnection: (messages: StoredMessage[]) => void;
}

interface PendingTurn {
  user: StoredMessage;
  history: StoredMessage[];
  userPersisted: boolean;
  reply?: string;
}

const SESSION_ID = 'primary';
const NEAR_LIST_END_THRESHOLD = 80;

export function isNearListEnd({
  contentHeight,
  contentOffsetY,
  layoutHeight,
}: {
  contentHeight: number;
  contentOffsetY: number;
  layoutHeight: number;
}): boolean {
  return (
    contentHeight - layoutHeight - contentOffsetY <= NEAR_LIST_END_THRESHOLD
  );
}

export function ChatScreen({
  addMessage,
  companion,
  complete,
  messages: initialMessages,
  onChangeConnection,
}: ChatScreenProps) {
  const lastInitialMessage = initialMessages.at(-1);
  const recoveredTurn =
    lastInitialMessage?.role === 'user'
      ? {
          user: lastInitialMessage,
          history: initialMessages,
          userPersisted: true,
        }
      : null;
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState(recoveredTurn?.user.content ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticationFailed, setAuthenticationFailed] = useState(false);
  const sendingLocked = useRef(false);
  const pendingTurn = useRef<PendingTurn | null>(recoveredTurn);
  const idSequence = useRef(0);
  const listRef = useRef<FlatList<StoredMessage> | null>(null);
  const isNearBottom = useRef(true);
  const didInitialScroll = useRef(false);

  function createMessage(
    role: StoredMessage['role'],
    content: string,
  ): StoredMessage {
    idSequence.current += 1;
    const createdAt = new Date().toISOString();
    return {
      id: `${role}-${Date.now()}-${idSequence.current}`,
      sessionId: SESSION_ID,
      role,
      content,
      createdAt,
    };
  }

  async function runTurn(turn: PendingTurn) {
    if (!turn.userPersisted) {
      await addMessage(turn.user);
      turn.userPersisted = true;
    }

    if (turn.reply === undefined) {
      turn.reply = await complete(turn.user.content, turn.history);
    }

    const assistant = createMessage('assistant', turn.reply);
    await addMessage(assistant);
    setMessages((current) => [...current, assistant]);
    pendingTurn.current = null;
    setDraft((current) =>
      current.trim() === turn.user.content ? '' : current,
    );
  }

  function handleListScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    isNearBottom.current = isNearListEnd({
      contentHeight: contentSize.height,
      contentOffsetY: contentOffset.y,
      layoutHeight: layoutMeasurement.height,
    });
  }

  function followListContent() {
    if (!didInitialScroll.current || isNearBottom.current) {
      listRef.current?.scrollToEnd({ animated: didInitialScroll.current });
      didInitialScroll.current = true;
    }
  }

  function sendMessage() {
    const content = draft.trim();
    if (!content || sendingLocked.current) {
      return;
    }

    sendingLocked.current = true;
    setSending(true);
    setError(null);
    setAuthenticationFailed(false);

    let turn = pendingTurn.current;
    if (!turn || turn.user.content !== content) {
      const user = createMessage('user', content);
      const history = [...messages, user];
      turn = { user, history, userPersisted: false };
      pendingTurn.current = turn;
      setMessages(history);
    }

    void runTurn(turn)
      .catch((sendError: unknown) => {
        if (isAuthenticationError(sendError)) {
          setAuthenticationFailed(true);
          setError('API Key 无效或已失效，请更新后重试。');
        } else {
          setError('发送失败，请重试');
        }
      })
      .finally(() => {
        sendingLocked.current = false;
        setSending(false);
      });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.title}>
            {companion.name}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            与 {companion.userDisplayName} 的私人对话
          </Text>
        </View>
        <FlatList
          contentContainerStyle={styles.messageList}
          data={messages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={followListContent}
          onScroll={handleListScroll}
          ref={listRef}
          renderItem={({ item }) => (
            <View
              style={[
                styles.message,
                item.role === 'user'
                  ? styles.userMessage
                  : styles.assistantMessage,
              ]}
            >
              <Text style={styles.messageText}>{item.content}</Text>
            </View>
          )}
          scrollEventThrottle={16}
          testID="chat-message-list"
        />
        {error && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        )}
        {authenticationFailed && (
          <Pressable
            accessibilityLabel="更新 API Key"
            accessibilityRole="button"
            onPress={() => onChangeConnection(messages)}
            style={styles.changeConnectionButton}
          >
            <Text style={styles.changeConnectionText}>更新 API Key</Text>
          </Pressable>
        )}
        <View style={styles.composer}>
          <TextInput
            multiline
            onChangeText={setDraft}
            placeholder={`和 ${companion.name} 说点什么…`}
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel="发送"
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft.trim() || sending }}
            disabled={!draft.trim() || sending}
            onPress={sendMessage}
            style={[
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>发送</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F7' },
  screen: { flex: 1 },
  header: {
    minHeight: 68,
    borderBottomColor: '#D7DBE0',
    borderBottomWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  title: { color: '#171A1F', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#60666F', fontSize: 13, marginTop: 2 },
  messageList: { flexGrow: 1, gap: 10, padding: 16 },
  message: {
    borderRadius: 8,
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#DCE8E2' },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DBE0',
    borderWidth: 1,
  },
  messageText: { color: '#171A1F', fontSize: 16, lineHeight: 23 },
  error: {
    color: '#B42318',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  changeConnectionButton: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  changeConnectionText: {
    color: '#245E45',
    fontSize: 15,
    fontWeight: '700',
  },
  composer: {
    alignItems: 'flex-end',
    borderTopColor: '#D7DBE0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 72,
    padding: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B8BEC7',
    borderRadius: 8,
    borderWidth: 1,
    color: '#171A1F',
    flex: 1,
    fontSize: 16,
    maxHeight: 112,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#171A1F',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    minWidth: 64,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
