import { MotionPressable } from '@/components/motion/Motion';
import { Journal } from '@/types';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dreamDateKey, dreamPreview, entryTags, readableDreamDate, SearchScope } from './journal/query';
import { useJournalColors } from './journal/theme';

export default function DreamListItem({ dream, query, scope }: { dream: Journal; query?: string; scope?: SearchScope }) {
  const colors = useJournalColors();
  const router = useRouter();
  const pending = dream.sync_status !== 'synced';
  const preview = dreamPreview(dream, query, scope);
  return <MotionPressable accessibilityRole="button" accessibilityHint="Opens your dream to read it or listen to its recording" accessibilityLabel={`${dream.title || 'Untitled dream'}, ${readableDreamDate(dreamDateKey(dream))}${dream.is_starred ? ', favorite' : ''}`} onPress={() => router.push({ pathname: '/Dream/[id]', params: { id: String(dream.id) } })} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: .75 }]}>
    <View style={styles.top}><Text style={[styles.date, { color: colors.muted }]}>{readableDreamDate(dreamDateKey(dream))}</Text><View style={styles.icons}>{Boolean(dream.local_audio_uri || dream.audio_key || dream.audio_url) && <Ionicons accessible={false} name="mic-outline" size={16} color={colors.muted} />}{dream.is_starred && <Ionicons accessible={false} name="star" size={16} color={colors.accent} />}</View></View>
    <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>{dream.title || 'A dream to remember'}</Text>
    {preview.source && <Text style={[styles.matchSource, { color: colors.accent }]}>{preview.source === 'Transcript' ? 'Dream text' : preview.source}</Text>}
    <Text style={[styles.body, { color: colors.muted }]} numberOfLines={preview.source ? 3 : 2}>{preview.text}</Text>
    {(dream.mood || entryTags(dream).length > 0) && <View style={styles.bottom}><View style={styles.tags}>{entryTags(dream).slice(0, 2).map(tag => <View key={tag} style={[styles.tag, { backgroundColor: colors.elevated }]}><Text style={[styles.tagText, { color: colors.accent }]} numberOfLines={1}>{tag}</Text></View>)}{dream.mood && <Text style={[styles.mood, { color: colors.muted }]}>{dream.mood}</Text>}</View></View>}
    {(pending || dream.processing_status === 'processing' || dream.processing_status === 'pending' || dream.processing_status === 'error') && <View style={styles.status}><View style={[styles.dot, { backgroundColor: dream.sync_status === 'error' || dream.processing_status === 'error' ? colors.warning : colors.success }]} /><Text style={[styles.statusText, { color: colors.muted }]}>{dream.sync_status === 'error' ? 'Saved on this device · sync needs attention' : dream.processing_status === 'error' ? 'Saved · processing needs attention' : dream.processing_status === 'processing' || dream.processing_status === 'pending' ? 'Saved · preparing your dream' : 'Saved on this device'}</Text></View>}
  </MotionPressable>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 21, padding: 18, marginBottom: 12 }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }, date: { flex: 1, fontSize: 14, fontFamily: 'Outfit_500Medium' }, icons: { flexDirection: 'row', gap: 9 }, title: { fontSize: 21, lineHeight: 26, letterSpacing: -.5, fontFamily: 'Outfit_600SemiBold', marginBottom: 8 }, body: { fontSize: 17, lineHeight: 25, fontFamily: 'Outfit_400Regular' }, bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 13 }, tags: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, marginRight: 10, flexWrap: 'wrap' }, tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, maxWidth: '100%' }, tagText: { fontSize: 14, fontFamily: 'Outfit_500Medium' }, mood: { fontSize: 14, fontFamily: 'Outfit_400Regular', textTransform: 'capitalize' }, matchSource: { fontFamily: 'Outfit_500Medium', fontSize: 14, marginBottom: 5 }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13 }, dot: { width: 5, height: 5, borderRadius: 3 }, statusText: { flex: 1, fontSize: 14, fontFamily: 'Outfit_400Regular' } });
