import { useMemo, useRef, useState } from 'react';
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
  BUILTIN_TEMPLATES,
  createCompanion,
  evaluatePackAccess,
  type CompanionCategory,
  type CompanionProfile,
  type CompanionTemplate,
  type UserAgeBand,
} from '@viraha/companion-core';

type Step = 'age' | 'child' | 'category' | 'user' | 'name';

interface OnboardingFlowProps {
  onComplete: (companion: CompanionProfile) => void | Promise<void>;
}

const CATEGORY_LABELS: Record<CompanionCategory, string> = {
  gentle: '温柔陪伴',
  fitness: '健身伙伴',
  study: '学习伙伴',
  romance: '恋爱陪伴',
  mental_support: '心理支持',
  fiction: '小说角色',
  custom: '自定义',
};

const AGE_BY_BAND: Record<UserAgeBand, number> = {
  under14: 13,
  teen: 15,
  adult: 18,
};

const DEFAULT_TEMPLATE = BUILTIN_TEMPLATES[0]!;

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>('age');
  const [ageBand, setAgeBand] = useState<UserAgeBand>('adult');
  const [template, setTemplate] =
    useState<CompanionTemplate>(DEFAULT_TEMPLATE);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [companionName, setCompanionName] = useState(
    DEFAULT_TEMPLATE.defaultName,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const completionLocked = useRef(false);

  const availableTemplates = useMemo(
    () =>
      BUILTIN_TEMPLATES.filter(
        (candidate) =>
          evaluatePackAccess(candidate, {
            age: AGE_BY_BAND[ageBand],
            guardianApproved: false,
          }).allowed,
      ),
    [ageBand],
  );

  function chooseAge(nextAgeBand: UserAgeBand) {
    setAgeBand(nextAgeBand);
    setStep(nextAgeBand === 'under14' ? 'child' : 'category');
  }

  function chooseTemplate(nextTemplate: CompanionTemplate) {
    setTemplate(nextTemplate);
    setCompanionName(nextTemplate.defaultName);
    setStep('user');
  }

  function completeOnboarding() {
    if (completionLocked.current) {
      return;
    }

    completionLocked.current = true;
    setSubmitting(true);
    setSubmissionError(null);

    try {
      void Promise.resolve(
        onComplete(
          createCompanion({
            template,
            companionName,
            userDisplayName,
            userAgeBand: ageBand,
            id: `companion-${Date.now()}`,
            now: new Date().toISOString(),
          }),
        ),
      ).catch(() => {
        completionLocked.current = false;
        setSubmitting(false);
        setSubmissionError('创建失败，请重试');
      });
    } catch {
      completionLocked.current = false;
      setSubmitting(false);
      setSubmissionError('创建失败，请重试');
    }
  }

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
          {step === 'age' && (
            <>
              <Text style={styles.title}>请选择年龄范围</Text>
              <Choice label="未满 14 岁" onPress={() => chooseAge('under14')} />
              <Choice label="14–17 岁" onPress={() => chooseAge('teen')} />
              <Choice label="18 岁及以上" onPress={() => chooseAge('adult')} />
            </>
          )}

          {step === 'child' && (
            <>
              <Text style={styles.title}>请由监护人完成设置</Text>
              <Text style={styles.body}>
                未满 14 岁的用户需要经过验证的监护人同意。该流程将在青少年保护阶段启用。
              </Text>
              <PrimaryButton label="返回" onPress={() => setStep('age')} />
            </>
          )}

          {step === 'category' && (
            <>
              <Text style={styles.title}>你希望 TA 是谁？</Text>
              {availableTemplates.map((candidate) => (
                <Choice
                  key={candidate.id}
                  label={CATEGORY_LABELS[candidate.category]}
                  onPress={() => chooseTemplate(candidate)}
                />
              ))}
            </>
          )}

          {step === 'user' && (
            <>
              <Text style={styles.title}>TA 应该怎么称呼你？</Text>
              <TextInput
                autoFocus
                onChangeText={setUserDisplayName}
                placeholder="例如：神龙"
                style={styles.input}
                value={userDisplayName}
              />
              <PrimaryButton
                disabled={!userDisplayName.trim()}
                label="继续"
                onPress={() => setStep('name')}
              />
            </>
          )}

          {step === 'name' && (
            <>
              <Text style={styles.title}>希望 TA 怎么称呼自己？</Text>
              <TextInput
                autoFocus
                onChangeText={setCompanionName}
                placeholder="例如：Arete"
                style={styles.input}
                value={companionName}
              />
              {submissionError && (
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  {submissionError}
                </Text>
              )}
              <PrimaryButton
                disabled={!companionName.trim() || submitting}
                label="开始聊天"
                onPress={completeOnboarding}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.choice}
    >
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
  body: {
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    color: '#B42318',
    fontSize: 15,
  },
  choice: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DBE0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  choiceText: {
    color: '#171A1F',
    fontSize: 17,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DBE0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#171A1F',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
