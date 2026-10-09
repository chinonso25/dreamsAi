import { StyleSheet, View } from 'react-native';
import { useJournalColors } from './journal/theme';

/** Recording bars are microphone measurements; playback bars form a progress track. */
export function AudioWaveform({ levels, progress = 0 }: { levels?: number[]; progress?: number }) {
  const c = useJournalColors();
  const bars = levels ? Array.from({ length: 40 }, (_, i) => levels[i - (40 - levels.length)] ?? 0) : Array.from({ length: 40 }, (_, i) => .18 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * .45)) * .75);
  return <View accessible={false} style={s.wave}>{bars.map((level, i) => <View key={i} style={[s.bar, { height: 4 + Math.max(0, Math.min(1, level)) * 44, backgroundColor: levels || i / 40 < progress ? c.accent : c.border }]} />)}</View>;
}
export function recordingLevel(decibels?: number) { return Number.isFinite(decibels) ? Math.max(0, Math.min(1, (decibels! + 60) / 60)) : 0; }
const s = StyleSheet.create({ wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 54, width: '100%' }, bar: { flex: 1, maxWidth: 5, minWidth: 1, borderRadius: 4 } });
