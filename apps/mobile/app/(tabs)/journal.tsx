import { MotionPressable, MotionReveal } from '@/components/motion/Motion';
import { useState } from 'react';
import { SectionList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DreamListItem from '@/components/DreamListItem';
import { useDreamJournal } from '@/components/journal/useDreamJournal';
import { DreamSort, dreamSections, filterDreams } from '@/components/journal/query';
import { EmptyDreams, JournalNotice, PageHeader, pageStyles, SortButton } from '@/components/journal/Page';
import { useJournalColors } from '@/components/journal/theme';

export default function JournalScreen() {
  const c = useJournalColors();
  const { fontScale } = useWindowDimensions();
  const { entries, hydrated, syncing, error, refresh, bottomSpace } = useDreamJournal();
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState<DreamSort>('newest');
  const sections = dreamSections(filterDreams(entries, { favorites, sort }));
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
    <MotionReveal style={{ flex: 1 }}><SectionList key={fontScale} sections={sections} keyExtractor={item => item.id} renderItem={({ item }) => <DreamListItem dream={item} />} renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={[pageStyles.month, { color: c.muted }]}>{section.title}</Text>} stickySectionHeadersEnabled={false} showsVerticalScrollIndicator={false} refreshing={syncing} onRefresh={refresh} contentContainerStyle={[pageStyles.content, { paddingBottom: bottomSpace }]} ListHeaderComponent={<>
      <PageHeader title="Journal" subtitle="All your saved dreams." action="add" />
      <View style={s.controls}><View style={[s.segment, { backgroundColor: c.elevated }, fontScale > 1.5 && { flexDirection: 'column' }]}>{[false, true].map(value => <MotionPressable haptic="selection" key={String(value)} accessibilityRole="button" accessibilityLabel={value ? 'Favorites' : 'All dreams'} accessibilityState={{ selected: favorites === value }} onPress={() => setFavorites(value)} style={[s.option, favorites === value && { backgroundColor: c.surface }]}>{value && <Ionicons accessible={false} name="star-outline" size={14} color={favorites ? c.accent : c.muted} />}<Text style={[s.label, { color: favorites === value ? c.ink : c.muted }]}>{value ? 'Favorites' : 'All dreams'}</Text></MotionPressable>)}</View><SortButton value={sort} onChange={setSort} /></View>
      <JournalNotice error={error} retry={refresh} />
    </>} ListEmptyComponent={<EmptyDreams hydrated={hydrated} error={error} title={favorites ? 'No favorites yet' : 'No dreams yet'} body={favorites ? 'Open a dream and tap Favorite to save it here.' : 'Write a few words or record your first dream.'} action={favorites ? () => setFavorites(false) : () => router.push('/AddDream')} actionLabel={favorites ? 'See all dreams' : 'Add a dream'} />} /></MotionReveal>
  </SafeAreaView>;
}
const s = StyleSheet.create({ controls: { gap: 6, alignItems: 'flex-end' }, segment: { alignSelf: 'stretch', flexDirection: 'row', borderRadius: 14, padding: 4 }, option: { flex: 1, minHeight: 48, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, label: { fontFamily: 'Outfit_500Medium', fontSize: 16 } });
