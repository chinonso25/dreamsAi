import JournalEditor from '@/components/JournalEditor';
import { useRef } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import RecorderBottomSheet from '@/components/RecorderBottomSheet';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardView from '@/components/KeyboardView';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MotionPressable } from '@/components/motion/Motion';
import { useJournalColors } from '@/components/journal/theme';

export default function CaptureScreen() {
  const recorder = useRef<BottomSheetModal>(null);
  const { bottom } = useSafeAreaInsets();
  const colors = useJournalColors();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 22, paddingTop: 8, paddingBottom: Math.max(bottom, 16) }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <MotionPressable accessibilityRole="button" accessibilityLabel="Close capture and keep draft" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Feather accessible={false} name="x" size={20} color={colors.accent} /><Text style={{ fontFamily: 'Outfit_500Medium', fontSize: 16, color: colors.accent }}>Close</Text></MotionPressable>
      <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: 14, color: colors.muted }}>Dream draft</Text>
    </View>
    <KeyboardView>
      <JournalEditor openBottomSheet={() => recorder.current?.present()} />
      <RecorderBottomSheet ref={recorder} />
    </KeyboardView>
  </SafeAreaView>;
}
