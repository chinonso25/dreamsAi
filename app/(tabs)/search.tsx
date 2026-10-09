import { MotionPressable, MotionReveal, useMotionPreference } from '@/components/motion/Motion';
import { useDeferredValue, useState } from 'react';
import { Keyboard, Modal, ScrollView, SectionList, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DreamListItem from '@/components/DreamListItem';
import { DreamCalendar } from '@/components/journal/Calendar';
import { DreamSort, SearchScope, dreamDateKey, dreamSections, filterDreams, journalThemes, localDateKey, readableDreamDate } from '@/components/journal/query';
import { EmptyDreams, JournalNotice, PageHeader, pageStyles, SortButton } from '@/components/journal/Page';
import { useJournalColors } from '@/components/journal/theme';
import { useDreamJournal } from '@/components/journal/useDreamJournal';

type Period = 'any' | 'week' | 'month' | 'year';
const periods: { value: Period; label: string }[] = [{ value: 'any', label: 'Any time' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'This month' }, { value: 'year', label: 'This year' }];
const scopes: { value: SearchScope; label: string }[] = [{ value: 'all', label: 'Everything' }, { value: 'themes', label: 'Themes' }, { value: 'transcripts', label: 'Dream text' }];
export default function SearchScreen() {
  const { theme, themeRequest } = useLocalSearchParams<{ theme?: string; themeRequest?: string }>();
  return <SearchContent key={`${themeRequest || ''}:${theme || ''}`} initialTheme={theme} />;
}
function SearchContent({ initialTheme }: { initialTheme?: string }) {
  const c = useJournalColors();
  const { fontScale } = useWindowDimensions();
  const reduced = useMotionPreference();
  const { entries, hydrated, syncing, error, refresh, bottomSpace } = useDreamJournal();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [scope, setScope] = useState<SearchScope>('all');
  const [theme, setTheme] = useState<string | undefined>(initialTheme);
  const [sort, setSort] = useState<DreamSort>('newest');
  const [date, setDate] = useState<string>();
  const [calendar, setCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => localDateKey(new Date()).slice(0, 7));
  const [period, setPeriod] = useState<Period>('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const today = localDateKey(new Date());
  const from = period === 'week' ? localDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 6)) : period === 'month' ? `${today.slice(0, 7)}-01` : period === 'year' ? `${today.slice(0, 4)}-01-01` : undefined;
  const matching = filterDreams(entries, { query: deferredQuery, scope, tag: theme, favorites, sort, from, to: from ? today : undefined });
  const results = date ? matching.filter(entry => dreamDateKey(entry) === date) : calendar ? matching.filter(entry => dreamDateKey(entry).startsWith(calendarMonth)) : matching;
  const themes = journalThemes(entries);
  const sections = dreamSections(results);
  const filterCount = Number(scope !== 'all') + Number(Boolean(theme)) + Number(favorites) + Number(period !== 'any') + Number(sort !== 'newest');
  const hasFilters = Boolean(query.trim() || theme || favorites || date || period !== 'any' || scope !== 'all');
  const resetFilters = () => { setTheme(undefined); setDate(undefined); setFavorites(false); setPeriod('any'); setScope('all'); setSort('newest'); };
  const clear = () => { setQuery(''); resetFilters(); setCalendar(false); };
  const toggleCalendar = () => { Keyboard.dismiss(); if (!calendar) setCalendarMonth(date?.slice(0, 7) || today.slice(0, 7)); else setDate(undefined); setCalendar(!calendar); };
  const choice = (label: string, selected: boolean, onPress: () => void, expand: boolean | 'half' = false) => <MotionPressable key={label} haptic="selection" accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.choice, expand && (fontScale > (expand === 'half' ? 1.8 : 1.3) ? { width: '100%' } : { flex: 1 }), { backgroundColor: selected ? c.accentSoft : c.background, borderColor: selected ? c.accentSoft : c.border }]}><Text style={[s.choiceText, { color: selected ? c.accent : c.muted }]}>{label}</Text></MotionPressable>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
    <MotionReveal style={{ flex: 1 }}><SectionList key={fontScale} sections={sections} keyExtractor={item => item.id} renderItem={({ item }) => <DreamListItem dream={item} query={deferredQuery} scope={scope} />} renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={[pageStyles.month, { color: c.muted }]}>{section.title}</Text>} stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} refreshing={syncing} onRefresh={refresh} contentContainerStyle={[pageStyles.content, { paddingBottom: bottomSpace }]} ListHeaderComponent={<>
      <PageHeader title="Search" action="none" />
      <View style={[s.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons accessible={false} name="search-outline" size={21} color={c.accent} />
        <TextInput accessibilityLabel="Search dreams" placeholder={scope === 'themes' ? 'Search themes' : scope === 'transcripts' ? 'Search dream text' : 'Search all your dreams'} placeholderTextColor={c.muted} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} autoCapitalize="none" autoCorrect={false} style={[s.input, { color: c.ink }]} />
        {query !== '' && <MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel="Clear search text" onPress={() => setQuery('')} style={s.iconButton}><Ionicons accessible={false} name="close-circle" size={19} color={c.muted} /></MotionPressable>}
      </View>
      <View style={[s.toolbar, fontScale > 1.3 && { flexWrap: 'wrap' }]}>
        <Text accessibilityLiveRegion="polite" style={[s.results, { color: c.muted }, fontScale > 1.3 && { flexBasis: '100%' }]}>{date ? readableDreamDate(date) : hasFilters || calendar ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'All dreams'}</Text>
        <MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel="Calendar" accessibilityState={{ selected: calendar }} onPress={toggleCalendar} style={[s.tool, { backgroundColor: calendar ? c.accentSoft : 'transparent' }]}><Ionicons accessible={false} name="calendar-outline" size={18} color={calendar ? c.accent : c.muted} /><Text style={[s.toolText, { color: calendar ? c.accent : c.muted }]}>Calendar</Text></MotionPressable>
        <MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel={`Filters${filterCount ? `, ${filterCount} active` : ''}`} onPress={() => { Keyboard.dismiss(); setFiltersOpen(true); }} style={[s.tool, { backgroundColor: filterCount ? c.accentSoft : 'transparent' }]}><Ionicons accessible={false} name="options-outline" size={18} color={filterCount ? c.accent : c.muted} /><Text style={[s.toolText, { color: filterCount ? c.accent : c.muted }]}>Filters{filterCount ? ` · ${filterCount}` : ''}</Text></MotionPressable>
      </View>
      {theme && <MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel={`Remove theme filter ${theme}`} onPress={() => setTheme(undefined)} style={[s.theme, { backgroundColor: c.accentSoft }]}><Text style={[s.choiceText, { color: c.accent }]}>{theme}</Text><Ionicons accessible={false} name="close" size={15} color={c.accent} /></MotionPressable>}
      {calendar && <MotionReveal style={s.calendar}><DreamCalendar selectedDate={date} dates={matching.map(dreamDateKey)} onMonthChange={month => { setCalendarMonth(month); setDate(undefined); }} onSelect={value => { setDate(value === date ? undefined : value); setCalendar(false); }} /><View style={pageStyles.row}><Text style={[s.calendarHint, { color: c.muted, flex: 1 }]}>Tap a date to find dreams.</Text><MotionPressable haptic="selection" accessibilityRole="button" onPress={() => { setDate(undefined); setCalendar(false); }} style={s.textButton}><Text style={[s.toolText, { color: c.accent }]}>All dates</Text></MotionPressable></View></MotionReveal>}
      <JournalNotice error={error} retry={refresh} />
    </>} ListEmptyComponent={<EmptyDreams hydrated={hydrated} error={error} title={hasFilters || calendar ? 'No dreams found' : 'Your dreams will live here'} body={hasFilters || calendar ? 'Try another word or date.' : 'Add a dream, then come back to find it.'} action={hasFilters || calendar ? clear : () => router.push('/AddDream')} actionLabel={hasFilters || calendar ? 'Clear search & filters' : 'Add a dream'} />} /></MotionReveal>
    <Modal key={fontScale} visible={filtersOpen} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={() => setFiltersOpen(false)}>
      <View style={s.overlay}><SafeAreaView edges={['bottom']} style={[s.sheet, { backgroundColor: c.surface }]}>
        <View style={pageStyles.row}><Text accessibilityRole="header" style={[pageStyles.section, { color: c.ink }]}>Filters</Text><MotionPressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setFiltersOpen(false)} style={[s.iconButton, { minWidth: 64, width: 'auto' }]}><Text maxFontSizeMultiplier={2} style={[s.toolText, { color: c.muted }]}>Close</Text></MotionPressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          <Text style={[s.sectionLabel, { color: c.muted }]}>Search in</Text><View style={s.choices}>{scopes.map(item => choice(item.label, scope === item.value, () => setScope(item.value), true))}</View>
          <Text style={[s.sectionLabel, { color: c.muted }]}>When</Text><View style={{ gap: 8 }}>{[0, 2].map(start => <View key={start} style={s.choices}>{periods.slice(start, start + 2).map(item => choice(item.label, period === item.value, () => { setPeriod(item.value); setDate(undefined); }, 'half'))}</View>)}</View>
          <MotionPressable haptic="selection" accessibilityRole="checkbox" accessibilityLabel="Favorites only" accessibilityState={{ checked: favorites }} onPress={() => setFavorites(!favorites)} style={[s.filterRow, { borderColor: c.border }]}><Text style={[s.rowText, { color: c.ink }]}>Favorites only</Text><Ionicons accessible={false} name={favorites ? 'checkbox' : 'square-outline'} size={22} color={favorites ? c.accent : c.muted} /></MotionPressable>
          <View style={[s.filterRow, { borderColor: c.border }]}><Text style={[s.rowText, { color: c.ink }]}>Order</Text><SortButton value={sort} onChange={setSort} /></View>
          {themes.length > 0 && <><MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel="Browse themes" accessibilityState={{ expanded: themesOpen }} onPress={() => setThemesOpen(!themesOpen)} style={[s.filterRow, { borderColor: c.border }]}><Text style={[s.rowText, { color: c.ink }]}>Browse themes</Text><Ionicons accessible={false} name={themesOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} /></MotionPressable>{themesOpen && <MotionReveal subtle style={[s.choices, { paddingTop: 12 }]}>{themes.map(item => choice(item.name, theme === item.name, () => setTheme(theme === item.name ? undefined : item.name)))}</MotionReveal>}</>}
        </ScrollView>
        <View style={s.sheetActions}><MotionPressable haptic="selection" accessibilityRole="button" onPress={resetFilters} style={s.reset}><Text style={[s.rowText, { color: c.muted }]}>Clear filters</Text></MotionPressable><MotionPressable accessibilityRole="button" onPress={() => setFiltersOpen(false)} style={[s.done, { backgroundColor: c.accent }]}><Text style={[s.doneText, { color: c.surface === '#FFFFFF' ? '#FFFFFF' : c.background }]}>Show dreams</Text></MotionPressable></View>
      </SafeAreaView></View>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  search: { borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, minHeight: 56, gap: 10 }, input: { flex: 1, minWidth: 0, fontFamily: 'Outfit_400Regular', fontSize: 16, paddingVertical: 17 }, iconButton: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 12, marginBottom: 2 }, results: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: 16, marginRight: 4 }, tool: { flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 9, borderRadius: 12 }, toolText: { fontFamily: 'Outfit_500Medium', fontSize: 16 }, theme: { flexDirection: 'row', gap: 10, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 13, minHeight: 44, borderRadius: 12, marginTop: 8 },
  calendar: { marginTop: 12 }, calendarHint: { fontFamily: 'Outfit_400Regular', fontSize: 14 }, textButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#100A2470' }, sheet: { padding: 24, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' }, sectionLabel: { fontFamily: 'Outfit_400Regular', fontSize: 16, marginTop: 20, marginBottom: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }, choiceText: { fontFamily: 'Outfit_500Medium', fontSize: 16, textAlign: 'center' }, filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 62, gap: 12, flexWrap: 'wrap', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 4 }, rowText: { fontFamily: 'Outfit_400Regular', fontSize: 16 }, sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }, reset: { minHeight: 50, paddingHorizontal: 12, justifyContent: 'center' }, done: { flexGrow: 1, flexBasis: 140, paddingVertical: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, doneText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
});
