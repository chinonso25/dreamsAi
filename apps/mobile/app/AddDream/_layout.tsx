import { MotionPressable } from '@/components/motion/Motion';
import { Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useJournalColors } from '@/components/journal/theme';

export default function Layout() {
  const router = useRouter();
  const colors = useJournalColors();
  return <Stack><Stack.Screen name="index" options={{ title: '', headerBackVisible: false, headerLeft: () => null, headerTitle: () => null, headerShadowVisible: false, headerStyle: { backgroundColor: colors.background }, headerRight: () => <MotionPressable accessibilityRole="button" accessibilityLabel="Close capture and keep draft" onPress={() => router.back()} style={{ minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center' }}><Feather accessible={false} name="x" size={22} color={colors.ink} /><Text maxFontSizeMultiplier={2} style={{ color: colors.ink, fontFamily: 'Outfit_500Medium', fontSize: 16 }}>Close</Text></MotionPressable> }} /></Stack>;
}
