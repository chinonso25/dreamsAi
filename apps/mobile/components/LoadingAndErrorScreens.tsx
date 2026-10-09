import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Brand } from './Brand';
import { MotionPressable } from './motion/Motion';
import { useJournalColors } from './journal/theme';

export function LoadingScreen({ message = 'Opening your dreams…' }: { message?: string }) {
  const c = useJournalColors();
  return <View style={[s.screen, { backgroundColor: c.background }]}><Brand centered /><View style={s.status}><ActivityIndicator color={c.accent} /><Text accessibilityLiveRegion="polite" style={[s.body, { color: c.muted }]}>{message}</Text></View></View>;
}
export function ErrorScreen({ error, retry }: { error: Error; retry?: () => void }) {
  const c = useJournalColors();
  return <View style={[s.screen, { backgroundColor: c.background }]}><Brand centered /><Text style={[s.title, { color: c.ink }]}>Could not load dreams</Text><Text style={[s.body, { color: c.muted }]}>{error.message}</Text>{retry && <MotionPressable accessibilityRole="button" onPress={retry} style={[s.retry, { backgroundColor: c.accent }]}><Text style={[s.button, { color: c.background }]}>Try again</Text></MotionPressable>}</View>;
}
const s = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 24 }, status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }, title: { fontFamily: 'Outfit_600SemiBold', fontSize: 22, textAlign: 'center' }, body: { fontFamily: 'Outfit_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' }, retry: { minHeight: 52, paddingHorizontal: 28, justifyContent: 'center', borderRadius: 16 }, button: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 } });
