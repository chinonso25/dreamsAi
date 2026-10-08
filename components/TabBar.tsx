import { MotionPressable, MotionSelection } from '@/components/motion/Motion';
import { Keyboard, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJournalColors } from './journal/theme';

const tabs = [
  { label: 'Home', path: '/', route: '/(tabs)', icon: 'home', outline: 'home-outline' },
  { label: 'Journal', path: '/journal', route: '/(tabs)/journal', icon: 'book', outline: 'book-outline' },
  { label: 'Search', path: '/search', route: '/(tabs)/search', icon: 'search', outline: 'search-outline' },
] as const;
export function useTabBarHeight() {
  const { fontScale } = useWindowDimensions();
  return Math.max(82, 54 + Math.ceil(18 * fontScale));
}
export function TabBar() {
  const c = useJournalColors();
  const height = useTabBarHeight();
  const { fontScale } = useWindowDimensions();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return <View style={[s.container, { height, bottom: Math.max(12, insets.bottom + 5), backgroundColor: c.surface, borderColor: c.border }]}>{tabs.map(tab => {
    const selected = pathname === tab.path;
    return <MotionPressable haptic="selection" key={`${tab.label}:${fontScale}`} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => { Keyboard.dismiss(); router.navigate(tab.route); }} style={({ pressed }) => [s.tab, pressed && { opacity: .6 }]}><MotionSelection selected={selected} style={[s.icon, { backgroundColor: selected ? c.accentSoft : 'transparent' }]}><Ionicons accessible={false} name={selected ? tab.icon : tab.outline} size={21} color={selected ? c.accent : c.muted} /></MotionSelection><Text maxFontSizeMultiplier={2} style={[s.label, { color: selected ? c.accent : c.muted }]}>{tab.label}</Text></MotionPressable>;
  })}</View>;
}
const s = StyleSheet.create({ container: { position: 'absolute', left: 24, right: 24, minHeight: 82, paddingVertical: 8, borderRadius: 26, borderWidth: 1, flexDirection: 'row', alignItems: 'center', shadowColor: '#201637', shadowOpacity: .06, shadowOffset: { width: 0, height: 5 }, shadowRadius: 18, elevation: 6, maxWidth: 600, alignSelf: 'center' }, tab: { flex: 1, minHeight: 64, paddingVertical: 3, alignItems: 'center', justifyContent: 'center', gap: 3 }, icon: { width: 52, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, label: { fontFamily: 'Outfit_500Medium', fontSize: 14 } });
