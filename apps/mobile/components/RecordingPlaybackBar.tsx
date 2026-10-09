import { useTabBarHeight } from './TabBar';
import { MotionPressable, MotionReveal } from '@/components/motion/Motion';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthProvider';
import { useJournalStore } from '@/util/journal';
import { useCaptureDraft } from '@/util/drafts';
import { setRecordingPlaybackAccessGuard, validateRecordingPlaybackAccess, stopRecordingPlayback, toggleRecordingPlayback, useRecordingPlayback } from '@/util/audio-playback';
import { secondsToMMSS } from '@/util';
import { getCurrentUser } from '@/util/auth-client';
import { useJournalColors } from './journal/theme';

export default function RecordingPlaybackBar() {
  const { track, status, loading, error } = useRecordingPlayback();
  const { user } = useAuth();
  const entries = useJournalStore(state => state.entries);
  const draft = useCaptureDraft(state => state.draft);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tabHeight = useTabBarHeight();
  const colors = useJournalColors();
  useEffect(() => {
    setRecordingPlaybackAccessGuard(current => {
      const owner = getCurrentUser()?.id;
      const currentDraft = useCaptureDraft.getState().draft;
      const allowedOwner = current.ownerId === 'device' ? !current.draft || !currentDraft?.ownerId || currentDraft.ownerId === 'device' : current.ownerId === owner;
      const exists = current.draft
        ? currentDraft?.id === current.id && currentDraft.audioUri === current.uri && (!currentDraft.ownerId || currentDraft.ownerId === current.ownerId)
        : useJournalStore.getState().entries.some(entry => entry.id === current.id && entry.user_id === current.ownerId);
      return allowedOwner && exists;
    });
    const journalSubscription = useJournalStore.subscribe(() => validateRecordingPlaybackAccess());
    const draftSubscription = useCaptureDraft.subscribe(() => validateRecordingPlaybackAccess());
    return () => {
      journalSubscription(); draftSubscription(); stopRecordingPlayback(); setRecordingPlaybackAccessGuard(undefined);
    };
  }, []);
  useEffect(() => { validateRecordingPlaybackAccess(); }, [track, user?.id, entries, draft]);
  if (!track || pathname === `/Dream/${track.id}` || (track.draft && pathname.startsWith('/AddDream')) || pathname.startsWith('/onboarding')) return null;
  const tabs = ['/', '/journal', '/search'].includes(pathname);
  return <MotionReveal style={[styles.bar, { bottom: insets.bottom + (tabs ? tabHeight + 15 : 12), backgroundColor: colors.surface, borderColor: colors.border }]}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={`${track.title}. ${loading ? 'Opening recording' : error ? 'Recording could not play' : status?.playing ? 'Playing' : 'Paused'}. ${secondsToMMSS(status?.currentTime || 0)}${status?.duration ? ` of ${secondsToMMSS(status.duration)}` : ''}`} accessibilityHint="Opens this recording and its playback controls" onPress={() => track.draft ? router.push('/AddDream') : router.push({ pathname: '/Dream/[id]', params: { id: track.id } })} style={styles.info}>
      <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{track.title}</Text>
      <Text style={[styles.caption, { color: error ? colors.danger : colors.muted }]}>{error ? 'Could not play · tap Play to retry' : loading ? 'Opening recording…' : `${status?.playing ? 'Playing' : status?.didJustFinish || (status?.duration && status.currentTime >= status.duration) ? 'Finished' : 'Paused'} · ${secondsToMMSS(status?.currentTime || 0)}`}</Text>
    </MotionPressable>
    <MotionPressable accessibilityRole="button" accessibilityLabel={loading ? 'Cancel opening recording' : status?.playing ? 'Pause recording' : 'Play recording'} onPress={() => { void toggleRecordingPlayback().catch(() => undefined); }} style={styles.button}>
      {loading ? <ActivityIndicator color={colors.accent} /> : <Ionicons accessible={false} name={status?.playing ? 'pause' : 'play'} size={23} color={colors.accent} />}
    </MotionPressable>
    <MotionPressable accessibilityRole="button" accessibilityLabel="Stop recording playback" onPress={stopRecordingPlayback} style={styles.button}><Ionicons accessible={false} name="close" size={22} color={colors.muted} /></MotionPressable>
  </MotionReveal>;
}
const styles = StyleSheet.create({ bar: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 8, elevation: 9, shadowColor: '#201637', shadowOpacity: .12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }, info: { flex: 1, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', gap: 3 }, title: { fontFamily: 'Outfit_500Medium', fontSize: 16 }, caption: { fontFamily: 'Outfit_400Regular', fontSize: 14 }, button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
