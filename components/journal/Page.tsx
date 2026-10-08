import { MotionPressable, MotionReveal } from '@/components/motion/Motion';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useJournalColors } from './theme';
import { useState } from 'react';
import { DreamSort } from './query';

export function PageHeader({ title, subtitle, action = 'settings' }: { title: string; subtitle?: string; action?: 'settings' | 'add' | 'none' }) {
  const c = useJournalColors();
  return <MotionReveal style={s.header}><View style={{ flexGrow: 1, flexBasis: 150 }}><Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[s.title, { color: c.ink }]}>{title}</Text>{subtitle && <Text style={[s.subtitle, { color: c.muted }]}>{subtitle}</Text>}</View>{action !== 'none' && <MotionPressable accessibilityRole="button" accessibilityLabel={action === 'add' ? 'Add dream' : 'Open settings'} onPress={() => router.push(action === 'add' ? '/AddDream' : '/preferences')} style={({ pressed }) => [s.icon, { backgroundColor: c.elevated }, pressed && { opacity: .65 }]}><Ionicons accessible={false} name={action === 'add' ? 'add' : 'settings-outline'} size={22} color={c.accent} /><Text style={[s.link, { color: c.accent }]}>{action === 'add' ? 'Add dream' : 'Settings'}</Text></MotionPressable>}</MotionReveal>;
}
export function JournalNotice({ error, retry }: { error?: string; retry: () => void }) {
  const c = useJournalColors();
  if (!error) return null;
  return <MotionPressable accessibilityRole="button" accessibilityLabel={`${error}. Retry refresh`} onPress={retry} style={[s.notice, { backgroundColor: c.elevated }]}><Ionicons accessible={false} name="cloud-offline-outline" size={18} color={c.muted} /><Text style={[s.small, { color: c.muted, flex: 1 }]}>{error}</Text><Ionicons accessible={false} name="refresh" size={18} color={c.accent} /></MotionPressable>;
}
export function EmptyDreams({ hydrated, error, title, body, action, actionLabel }: { hydrated: boolean; error?: string; title: string; body: string; action?: () => void; actionLabel?: string }) {
  const c = useJournalColors();
  if (!hydrated && !error) return <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />;
  return <MotionReveal subtle style={s.empty}><View style={[s.emptyIcon, { backgroundColor: c.elevated }]}><Ionicons accessible={false} name="moon-outline" size={28} color={c.accent} /></View><Text style={[s.emptyTitle, { color: c.ink }]}>{!hydrated && error ? 'Could not open your journal' : title}</Text><Text style={[s.emptyBody, { color: c.muted }]}>{!hydrated && error ? 'Your saved data is retained. Tap the refresh notice to retry.' : body}</Text>{action && actionLabel && <MotionPressable accessibilityRole="button" onPress={action} style={s.emptyAction}><Text style={[s.link, { color: c.accent }]}>{actionLabel}</Text></MotionPressable>}</MotionReveal>;
}
export function SortButton({ value, onChange }: { value: DreamSort; onChange: (sort: DreamSort) => void }) {
  const c = useJournalColors();
  const [choosing, setChoosing] = useState(false);
  const choose = (sort: DreamSort) => { onChange(sort); setChoosing(false); };
  const open = () => {
    if (Platform.OS === 'web') setChoosing(true);
    else Alert.alert('Sort dreams', 'Choose which dreams appear first.', [{ text: 'Newest first', onPress: () => choose('newest') }, { text: 'Oldest first', onPress: () => choose('oldest') }, { text: 'Cancel', style: 'cancel' }]);
  };
  return <><MotionPressable accessibilityRole="button" haptic="selection" accessibilityLabel={`Sorted ${value === 'newest' ? 'newest' : 'oldest'} first. Change sort order`} onPress={open} style={s.sort}><Ionicons accessible={false} name="swap-vertical-outline" size={18} color={c.muted} /><Text style={[s.small, { color: c.muted }]}>{value === 'newest' ? 'Newest first' : 'Oldest first'}</Text><Ionicons accessible={false} name="chevron-down" size={14} color={c.muted} /></MotionPressable>
    {Platform.OS === 'web' && <Modal transparent visible={choosing} animationType="fade" onRequestClose={() => setChoosing(false)}><View style={s.sortOverlay}><View accessibilityViewIsModal style={[s.sortSheet, { backgroundColor: c.surface }]}><Text accessibilityRole="header" style={[s.emptyTitle, { color: c.ink }]}>Sort dreams</Text>{(['newest', 'oldest'] as const).map(sort => <MotionPressable key={sort} accessibilityRole="button" accessibilityLabel={sort === 'newest' ? 'Newest first' : 'Oldest first'} accessibilityState={{ selected: sort === value }} haptic="selection" onPress={() => choose(sort)} style={[s.sortChoice, { backgroundColor: sort === value ? c.accentSoft : c.background }]}><Text style={[s.small, { color: c.ink }]}>{sort === 'newest' ? 'Newest first' : 'Oldest first'}</Text></MotionPressable>)}<MotionPressable accessibilityRole="button" accessibilityLabel="Cancel sorting" onPress={() => setChoosing(false)} style={s.sortChoice}><Text style={[s.small, { color: c.muted }]}>Cancel</Text></MotionPressable></View></View></Modal>}
  </>;
}
export const pageStyles = StyleSheet.create({ content: { paddingHorizontal: 24, maxWidth: 680, width: '100%', alignSelf: 'center' }, month: { fontFamily: 'Outfit_500Medium', fontSize: 16, marginTop: 18, marginBottom: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, section: { fontFamily: 'Outfit_600SemiBold', fontSize: 20, letterSpacing: -.4 }, link: { fontFamily: 'Outfit_500Medium', fontSize: 16 } });
const s = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 20, paddingBottom: 26 }, title: { fontFamily: 'Outfit_600SemiBold', fontSize: 34, letterSpacing: -1, lineHeight: 41 }, subtitle: { fontFamily: 'Outfit_400Regular', fontSize: 16, lineHeight: 24, marginTop: 5 }, icon: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 6, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, marginBottom: 16 }, small: { fontFamily: 'Outfit_400Regular', fontSize: 16, lineHeight: 24 }, empty: { paddingHorizontal: 20, paddingVertical: 42, alignItems: 'center' }, emptyIcon: { width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }, emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 22, marginBottom: 9, textAlign: 'center' }, emptyBody: { fontFamily: 'Outfit_400Regular', fontSize: 16, lineHeight: 22, textAlign: 'center', maxWidth: 280 }, emptyAction: { minHeight: 44, justifyContent: 'center', marginTop: 12 }, link: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 }, sortOverlay: { flex: 1, backgroundColor: '#100A2470', justifyContent: 'center', padding: 24 }, sortSheet: { alignSelf: 'center', width: '100%', maxWidth: 380, padding: 24, borderRadius: 24, gap: 8 }, sortChoice: { minHeight: 48, padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, sort: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 } });
