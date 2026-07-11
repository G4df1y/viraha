import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title}>Viraha</Text>
        <Text style={styles.subtitle}>你的 Companion，从这里开始。</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    color: '#111827',
    fontSize: 42,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 12,
    color: '#4b5563',
    fontSize: 17,
    lineHeight: 26,
  },
});
