import { Stack } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

export default function CaptureLayout() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Stack screenOptions={{ headerShown: false }} /></SafeAreaProvider>;
}
