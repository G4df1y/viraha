import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import { VirahaApp } from './src/app/VirahaApp';

const ZERO_SAFE_AREA_METRICS = {
  frame: { height: 0, width: 0, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

export function App() {
  return (
    <SafeAreaProvider
      initialMetrics={initialWindowMetrics ?? ZERO_SAFE_AREA_METRICS}
    >
      <View style={styles.app}>
        <StatusBar style="dark" />
        <VirahaApp />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#F7F8F7',
  },
});
