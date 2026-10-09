import { ReactNode, useEffect, useRef } from 'react';
import { Image, ImageSourcePropType, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotionAmbient, MotionPressable, MotionReveal, MotionProgress } from '@/components/motion/Motion';
import { haptic } from '@/util/haptics';

export const palette = { background: '#FAF8FF', ink: '#2A2243', muted: '#756D88', violet: '#6950C5', pale: '#F0EAFC', line: '#E9E3F3', white: '#FFFFFF', green: '#447963' };
export const art = {
  moon: require('@/assets/images/onboarding/dream-moon.png'),
  journal: require('@/assets/images/onboarding/dream-journal.png'),
  voice: require('@/assets/images/onboarding/dream-voice.png'),
};

export function tap() { haptic('selection'); }

export function DreamArt({ source, size = 270 }: { source: ImageSourcePropType; size?: number }) {
  const { width, height } = useWindowDimensions();
  const displaySize = Math.min(size, Math.max(120, width - 72), height < 700 ? Math.round(height * .25) : size);
  return <View style={[ui.artStage, { height: displaySize + 12 }]}>
    <View style={[ui.artGlow, { width: displaySize * .85, height: displaySize * .85, borderRadius: displaySize }]} />
    <MotionAmbient>
      <Image accessible={false} source={source} resizeMode="contain" style={{ width: displaySize, height: displaySize }} />
    </MotionAmbient>
  </View>;
}

export function Button({ label, onPress, disabled, loading }: { label: string; onPress?: () => void; disabled?: boolean; loading?: boolean }) {
  return <MotionPressable haptic="none" accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
    onPress={() => { tap(); onPress?.(); }} disabled={disabled || loading}
    style={({ pressed }) => [ui.button, (disabled || loading) && ui.buttonDisabled, pressed && { opacity: .85 }]}>
    <Text style={ui.buttonText}>{loading ? 'Loading…' : label}</Text>
    {!loading && <Ionicons accessible={false} name="arrow-forward" size={19} color="#fff" />}
  </MotionPressable>;
}

export function OnboardingShell({ children, step = 0, total = 19, onBack, onSkip, footer, dark = false }: {
  children: ReactNode; step?: number; total?: number; onBack?: () => void; onSkip?: () => void; footer: ReactNode; dark?: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  return <SafeAreaView style={[ui.safe, dark && { backgroundColor: '#241D39' }]} edges={['top', 'bottom']}>
    <View style={ui.shell}>
      <View style={ui.header}>
        <View style={{ width: 64 }}>
          {onBack && <MotionPressable haptic="none" onPress={() => { tap(); onBack(); }} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} style={ui.back}>
            <Ionicons accessible={false} name="arrow-back" size={21} color={dark ? '#FFF' : palette.ink} />
          </MotionPressable>}
        </View>
        <View style={ui.wordmark}><Ionicons accessible={false} name="moon" size={15} color={dark ? '#D7CAFF' : palette.violet} /><Text style={[ui.brand, dark && { color: '#FFF' }]}>dream<Text style={{ color: dark ? '#D7CAFF' : palette.violet }}> ai</Text></Text></View>
        <View style={{ width: 64, alignItems: 'flex-end' }}>{onSkip && <MotionPressable haptic="selection" onPress={onSkip} accessibilityRole="button" hitSlop={8} style={ui.back}><Text style={ui.skip}>Skip</Text></MotionPressable>}</View>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel="Onboarding progress" accessibilityValue={{ min: 0, max: total, now: step + 1 }} style={ui.progressTrack}>
        <MotionProgress value={(step + 1) / total} style={ui.progressFill} />
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={ui.scrollContent} showsVerticalScrollIndicator={false}>
        <MotionReveal key={step} style={{ width: '100%' }}>{children}</MotionReveal>
      </ScrollView>
      <View style={[ui.footer, dark && { backgroundColor: '#241D39' }]}>{footer}</View>
    </View>
  </SafeAreaView>;
}

export function Heading({ eyebrow, title, description, dark = false }: { eyebrow: string; title: string; description?: string; dark?: boolean }) {
  const { width } = useWindowDimensions();
  return <View style={ui.heading}>
    <Text style={[ui.eyebrow, dark && { color: '#CEBBFF' }]}>{eyebrow}</Text>
    <Text accessibilityRole="header" style={[ui.title, width < 350 && { fontSize: 28, lineHeight: 34 }, dark && { color: '#FFF' }]}>{title}</Text>
    {description && <Text style={[ui.description, dark && { color: '#C7BED8' }]}>{description}</Text>}
  </View>;
}

export function SmallNote({ children }: { children: ReactNode }) { return <Text style={ui.note}>{children}</Text>; }

export const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  shell: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, height: 64 },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  wordmark: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  brand: { fontFamily: 'Outfit_600SemiBold', fontSize: 21, letterSpacing: -.6, color: palette.ink },
  skip: { color: palette.muted, fontFamily: 'Outfit_400Regular', fontSize: 14 },
  progressTrack: { height: 4, marginHorizontal: 28, borderRadius: 4, backgroundColor: palette.line, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: palette.violet, borderRadius: 4 },
  scrollContent: { paddingHorizontal: 26, paddingTop: 25, paddingBottom: 24, flexGrow: 1 },
  footer: { paddingHorizontal: 26, paddingBottom: 12, paddingTop: 12, gap: 10, backgroundColor: palette.background },
  heading: { alignItems: 'center', gap: 12, marginBottom: 24 },
  eyebrow: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, letterSpacing: 2.3, color: palette.violet, textAlign: 'center' },
  title: { fontFamily: 'Outfit_600SemiBold', fontSize: 33, lineHeight: 39, letterSpacing: -1, textAlign: 'center', color: palette.ink },
  description: { fontFamily: 'Outfit_400Regular', fontSize: 16, lineHeight: 23, textAlign: 'center', color: palette.muted, maxWidth: 370 },
  artStage: { alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  artGlow: { backgroundColor: '#F0EAFB', position: 'absolute' },
  button: { backgroundColor: palette.violet, borderRadius: 22, paddingVertical: 19, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 60 },
  buttonDisabled: { opacity: .45 },
  buttonText: { color: '#FFF', fontFamily: 'Outfit_600SemiBold', fontSize: 17 },
  note: { fontFamily: 'Outfit_400Regular', fontSize: 14, lineHeight: 21, color: palette.muted, textAlign: 'center' },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: palette.line, padding: 20, borderRadius: 22, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 17, color: palette.ink, marginBottom: 5 },
  body: { fontFamily: 'Outfit_400Regular', fontSize: 17, lineHeight: 25, color: palette.muted },
  pill: { alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 7, backgroundColor: palette.pale, borderRadius: 30, marginBottom: 16 },
  pillText: { fontFamily: 'Outfit_500Medium', fontSize: 12, color: palette.violet },
  link: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: palette.muted, textAlign: 'center', paddingVertical: 13 },
});
