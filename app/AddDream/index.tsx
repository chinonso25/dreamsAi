import JournalEditor from '@/components/JournalEditor';
import { useRef } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import RecorderBottomSheet from '@/components/RecorderBottomSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardView from '@/components/KeyboardView';
import { View } from 'react-native';
import { useJournalColors } from '@/components/journal/theme';

export default function CaptureScreen() {
  const recorder = useRef<BottomSheetModal>(null);
  const { bottom } = useSafeAreaInsets();
  const colors = useJournalColors();
  return <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 22, paddingTop: 8, paddingBottom: Math.max(bottom, 16) }}>
    <KeyboardView>
      <JournalEditor openBottomSheet={() => recorder.current?.present()} />
      <RecorderBottomSheet ref={recorder} />
    </KeyboardView>
  </View>;
}
