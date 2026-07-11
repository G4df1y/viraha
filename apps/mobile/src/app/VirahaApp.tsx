import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  normalizeModelConnection,
  type ByokModelConnection,
  type CompanionProfile,
} from '@viraha/companion-core';

import { ChatScreen } from '../chat/ChatScreen';
import { ModelConnectionScreen } from '../model/ModelConnectionScreen';
import { ProviderCredentialStore } from '../model/credential-store';
import { OpenAICompatibleGateway } from '../model/openai-compatible';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { openMobileDatabase } from '../storage/database';
import { MobileRepository, type StoredMessage } from '../storage/repository';
import { createMobileSchema } from '../storage/schema';

export interface BootResult {
  companion: CompanionProfile | null;
  connection: ByokModelConnection | null;
  apiKey: string | null;
  messages: StoredMessage[];
}

export interface MobileServices {
  boot(): Promise<BootResult>;
  saveCompanion(companion: CompanionProfile): Promise<void>;
  saveConnection(value: {
    connection: ByokModelConnection;
    apiKey: string;
  }): Promise<void>;
  addMessage(message: StoredMessage): Promise<void>;
  complete(content: string, history: StoredMessage[]): Promise<string>;
}

interface Resources {
  repository: MobileRepository;
  credentials: ProviderCredentialStore;
  gateway: OpenAICompatibleGateway;
}

const PRIMARY_ID = 'primary';

function systemPrompt(companion: CompanionProfile): string {
  const base = [
    `你是 ${companion.name}，正在陪伴 ${companion.userDisplayName}。`,
    '诚实说明自己是 AI，不冒充人类。',
    '支持用户自主决定，不操纵、胁迫或制造依赖。',
    '坚持和平与非暴力，不鼓励仇恨，也不对任何群体进行非人化描述。',
  ];
  if (companion.userAgeBand === 'teen') {
    base.push(
      'Youth Mode：禁止成人、恋爱、操纵、危险、赌博、酒精及其他高风险内容；鼓励讨论校园、家人朋友、健康，并在需要时寻求可信成年人帮助。',
    );
  }
  return base.join('\n');
}

export function createMobileServices(): MobileServices {
  let activeCompanion: CompanionProfile | null = null;
  let activeConnection: ByokModelConnection | null = null;
  let activeApiKey: string | null = null;
  let resourcesPromise: Promise<Resources> | null = null;

  function resources(): Promise<Resources> {
    if (resourcesPromise) {
      return resourcesPromise;
    }

    const pending = (async () => {
      const database = await openMobileDatabase();
      await createMobileSchema(database);
      return {
        repository: new MobileRepository(database),
        credentials: new ProviderCredentialStore(),
        gateway: new OpenAICompatibleGateway(),
      };
    })();
    resourcesPromise = pending;
    void pending.catch(() => {
      if (resourcesPromise === pending) {
        resourcesPromise = null;
      }
    });
    return pending;
  }

  return {
    async boot() {
      const { credentials, repository } = await resources();
      const companion = await repository.getCompanion();
      let connection: ByokModelConnection | null = null;
      let apiKey: string | null = null;
      let messages: StoredMessage[] = [];

      if (companion) {
        await repository.createSession({
          id: PRIMARY_ID,
          companionId: companion.id,
          createdAt: companion.createdAt,
        });
        messages = await repository.listMessages(PRIMARY_ID);
      }

      const storedConnection = await repository.getConnection(PRIMARY_ID);
      if (storedConnection) {
        try {
          connection = normalizeModelConnection(storedConnection);
          apiKey = await credentials.read(connection.credentialId);
        } catch {
          connection = null;
          apiKey = null;
        }
      }

      activeCompanion = companion;
      activeConnection = connection;
      activeApiKey = apiKey;
      return { companion, connection, apiKey, messages };
    },

    async saveCompanion(companion) {
      const { repository } = await resources();
      await repository.saveCompanion(companion);
      await repository.createSession({
        id: PRIMARY_ID,
        companionId: companion.id,
        createdAt: companion.createdAt,
      });
      activeCompanion = companion;
    },

    async saveConnection({ connection: rawConnection, apiKey }) {
      const connection = normalizeModelConnection(rawConnection);
      const { credentials, repository } = await resources();
      await credentials.save(connection.credentialId, apiKey);
      await repository.saveConnection(PRIMARY_ID, connection);
      activeConnection = connection;
      activeApiKey = apiKey;
    },

    async addMessage(message) {
      const { repository } = await resources();
      await repository.addMessage(message);
    },

    async complete(content, history) {
      if (!activeCompanion || !activeConnection || !activeApiKey) {
        throw new Error('模型连接尚未准备好');
      }
      const connection = normalizeModelConnection(activeConnection);
      const { gateway } = await resources();
      const chatHistory = history.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }));
      if (
        chatHistory.at(-1)?.role !== 'user' ||
        chatHistory.at(-1)?.content !== content
      ) {
        chatHistory.push({ role: 'user', content });
      }
      return gateway.complete({
        baseUrl: connection.baseUrl,
        model: connection.model,
        apiKey: activeApiKey,
        messages: [
          { role: 'system', content: systemPrompt(activeCompanion) },
          ...chatHistory,
        ],
      });
    },
  };
}

type AppState =
  | { name: 'booting' }
  | { name: 'fatal'; message: string }
  | { name: 'onboarding' }
  | { name: 'connection'; companion: CompanionProfile }
  | {
      name: 'chat';
      companion: CompanionProfile;
      messages: StoredMessage[];
    };

export function VirahaApp({ services }: { services?: MobileServices }) {
  const defaultServices = useRef<MobileServices | null>(null);
  if (!services && !defaultServices.current) {
    defaultServices.current = createMobileServices();
  }
  const activeServices = services ?? defaultServices.current!;
  const [state, setState] = useState<AppState>({ name: 'booting' });
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ name: 'booting' });
    void activeServices.boot().then(
      (result) => {
        if (!active) return;
        if (!result.companion) {
          setState({ name: 'onboarding' });
        } else if (!result.connection || !result.apiKey) {
          setState({ name: 'connection', companion: result.companion });
        } else {
          setState({
            name: 'chat',
            companion: result.companion,
            messages: result.messages,
          });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({ name: 'fatal', message: readableError(error) });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [activeServices, bootAttempt]);

  const saveCompanion = useCallback(
    async (companion: CompanionProfile) => {
      try {
        await activeServices.saveCompanion(companion);
        setState({ name: 'connection', companion });
      } catch (error) {
        setState({ name: 'fatal', message: readableError(error) });
      }
    },
    [activeServices],
  );

  if (state.name === 'booting') {
    return <CenteredText label="正在启动…" />;
  }
  if (state.name === 'fatal') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.fatal}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {state.message}
          </Text>
          <Pressable
            accessibilityLabel="重试"
            accessibilityRole="button"
            onPress={() => setBootAttempt((attempt) => attempt + 1)}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  if (state.name === 'onboarding') {
    return <OnboardingFlow onComplete={saveCompanion} />;
  }
  if (state.name === 'connection') {
    return (
      <ModelConnectionScreen
        onSave={async (value) => {
          try {
            await activeServices.saveConnection(value);
            setState({
              name: 'chat',
              companion: state.companion,
              messages: [],
            });
          } catch (error) {
            setState({ name: 'fatal', message: readableError(error) });
          }
        }}
      />
    );
  }
  return (
    <ChatScreen
      addMessage={activeServices.addMessage}
      companion={state.companion}
      complete={activeServices.complete}
      messages={state.messages}
    />
  );
}

function readableError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : '应用暂时无法启动';
}

function CenteredText({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <Text style={styles.loading}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F7' },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loading: { color: '#60666F', fontSize: 16 },
  fatal: {
    alignItems: 'stretch',
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    padding: 24,
  },
  error: { color: '#B42318', fontSize: 16, lineHeight: 24 },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#171A1F',
    borderRadius: 8,
    minWidth: 88,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
