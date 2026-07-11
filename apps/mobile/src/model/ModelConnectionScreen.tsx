import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  normalizeModelConnection,
  type ByokModelConnection,
} from '@viraha/companion-core';

interface ModelConnectionScreenProps {
  onSave: (value: {
    connection: ByokModelConnection;
    apiKey: string;
  }) => Promise<void>;
}

const DEEPSEEK_CONNECTION = normalizeModelConnection({
  kind: 'byok',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  credentialId: 'primary',
});

export function ModelConnectionScreen({
  onSave,
}: ModelConnectionScreenProps) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingLocked = useRef(false);

  function saveConnection() {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey || savingLocked.current) {
      return;
    }

    savingLocked.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      void Promise.resolve(
        onSave({
          connection: DEEPSEEK_CONNECTION,
          apiKey: trimmedApiKey,
        }),
      ).catch(() => {
        savingLocked.current = false;
        setSaving(false);
        setSaveError('保存失败，请重试');
      });
    } catch {
      savingLocked.current = false;
      setSaving(false);
      setSaveError('保存失败，请重试');
    }
  }

  const saveDisabled = !apiKey.trim() || saving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>连接模型</Text>
          <Text style={styles.note}>
            第一个开发版本使用你自己的 DeepSeek API。匿名官方额度将在下一阶段加入。
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setApiKey}
            placeholder="API Key"
            secureTextEntry
            style={styles.input}
            value={apiKey}
          />
          {saveError && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {saveError}
            </Text>
          )}
          <Pressable
            accessibilityLabel="保存并继续"
            accessibilityRole="button"
            accessibilityState={{ disabled: saveDisabled }}
            disabled={saveDisabled}
            onPress={saveConnection}
            style={[styles.button, saveDisabled && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>保存并继续</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F8F7',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 32,
  },
  title: {
    color: '#171A1F',
    fontSize: 24,
    fontWeight: '700',
  },
  note: {
    color: '#60666F',
    fontSize: 16,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B8BEC7',
    borderRadius: 8,
    borderWidth: 1,
    color: '#171A1F',
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: {
    color: '#B42318',
    fontSize: 15,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#171A1F',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
