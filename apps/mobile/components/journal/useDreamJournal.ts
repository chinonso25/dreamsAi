import { useTabBarHeight } from '@/components/TabBar';
import { useWindowDimensions } from 'react-native';
import { useSyncExternalStore } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthProvider';
import { hydrateJournal, refreshDreams, useJournalStore } from '@/util/journal';
import { useRecordingPlayback } from '@/util/audio-playback';
import { onlineManager, useIsFetching } from '@tanstack/react-query';
import { journalQueryKey } from '@/util/query-client';

const subscribeToConnection = (listener: () => void) => onlineManager.subscribe(listener);
const getOnline = () => onlineManager.isOnline();

export function useDreamJournal() {
  const { user } = useAuth();
  const allEntries = useJournalStore(state => state.entries);
  const entries = allEntries.filter(entry => !entry.deleted_at && (entry.user_id === user?.id || entry.user_id === 'device'));
  const hydrated = useJournalStore(state => state.hydrated);
  const syncing = useJournalStore(state => state.syncing);
  const fetching = useIsFetching({ queryKey: journalQueryKey(user?.id || '') }) > 0;
  const online = useSyncExternalStore(subscribeToConnection, getOnline, getOnline);
  const journalError = useJournalStore(state => state.error);
  const track = useRecordingPlayback(state => state.track);
  const insets = useSafeAreaInsets();
  const tabHeight = useTabBarHeight();
  const { fontScale } = useWindowDimensions();
  const refresh = async () => {
    try { await hydrateJournal(); await refreshDreams(); }
    catch { /* Hydration and cloud failures are recorded by the journal store. */ }
  };
  const error = journalError || (!online ? 'You’re offline. Your saved dreams are here; changes will sync when you reconnect.' : undefined);
  return { entries, hydrated, syncing: syncing || fetching, offline: !online, error, refresh, bottomSpace: insets.bottom + tabHeight + 36 + (track ? Math.max(90, 42 * fontScale + 32) : 0) };
}
