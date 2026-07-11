import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { OnboardingFlow } from './src/onboarding/OnboardingFlow';

export function App() {
  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <OnboardingFlow onComplete={() => undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#F7F8F7',
  },
});
